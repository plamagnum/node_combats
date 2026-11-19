const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const User = require('../models/User');
const Battle = require('../models/Battle');
const PvpBattle = require('../models/PvpBattle');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.param('itemId', (req, res, next, v) =>
  mongoose.isValidObjectId(v)
    ? next()
    : res.status(400).json({ error: 'Некоректний ідентифікатор' }),
);

async function hasActiveCombat(userId) {
  const [pve, pvp] = await Promise.all([
    Battle.findOne({ playerId: userId, status: 'active' }),
    PvpBattle.findOne({
      status: 'active',
      $or: [{ challengerId: userId }, { opponentId: userId }],
    }),
  ]);
  return Boolean(pve || pvp);
}

// Список усіх активних товарів у магазині
router.get('/items', async (req, res) => {
  try {
    const items = await Item.find({ isActive: true }).sort({ slot: 1, price: 1 });
    return res.json({ items });
  } catch (err) {
    console.error('[SHOP]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити товари магазину' });
  }
});

// Купити предмет
router.post('/buy/:itemId', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.itemId, isActive: true });
    if (!item) {
      return res.status(404).json({ error: 'Предмет не знайдено' });
    }

    const alreadyOwned = req.user.inventory.some(
      (inv) => (inv._id || inv).toString() === item._id.toString(),
    );
    if (alreadyOwned) {
      return res.status(400).json({ error: 'Цей предмет уже є у вашому інвентарі' });
    }

    // Атомарна покупка: списання золота й додавання предмета одним запитом
    const bought = await User.findOneAndUpdate(
      { _id: req.user._id, gold: { $gte: item.price }, inventory: { $ne: item._id } },
      { $inc: { gold: -item.price }, $push: { inventory: item._id } },
      { new: true },
    );
    if (!bought) {
      return res.status(400).json({ error: 'Недостатньо золота або предмет уже куплено' });
    }
    req.user = bought;
    await req.user.populateGear();

    return res.json({ user: req.user.toSafeJSON(), item });
  } catch (err) {
    console.error('[SHOP]', err);
    return res.status(500).json({ error: 'Помилка покупки предмета' });
  }
});

// Одягнути предмет із інвентарю
router.post('/equip/:itemId', async (req, res) => {
  try {
    if (await hasActiveCombat(req.user._id)) {
      return res.status(400).json({ error: 'Не можна змінювати спорядження під час бою' });
    }

    const item = await Item.findById(req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Предмет не знайдено' });
    }

    const owns = req.user.inventory.some(
      (inv) => (inv._id || inv).toString() === item._id.toString(),
    );
    if (!owns) {
      return res.status(400).json({ error: 'Спочатку купіть цей предмет у магазині' });
    }

    if (req.user.level < item.minLevel) {
      return res
        .status(400)
        .json({ error: `Потрібен щонайменше ${item.minLevel} рівень для цього предмета` });
    }

    req.user.equipment[item.slot] = item._id;
    await req.user.save();
    await req.user.populateGear();
    req.user.recalcVitals(false);
    await req.user.save();

    return res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    console.error('[SHOP]', err);
    return res.status(500).json({ error: 'Не вдалося одягнути предмет' });
  }
});

// Зняти предмет зі слоту
router.post('/unequip/:slot', async (req, res) => {
  try {
    if (await hasActiveCombat(req.user._id)) {
      return res.status(400).json({ error: 'Не можна знімати спорядження під час бою' });
    }

    const { slot } = req.params;
    if (!['weapon', 'armor', 'helmet', 'ring'].includes(slot)) {
      return res.status(400).json({ error: 'Невідомий слот спорядження' });
    }

    req.user.equipment[slot] = null;
    await req.user.save();
    await req.user.populateGear();
    req.user.recalcVitals(false);
    await req.user.save();

    return res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    console.error('[SHOP]', err);
    return res.status(500).json({ error: 'Не вдалося зняти предмет' });
  }
});

// Продати предмет за 50% ціни
router.post('/sell/:itemId', async (req, res) => {
  try {
    if (await hasActiveCombat(req.user._id)) {
      return res.status(400).json({ error: 'Не можна продавати спорядження під час бою' });
    }

    const item = await Item.findById(req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Предмет не знайдено' });
    }

    const idx = req.user.inventory.findIndex(
      (inv) => (inv._id || inv).toString() === item._id.toString(),
    );
    if (idx === -1) {
      return res.status(400).json({ error: 'Предмета немає в інвентарі' });
    }

    const equippedSlot = req.user.equipment[item.slot];
    if (equippedSlot && (equippedSlot._id || equippedSlot).toString() === item._id.toString()) {
      req.user.equipment[item.slot] = null;
    }

    req.user.inventory.splice(idx, 1);
    const refund = Math.max(1, Math.floor(item.price * 0.5));
    req.user.gold += refund;
    await req.user.save();
    await req.user.populateGear();
    req.user.recalcVitals(false);
    await req.user.save();

    return res.json({ user: req.user.toSafeJSON(), refund });
  } catch (err) {
    console.error('[SHOP]', err);
    return res.status(500).json({ error: 'Помилка продажу предмета' });
  }
});

module.exports = router;
