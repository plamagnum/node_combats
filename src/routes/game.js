const express = require('express');
const Bot = require('../models/Bot');
const Battle = require('../models/Battle');
const PvpBattle = require('../models/PvpBattle');
const { requireAuth } = require('../middleware/auth');
const {
  ZONES,
  BLOCK_PAIRS,
  resolveStrike,
  chooseBotTurn,
} = require('../services/combatEngine');

const router = express.Router();
router.use(requireAuth);

// Список доступних ботів для боїв
router.get('/bots', async (req, res) => {
  try {
    const bots = await Bot.find({ isActive: true }).sort({ level: 1, name: 1 });
    res.json({ bots });
  } catch (err) {
    res.status(500).json({ error: 'Не вдалося завантажити ботів' });
  }
});

// Розподіл вільних очок характеристик гравцем
router.post('/stats/allocate', async (req, res) => {
  try {
    const { stat } = req.body;
    const allowed = ['strength', 'agility', 'intuition', 'endurance'];
    if (!allowed.includes(stat)) {
      return res.status(400).json({ error: 'Невідома характеристика' });
    }
    if (req.user.freeStats <= 0) {
      return res.status(400).json({ error: 'Немає вільних очок характеристик' });
    }

    req.user.stats[stat] += 1;
    req.user.freeStats -= 1;
    req.user.recalcVitals(false);
    if (stat === 'endurance') {
      req.user.hp = Math.min(req.user.maxHp, req.user.hp + 10);
    }
    await req.user.save();

    return res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Помилка оновлення характеристик' });
  }
});

// Відновлення здоров'я поза боєм
router.post('/heal', async (req, res) => {
  try {
    const [activePve, activePvp] = await Promise.all([
      Battle.findOne({ playerId: req.user._id, status: 'active' }),
      PvpBattle.findOne({
        status: 'active',
        $or: [{ challengerId: req.user._id }, { opponentId: req.user._id }],
      }),
    ]);
    if (activePve || activePvp) {
      return res.status(400).json({ error: 'Не можна лікуватися під час активного бою' });
    }
    req.user.recalcVitals(true);
    await req.user.save();
    return res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Помилка відновлення здоров\'я' });
  }
});

// Поточний активний бій та історія останніх боїв
router.get('/battles/state', async (req, res) => {
  try {
    const activeBattle = await Battle.findOne({
      playerId: req.user._id,
      status: 'active',
    }).sort({ createdAt: -1 });

    const history = await Battle.find({
      playerId: req.user._id,
      status: { $ne: 'active' },
    })
      .sort({ updatedAt: -1 })
      .limit(8)
      .select('botName botLevel status round reward updatedAt');

    return res.json({ activeBattle, history });
  } catch (err) {
    return res.status(500).json({ error: 'Не вдалося отримати стан боїв' });
  }
});

