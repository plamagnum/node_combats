const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Bot = require('../models/Bot');
const Item = require('../models/Item');
const Battle = require('../models/Battle');
const PvpBattle = require('../models/PvpBattle');
const LoginEvent = require('../models/LoginEvent');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);
router.param('id', (req, res, next, v) =>
  mongoose.isValidObjectId(v)
    ? next()
    : res.status(400).json({ error: 'Некоректний ідентифікатор' }),
);

// ==================== CRUD КОРИСТУВАЧІВ / ПЕРСОНАЖІВ ====================

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    await Promise.all(users.map((u) => u.populateGear()));
    res.json({ users: users.map((u) => u.toSafeJSON()) });
  } catch (err) {
    console.error('[ADMIN]', err);
    res.status(500).json({ error: 'Не вдалося завантажити користувачів' });
  }
});

// Детальні дані всіх користувачів: IP, user-agent, активність, статус блокування
router.get('/users-details', async (req, res) => {
  try {
    const users = await User.find().sort({ lastSeenAt: -1, createdAt: -1 });
    await Promise.all(users.map((u) => u.populateGear()));
    res.json({ users: users.map((u) => u.toAdminDetails()) });
  } catch (err) {
    console.error('[ADMIN]', err);
    res.status(500).json({ error: 'Не вдалося завантажити детальні дані' });
  }
});

// Деталі одного користувача + історія входів + кількість боїв
router.get('/users/:id/details', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
    await user.populateGear();
    const [events, pveBattles, pvpBattles, ips] = await Promise.all([
      LoginEvent.find({ $or: [{ userId: user._id }, { username: user.username }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Battle.countDocuments({ playerId: user._id }),
      PvpBattle.countDocuments({ $or: [{ challengerId: user._id }, { opponentId: user._id }] }),
      LoginEvent.distinct('ip', { userId: user._id }),
    ]);
    res.json({ user: user.toAdminDetails(), events, pveBattles, pvpBattles, knownIps: ips });
  } catch (err) {
    console.error('[ADMIN]', err);
    res.status(500).json({ error: 'Не вдалося завантажити деталі користувача' });
  }
});

router.post('/users/:id/ban', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Не можна заблокувати власний акаунт' });
    }
    const ban = req.body.banned !== false;
    const reason = String(req.body.reason || '').slice(0, 200);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBanned: ban, banReason: ban ? reason : '' } },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
    return res.json({ user: user.toAdminDetails() });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Не вдалося змінити статус блокування' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'player';

    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ error: 'Нікнейм має містити від 3 до 24 символів' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль має містити щонайменше 8 символів' });
    }

    const exists = await User.findOne({ username });
    if (exists) {
      return res.status(409).json({ error: 'Персонаж із таким нікнеймом уже існує' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const stats = req.body.stats || {};
    const user = new User({
      username,
      passwordHash,
      role,
      level: Math.max(1, Number(req.body.level) || 1),
      gold: Math.max(0, Number(req.body.gold) || 80),
      freeStats: Math.max(0, Number(req.body.freeStats) || 3),
      stats: {
        strength: Math.max(1, Number(stats.strength) || 5),
        agility: Math.max(1, Number(stats.agility) || 5),
        intuition: Math.max(1, Number(stats.intuition) || 5),
        endurance: Math.max(1, Number(stats.endurance) || 5),
      },
    });
    user.recalcVitals(true);
    await user.save();
    await user.populateGear();

    return res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка створення персонажа' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Персонажа не знайдено' });
    }
    await user.populateGear();

    if (req.body.username) {
      const nextName = String(req.body.username).trim();
      if (nextName !== user.username) {
        const duplicate = await User.findOne({ username: nextName });
        if (duplicate) {
          return res.status(409).json({ error: 'Цей нікнейм уже зайнятий' });
        }
        user.username = nextName;
      }
    }

    if (req.body.password && String(req.body.password).length >= 8) {
      user.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }

    if (req.body.role === 'admin' || req.body.role === 'player') {
      user.role = req.body.role;
    }

    if (req.body.level !== undefined) user.level = Math.max(1, Number(req.body.level));
    if (req.body.xp !== undefined) user.xp = Math.max(0, Number(req.body.xp));
    if (req.body.gold !== undefined) user.gold = Math.max(0, Number(req.body.gold));
    if (req.body.freeStats !== undefined) user.freeStats = Math.max(0, Number(req.body.freeStats));
    if (req.body.wins !== undefined) user.wins = Math.max(0, Number(req.body.wins));
    if (req.body.losses !== undefined) user.losses = Math.max(0, Number(req.body.losses));

    if (req.body.stats) {
      const s = req.body.stats;
      if (s.strength !== undefined) user.stats.strength = Math.max(1, Number(s.strength));
      if (s.agility !== undefined) user.stats.agility = Math.max(1, Number(s.agility));
      if (s.intuition !== undefined) user.stats.intuition = Math.max(1, Number(s.intuition));
      if (s.endurance !== undefined) user.stats.endurance = Math.max(1, Number(s.endurance));
    }

    user.recalcVitals(req.body.fullHeal !== false);
    await user.save();

    return res.json({ user: user.toSafeJSON() });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка оновлення персонажа' });
  }
});

