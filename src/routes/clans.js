const express = require('express');
const mongoose = require('mongoose');
const Clan = require('../models/Clan');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { z, validate } = require('../utils/validate');

const CREATE_COST = 500;
const MAX_MEMBERS = 20;

const router = express.Router();
router.use(requireAuth);
router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id)
    ? next()
    : res.status(400).json({ error: 'Некоректний ідентифікатор' }),
);

const createSchema = z.object({
  name: z.string().trim().min(3, 'Назва: 3–20 символів').max(20, 'Назва: 3–20 символів'),
  tag: z
    .string()
    .trim()
    .regex(/^[A-Za-zА-Яа-яІіЇїЄєҐґ0-9]{2,5}$/, 'Тег: 2–5 літер або цифр'),
  description: z.string().trim().max(120).optional().default(''),
});
const donateSchema = z.object({ amount: z.number().int().min(1).max(1000000) });

const brief = (c) => ({
  id: c._id,
  name: c.name,
  tag: c.tag,
  description: c.description,
  xp: c.xp,
  level: c.level,
  memberCount: c.memberCount,
  maxMembers: MAX_MEMBERS,
  treasury: c.treasury,
});

async function clanDetails(clan) {
  const members = await User.find({ clanId: clan._id })
    .select('username level rating clanRole')
    .sort({ level: -1 });
  return {
    ...brief(clan),
    leaderId: clan.leaderId,
    members: members.map((m) => ({
      id: m._id,
      username: m.username,
      level: m.level,
      rating: m.rating,
      role: m.clanRole,
    })),
  };
}

router.get('/', async (req, res) => {
  try {
    const clans = await Clan.find().sort({ xp: -1 }).limit(50);
    return res.json({ clans: clans.map(brief), createCost: CREATE_COST });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити клани' });
  }
});

router.get('/mine', async (req, res) => {
  try {
    const clan = req.user.clanId ? await Clan.findById(req.user.clanId) : null;
    return res.json({ clan: clan ? await clanDetails(clan) : null, createCost: CREATE_COST });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити клан' });
  }
});

router.post('/', validate(createSchema), async (req, res) => {
  try {
    const { name, tag, description } = req.body;
    // Списання золота й призначення клану — один атомарний запит
    const paid = await User.findOneAndUpdate(
      { _id: req.user._id, clanId: null, gold: { $gte: CREATE_COST } },
      { $inc: { gold: -CREATE_COST } },
      { new: true },
    );
    if (!paid) {
      return res.status(400).json({ error: `Потрібно ${CREATE_COST} золота і відсутність клану` });
    }
    let clan;
    try {
      clan = await Clan.create({ name, tag, description, leaderId: req.user._id });
    } catch (err) {
      await User.updateOne({ _id: req.user._id }, { $inc: { gold: CREATE_COST } });
      if (err.code === 11000)
        return res.status(400).json({ error: 'Клан з такою назвою або тегом уже існує' });
      throw err;
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { clanId: clan._id, clanTag: clan.tag, clanRole: 'leader' } },
      { new: true },
    );
    await user.populateGear();
    return res.status(201).json({ clan: await clanDetails(clan), user: user.toSafeJSON() });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося створити клан' });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    if (req.user.clanId) return res.status(400).json({ error: 'Ви вже у клані' });
    const clan = await Clan.findOneAndUpdate(
      { _id: req.params.id, memberCount: { $lt: MAX_MEMBERS } },
      { $inc: { memberCount: 1 } },
      { new: true },
    );
    if (!clan) return res.status(400).json({ error: 'Клан не знайдено або він заповнений' });
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, clanId: null },
      { $set: { clanId: clan._id, clanTag: clan.tag, clanRole: 'member' } },
      { new: true },
    );
    if (!user) {
      await Clan.updateOne({ _id: clan._id }, { $inc: { memberCount: -1 } });
      return res.status(400).json({ error: 'Ви вже у клані' });
    }
    await user.populateGear();
    return res.json({ clan: await clanDetails(clan), user: user.toSafeJSON() });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося вступити до клану' });
  }
});

async function removeMember(userId, clanId) {
  const res = await User.updateOne(
    { _id: userId, clanId },
    { $set: { clanId: null, clanTag: '', clanRole: 'member' } },
  );
  if (res.modifiedCount) await Clan.updateOne({ _id: clanId }, { $inc: { memberCount: -1 } });
}

router.post('/leave', async (req, res) => {
  try {
    const clan = req.user.clanId ? await Clan.findById(req.user.clanId) : null;
    if (!clan) return res.status(400).json({ error: 'Ви не у клані' });
    if (String(clan.leaderId) === String(req.user._id)) {
      return res.status(400).json({ error: 'Лідер має передати лідерство або розпустити клан' });
    }
    await removeMember(req.user._id, clan._id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося вийти з клану' });
  }
});

router.post('/donate', validate(donateSchema), async (req, res) => {
  try {
    if (!req.user.clanId) return res.status(400).json({ error: 'Ви не у клані' });
    const { amount } = req.body;
    const paid = await User.findOneAndUpdate(
      { _id: req.user._id, gold: { $gte: amount }, clanId: req.user.clanId },
      { $inc: { gold: -amount } },
      { new: true },
    );
    if (!paid) return res.status(400).json({ error: 'Недостатньо золота' });
    await Clan.updateOne(
      { _id: req.user.clanId },
      { $inc: { treasury: amount, xp: Math.floor(amount / 10) } },
    );
    await paid.populateGear();
    return res.json({ user: paid.toSafeJSON() });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося внести золото' });
  }
});

async function leaderClan(req, res) {
  const clan = req.user.clanId ? await Clan.findById(req.user.clanId) : null;
  if (!clan || String(clan.leaderId) !== String(req.user._id)) {
    res.status(403).json({ error: 'Лише лідер клану може це робити' });
    return null;
  }
  return clan;
}

router.post('/kick/:id', async (req, res) => {
  try {
    const clan = await leaderClan(req, res);
    if (!clan) return null;
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: 'Не можна виключити себе' });
    }
    await removeMember(req.params.id, clan._id);
    return res.json({ clan: await clanDetails(await Clan.findById(clan._id)) });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося виключити гравця' });
  }
});

router.post('/transfer/:id', async (req, res) => {
  try {
    const clan = await leaderClan(req, res);
    if (!clan) return null;
    const target = await User.findOne({ _id: req.params.id, clanId: clan._id });
    if (!target || String(target._id) === String(req.user._id)) {
      return res.status(400).json({ error: 'Оберіть іншого учасника клану' });
    }
    await Clan.updateOne({ _id: clan._id }, { $set: { leaderId: target._id } });
    await User.updateOne({ _id: target._id }, { $set: { clanRole: 'leader' } });
    await User.updateOne({ _id: req.user._id }, { $set: { clanRole: 'member' } });
    return res.json({ clan: await clanDetails(await Clan.findById(clan._id)) });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося передати лідерство' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const clan = await leaderClan(req, res);
    if (!clan) return null;
    await User.updateMany(
      { clanId: clan._id },
      { $set: { clanId: null, clanTag: '', clanRole: 'member' } },
    );
    await Clan.deleteOne({ _id: clan._id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CLANS]', err);
    return res.status(500).json({ error: 'Не вдалося розпустити клан' });
  }
});

module.exports = router;