// Почати бій із ботом
router.post('/battles/start', async (req, res) => {
  try {
    const { botId } = req.body;
    const [existingPve, existingPvp] = await Promise.all([
      Battle.findOne({ playerId: req.user._id, status: 'active' }),
      PvpBattle.findOne({
        status: { $in: ['waiting', 'active'] },
        $or: [{ challengerId: req.user._id }, { opponentId: req.user._id }],
      }),
    ]);
    if (existingPve) {
      return res.status(400).json({ error: 'У вас уже є активний бій', activeBattle: existingPve });
    }
    if (existingPvp) {
      return res.status(400).json({ error: 'У вас є активний PvP-бій або відкрита заявка' });
    }

    const bot = await Bot.findOne({ _id: botId, isActive: true });
    if (!bot) {
      return res.status(404).json({ error: 'Бота не знайдено' });
    }

    if (req.user.hp <= 0) {
      return res.status(400).json({ error: 'Здоров\'я на нулі. Спочатку відновіть HP.' });
    }

    const battle = await Battle.create({
      playerId: req.user._id,
      botId: bot._id,
      botName: bot.name,
      botTitle: bot.title,
      botLevel: bot.level,
      status: 'active',
      round: 0,
      playerHp: req.user.hp,
      playerMaxHp: req.user.maxHp,
      botHp: bot.maxHp,
      botMaxHp: bot.maxHp,
      log: [
        {
          round: 0,
          type: 'system',
          text: `Бій розпочато! ${req.user.username} [Рів. ${req.user.level}] проти ${bot.name} [Рів. ${bot.level}].`,
        },
      ],
    });

    return res.status(201).json({ battle, user: req.user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Не вдалося розпочати бій', details: err.message });
  }
});

// Зробити хід у бою (1 зона удару + 2 суміжні зони блоку)
router.post('/battles/:id/turn', async (req, res) => {
  try {
    const { attackZone, blockPair } = req.body;
    if (!ZONES.includes(attackZone)) {
      return res.status(400).json({ error: 'Оберіть коректну зону удару' });
    }
    const playerBlockZones = BLOCK_PAIRS[blockPair];
    if (!playerBlockZones) {
      return res.status(400).json({ error: 'Оберіть коректну пару зон блоку' });
    }

    const battle = await Battle.findOne({
      _id: req.params.id,
      playerId: req.user._id,
      status: 'active',
    });
    if (!battle) {
      return res.status(404).json({ error: 'Активний бій не знайдено' });
    }

    const bot = await Bot.findById(battle.botId);
    const botStats = bot
      ? bot.stats
      : { strength: 5, agility: 5, intuition: 5, endurance: 5 };

    const playerEffective = req.user.getEffectiveStats();
    const botTurn = chooseBotTurn();
    battle.round += 1;

    const playerStrike = resolveStrike(
      req.user.username,
      playerEffective,
      battle.botName,
      botStats,
      attackZone,
      botTurn.blockZones
    );

    const botStrike = resolveStrike(
      battle.botName,
      botStats,
      req.user.username,
      playerEffective,
      botTurn.attackZone,
      playerBlockZones
    );

    battle.botHp = Math.max(0, battle.botHp - playerStrike.damage);
    battle.playerHp = Math.max(0, battle.playerHp - botStrike.damage);

    battle.log.push(
      { round: battle.round, type: playerStrike.type, text: playerStrike.text },
      { round: battle.round, type: botStrike.type, text: botStrike.text }
    );

    req.user.hp = battle.playerHp;

    if (battle.botHp <= 0 && battle.playerHp <= 0) {
      battle.status = 'draw';
      battle.log.push({
        round: battle.round,
        type: 'system',
        text: 'Нічия! Обидва бійці впали одночасно.',
      });
    } else if (battle.botHp <= 0) {
      battle.status = 'won';
      req.user.wins += 1;
      const xpGain = bot ? bot.rewardXp : 30;
      const goldGain = bot ? bot.rewardGold : 20;
      req.user.gold += goldGain;
      const leveledUp = req.user.addXp(xpGain);
      battle.reward = { xp: xpGain, gold: goldGain, leveledUp };
      battle.log.push({
        round: battle.round,
        type: 'system',
        text: `Перемога! Отримано +${xpGain} XP та +${goldGain} золота.${
          leveledUp ? ` Новий рівень: ${req.user.level} (+3 очки характеристик)!` : ''
        }`,
      });
    } else if (battle.playerHp <= 0) {
      battle.status = 'lost';
      req.user.losses += 1;
      battle.log.push({
        round: battle.round,
        type: 'system',
        text: `Поразка! ${battle.botName} переміг у цьому бою.`,
      });
    }

    await req.user.save();
    await battle.save();

    return res.json({ battle, user: req.user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Помилка виконання ходу', details: err.message });
  }
});

// Здатися в бою
router.post('/battles/:id/flee', async (req, res) => {
  try {
    const battle = await Battle.findOne({
      _id: req.params.id,
      playerId: req.user._id,
      status: 'active',
    });
    if (!battle) {
      return res.status(404).json({ error: 'Активний бій не знайдено' });
    }

    battle.status = 'lost';
    battle.log.push({
      round: battle.round,
      type: 'system',
      text: `${req.user.username} залишив арену. Зараховано поразку.`,
    });
    req.user.losses += 1;
    await req.user.save();
    await battle.save();

    return res.json({ battle, user: req.user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Не вдалося завершити бій' });
  }
});

module.exports = router;