router.post('/users/:id/upgrade', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Персонажа не знайдено' });
    }
    await user.populateGear();

    const deltas = {
      strength: Number(req.body.strength) || 0,
      agility: Number(req.body.agility) || 0,
      intuition: Number(req.body.intuition) || 0,
      endurance: Number(req.body.endurance) || 0,
      level: Number(req.body.level) || 0,
      gold: Number(req.body.gold) || 0,
      freeStats: Number(req.body.freeStats) || 0,
    };

    user.stats.strength = Math.max(1, user.stats.strength + deltas.strength);
    user.stats.agility = Math.max(1, user.stats.agility + deltas.agility);
    user.stats.intuition = Math.max(1, user.stats.intuition + deltas.intuition);
    user.stats.endurance = Math.max(1, user.stats.endurance + deltas.endurance);
    user.level = Math.max(1, user.level + deltas.level);
    user.gold = Math.max(0, user.gold + deltas.gold);
    user.freeStats = Math.max(0, user.freeStats + deltas.freeStats);

    user.recalcVitals(req.body.fullHeal !== false);
    await user.save();

    return res.json({ user: user.toSafeJSON() });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка покращення характеристик' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ error: 'Не можна видалити власний акаунт адміністратора' });
    }
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Персонажа не знайдено' });
    }
    await Promise.all([
      Battle.deleteMany({ playerId: deleted._id }),
      PvpBattle.deleteMany({ $or: [{ challengerId: deleted._id }, { opponentId: deleted._id }] }),
    ]);
    return res.json({ ok: true, deletedId: req.params.id });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка видалення персонажа' });
  }
});

// ==================== CRUD БОТІВ ====================

router.get('/bots', async (req, res) => {
  try {
    const bots = await Bot.find().sort({ level: 1, name: 1 });
    res.json({ bots });
  } catch (err) {
    console.error('[ADMIN]', err);
    res.status(500).json({ error: 'Не вдалося завантажити ботів' });
  }
});

router.post('/bots', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: "Вкажіть ім'я бота" });
    }
    const stats = req.body.stats || {};
    const bot = await Bot.create({
      name,
      title: String(req.body.title || 'Боєць Арени').trim(),
      level: Math.max(1, Number(req.body.level) || 1),
      rewardXp: Math.max(1, Number(req.body.rewardXp) || 35),
      rewardGold: Math.max(0, Number(req.body.rewardGold) || 20),
      isActive: req.body.isActive !== false,
      stats: {
        strength: Math.max(1, Number(stats.strength) || 5),
        agility: Math.max(1, Number(stats.agility) || 5),
        intuition: Math.max(1, Number(stats.intuition) || 5),
        endurance: Math.max(1, Number(stats.endurance) || 5),
      },
    });
    return res.status(201).json({ bot });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка створення бота' });
  }
});

router.put('/bots/:id', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) {
      return res.status(404).json({ error: 'Бота не знайдено' });
    }
    if (req.body.name) bot.name = String(req.body.name).trim();
    if (req.body.title !== undefined) bot.title = String(req.body.title).trim();
    if (req.body.level !== undefined) bot.level = Math.max(1, Number(req.body.level));
    if (req.body.rewardXp !== undefined) bot.rewardXp = Math.max(1, Number(req.body.rewardXp));
    if (req.body.rewardGold !== undefined)
      bot.rewardGold = Math.max(0, Number(req.body.rewardGold));
    if (req.body.isActive !== undefined) bot.isActive = Boolean(req.body.isActive);
    if (req.body.stats) {
      const s = req.body.stats;
      if (s.strength !== undefined) bot.stats.strength = Math.max(1, Number(s.strength));
      if (s.agility !== undefined) bot.stats.agility = Math.max(1, Number(s.agility));
      if (s.intuition !== undefined) bot.stats.intuition = Math.max(1, Number(s.intuition));
      if (s.endurance !== undefined) bot.stats.endurance = Math.max(1, Number(s.endurance));
    }
    await bot.save();
    return res.json({ bot });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка оновлення бота' });
  }
});

router.delete('/bots/:id', async (req, res) => {
  try {
    const deleted = await Bot.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Бота не знайдено' });
    }
    return res.json({ ok: true, deletedId: req.params.id });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка видалення бота' });
  }
});

// ==================== CRUD ПРЕДМЕТІВ МАГАЗИНУ ====================

router.get('/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ slot: 1, price: 1 });
    return res.json({ items });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити предмети' });
  }
});

router.post('/items', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const slot = req.body.slot;
    if (!name || !['weapon', 'armor', 'helmet', 'ring'].includes(slot)) {
      return res.status(400).json({ error: 'Вкажіть назву та коректний слот предмета' });
    }
    const b = req.body.bonuses || {};
    const item = await Item.create({
      name,
      description: String(req.body.description || '').trim(),
      slot,
      price: Math.max(1, Number(req.body.price) || 50),
      minLevel: Math.max(1, Number(req.body.minLevel) || 1),
      bonuses: {
        strength: Number(b.strength) || 0,
        agility: Number(b.agility) || 0,
        intuition: Number(b.intuition) || 0,
        endurance: Number(b.endurance) || 0,
        damageMin: Number(b.damageMin) || 0,
        damageMax: Number(b.damageMax) || 0,
        armor: Number(b.armor) || 0,
      },
    });
    return res.status(201).json({ item });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка створення предмета' });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const deleted = await Item.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Предмет не знайдено' });
    }
    return res.json({ ok: true, deletedId: req.params.id });
  } catch (err) {
    console.error('[ADMIN]', err);
    return res.status(500).json({ error: 'Помилка видалення предмета' });
  }
});

module.exports = router;
