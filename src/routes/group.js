const express = require('express');
const mongoose = require('mongoose');
const GroupBattle = require('../models/GroupBattle');
const { requireAuth } = require('../middleware/auth');
const { z, validate } = require('../utils/validate');
const { ZONES, BLOCK_PAIRS } = require('../services/combatEngine');
const { DUNGEONS, getDungeon, buildNpcs, publicDungeon } = require('../services/dungeons');
const { advance, humanParticipant, npcParticipant } = require('../services/groupBattle');
const { isAlive, usableSkill } = require('../services/groupEngine');
const { getSkill } = require('../services/skills');
const { inGroupBattle } = require('../services/activity');
const Battle = require('../models/Battle');
const PvpBattle = require('../models/PvpBattle');

const router = express.Router();
router.use(requireAuth);
router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id)
    ? next()
    : res.status(400).json({ error: 'Некоректний ідентифікатор' }),
);

const createSchema = z.object({
  mode: z.enum(['pvp', 'dungeon']),
  teamSize: z.number().int().min(1).max(3).default(2),
  dungeonId: z.string().max(40).optional(),
});
const joinSchema = z.object({ team: z.enum(['A', 'B']).optional() });
const turnSchema = z.object({
  attackZone: z.enum(ZONES),
  blockPair: z.enum(Object.keys(BLOCK_PAIRS)),
  targetIdx: z.number().int().min(0).max(20).nullable().optional(),
  skill: z.string().max(30).nullable().optional(),
});

function view(b, userId) {
  const uid = String(userId);
  const meIdx = b.participants.findIndex((p) => !p.isNpc && String(p.userId) === uid);
  return {
    id: b._id,
    mode: b.mode,
    status: b.status,
    hostId: b.hostId,
    hostName: b.hostName,
    teamSize: b.teamSize,
    dungeonId: b.dungeonId,
    dungeonName: b.dungeonId ? getDungeon(b.dungeonId)?.name : null,
    floor: b.floor,
    totalFloors: b.totalFloors,
    round: b.round,
    winnerTeam: b.winnerTeam,
    dungeonCleared: b.dungeonCleared,
    myIdx: meIdx,
    myTeam: meIdx >= 0 ? b.participants[meIdx].team : null,
    participants: b.participants.map((p, i) => ({
      idx: i,
      name: p.name,
      level: p.level,
      team: p.team,
      isNpc: p.isNpc,
      boss: p.boss,
      emoji: p.emoji,
      clanTag: p.clanTag,
      gender: p.gender,
      avatar: p.avatar,
      rating: p.rating,
      hp: p.hp,
      maxHp: p.maxHp,
      mana: p.mana,
      maxMana: p.maxMana,
      skills: !p.isNpc && String(p.userId) === uid ? p.skills : undefined,
      cooldowns: !p.isNpc && String(p.userId) === uid ? p.cooldowns : undefined,
      armorBuff: (p.buffs || []).length > 0,
      fled: p.fled,
      ready: Boolean(p.move && p.move.attackZone),
      earnXp: p.earnXp,
      earnGold: p.earnGold,
      ratingDelta: p.ratingDelta,
    })),
    log: b.log.slice(-60),
  };
}

async function busyReason(user) {
  const [pve, pvp, group] = await Promise.all([
    Battle.exists({ playerId: user._id, status: 'active' }),
    PvpBattle.exists({
      status: { $in: ['waiting', 'active'] },
      $or: [{ challengerId: user._id }, { opponentId: user._id }],
    }),
    inGroupBattle(user._id),
  ]);
  if (pve) return 'Спочатку завершіть бій проти бота';
  if (pvp) return 'У вас є активний PvP-бій або заявка';
  if (group) return 'Ви вже берете участь у груповому бої';
  return null;
}

router.get('/dungeons', (req, res) => res.json({ dungeons: DUNGEONS.map(publicDungeon) }));

// Поточний груповий бій гравця та відкриті лобі
router.get('/state', async (req, res) => {
  try {
    const mine = await GroupBattle.findOne({
      status: { $in: ['lobby', 'active'] },
      participants: { $elemMatch: { userId: req.user._id, isNpc: false, fled: false } },
    });
    const recent = mine
      ? null
      : await GroupBattle.findOne({
          status: 'finished',
          participants: { $elemMatch: { userId: req.user._id, isNpc: false } },
          updatedAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) },
        }).sort({ updatedAt: -1 });
    const lobbies = await GroupBattle.find({ status: 'lobby', hostId: { $ne: req.user._id } })
      .sort({ createdAt: -1 })
      .limit(20);
    return res.json({
      battle: mine ? view(mine, req.user._id) : null,
      lastFinished: recent ? view(recent, req.user._id) : null,
      lobbies: lobbies.map((b) => view(b, req.user._id)),
    });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити групові бої' });
  }
});

router.post('/lobbies', validate(createSchema), async (req, res) => {
  try {
    const { mode, teamSize, dungeonId } = req.body;
    const reason = await busyReason(req.user);
    if (reason) return res.status(400).json({ error: reason });
    if (req.user.hp <= 0) return res.status(400).json({ error: "Спочатку відновіть здоров'я" });

    let size = teamSize;
    let dungeon = null;
    if (mode === 'dungeon') {
      dungeon = getDungeon(dungeonId);
      if (!dungeon) return res.status(400).json({ error: 'Підземелля не знайдено' });
      if (req.user.level < dungeon.minLevel) {
        return res.status(400).json({ error: `Потрібен рівень ${dungeon.minLevel}` });
      }
      size = dungeon.maxParty;
    }
    await req.user.populateGear();
    const battle = await GroupBattle.create({
      mode,
      hostId: req.user._id,
      hostName: req.user.username,
      teamSize: size,
      dungeonId: dungeon ? dungeon.id : null,
      totalFloors: dungeon ? dungeon.floors.length : 0,
      participants: [humanParticipant(req.user, 'A')],
    });
    return res.status(201).json({ battle: view(battle, req.user._id) });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося створити лобі' });
  }
});

router.post('/lobbies/:id/join', validate(joinSchema), async (req, res) => {
  try {
    const reason = await busyReason(req.user);
    if (reason) return res.status(400).json({ error: reason });
    if (req.user.hp <= 0) return res.status(400).json({ error: "Спочатку відновіть здоров'я" });

    const lobby = await GroupBattle.findOne({ _id: req.params.id, status: 'lobby' });
    if (!lobby) return res.status(404).json({ error: 'Лобі не знайдено' });
    let team = 'A';
    if (lobby.mode === 'pvp') {
      const count = (t) => lobby.participants.filter((p) => p.team === t).length;
      team = req.body.team || (count('A') <= count('B') ? 'A' : 'B');
    } else {
      const dungeon = getDungeon(lobby.dungeonId);
      if (req.user.level < dungeon.minLevel) {
        return res.status(400).json({ error: `Потрібен рівень ${dungeon.minLevel}` });
      }
    }

    await req.user.populateGear();
    const part = humanParticipant(req.user, team);
    // Атомарно: місце в команді ще є і гравця ще немає в лобі
    const updated = await GroupBattle.findOneAndUpdate(
      {
        _id: lobby._id,
        status: 'lobby',
        'participants.userId': { $ne: req.user._id },
        $expr: {
          $lt: [
            {
              $size: { $filter: { input: '$participants', cond: { $eq: ['$$this.team', team] } } },
            },
            '$teamSize',
          ],
        },
      },
      { $push: { participants: part } },
      { new: true },
    );
    if (!updated) return res.status(400).json({ error: 'Не вдалося приєднатися: команда повна' });
    return res.json({ battle: view(updated, req.user._id) });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося приєднатися до лобі' });
  }
});

router.post('/lobbies/:id/leave', async (req, res) => {
  try {
    const lobby = await GroupBattle.findOne({ _id: req.params.id, status: 'lobby' });
    if (!lobby) return res.status(404).json({ error: 'Лобі не знайдено' });
    if (String(lobby.hostId) === String(req.user._id)) {
      await GroupBattle.updateOne(
        { _id: lobby._id, status: 'lobby' },
        { $set: { status: 'cancelled' } },
      );
    } else {
      await GroupBattle.updateOne(
        { _id: lobby._id, status: 'lobby' },
        { $pull: { participants: { userId: req.user._id } } },
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося вийти з лобі' });
  }
});

router.post('/lobbies/:id/start', async (req, res) => {
  try {
    const lobby = await GroupBattle.findOne({ _id: req.params.id, status: 'lobby' });
    if (!lobby) return res.status(404).json({ error: 'Лобі не знайдено' });
    if (String(lobby.hostId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Розпочати бій може лише організатор' });
    }
    const count = (t) => lobby.participants.filter((p) => p.team === t).length;
    if (lobby.mode === 'pvp' && (count('A') < 1 || count('A') !== count('B'))) {
      return res
        .status(400)
        .json({ error: 'Команди мають бути однакового розміру (мінімум 1 на 1)' });
    }

    // Знімок актуальних характеристик і HP на момент старту
    const User = require('../models/User');
    const users = await User.find({ _id: { $in: lobby.participants.map((p) => p.userId) } });
    await Promise.all(users.map((u) => u.populateGear()));
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const humans = [];
    for (const p of lobby.participants) {
      const u = byId.get(String(p.userId));
      if (!u || u.hp <= 0) {
        return res.status(400).json({ error: `${p.name} не готовий до бою (немає здоров'я)` });
      }
      humans.push(humanParticipant(u, p.team));
    }

    let participants = humans;
    const set = { status: 'active', round: 1, roundStartedAt: new Date() };
    if (lobby.mode === 'dungeon') {
      const dungeon = getDungeon(lobby.dungeonId);
      participants = [
        ...humans,
        ...buildNpcs(dungeon.floors[0], humans.length).map(npcParticipant),
      ];
      set.floor = 1;
    }
    set.participants = participants;
    set.log = [
      {
        round: 1,
        type: 'system',
        text:
          lobby.mode === 'dungeon'
            ? `Загін входить у «${getDungeon(lobby.dungeonId).name}». Поверх 1.`
            : 'Груповий бій розпочато!',
      },
    ];

    const started = await GroupBattle.findOneAndUpdate(
      { _id: lobby._id, status: 'lobby', participants: { $size: lobby.participants.length } },
      { $set: set },
      { new: true },
    );
    if (!started) return res.status(409).json({ error: 'Склад лобі змінився, спробуйте ще раз' });
    return res.json({ battle: view(started, req.user._id) });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося розпочати бій' });
  }
});

router.get('/battles/:id', async (req, res) => {
  try {
    const b = await GroupBattle.findById(req.params.id);
    if (!b || !b.participants.some((p) => !p.isNpc && String(p.userId) === String(req.user._id))) {
      return res.status(404).json({ error: 'Бій не знайдено' });
    }
    return res.json({ battle: view(b, req.user._id) });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити бій' });
  }
});

router.post('/battles/:id/turn', validate(turnSchema), async (req, res) => {
  try {
    const { attackZone, blockPair, targetIdx = null, skill = null } = req.body;
    const b = await GroupBattle.findOne({ _id: req.params.id, status: 'active' });
    if (!b) return res.status(404).json({ error: 'Активний бій не знайдено' });
    const idx = b.participants.findIndex(
      (p) => !p.isNpc && String(p.userId) === String(req.user._id),
    );
    if (idx < 0 || !isAlive(b.participants[idx])) {
      return res.status(403).json({ error: 'Ви не берете участі в цьому бою' });
    }
    const me = b.participants[idx];
    const sk = skill ? getSkill(skill) : null;
    if (skill && !sk) return res.status(400).json({ error: 'Невідома навичка' });
    if (sk && !usableSkill(me, skill)) {
      return res
        .status(400)
        .json({ error: 'Навичка недоступна: не вивчена, мало мани або перезарядка' });
    }
    const target = targetIdx === null ? null : b.participants[targetIdx];
    const allyTarget = sk && sk.target === 'ally';
    if (target && (!isAlive(target) || (target.team === me.team) !== Boolean(allyTarget))) {
      return res.status(400).json({ error: 'Некоректна ціль' });
    }

    // Хід приймається лише поки раунд не розраховується і ще не зроблений
    const saved = await GroupBattle.updateOne(
      {
        _id: b._id,
        status: 'active',
        resolving: false,
        round: b.round,
        [`participants.${idx}.move.attackZone`]: null,
      },
      {
        $set: {
          [`participants.${idx}.move`]: { attackZone, blockPair, targetIdx, skill },
          [`participants.${idx}.missed`]: 0,
        },
      },
    );
    if (!saved.modifiedCount) {
      return res.status(409).json({ error: 'Хід уже зроблено або раунд розраховується' });
    }
    const after = await advance(b._id);
    return res.json({ battle: view(after, req.user._id) });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося виконати хід' });
  }
});

router.post('/battles/:id/flee', async (req, res) => {
  try {
    const b = await GroupBattle.findOne({ _id: req.params.id, status: 'active' });
    if (!b) return res.status(404).json({ error: 'Активний бій не знайдено' });
    const idx = b.participants.findIndex(
      (p) => !p.isNpc && String(p.userId) === String(req.user._id),
    );
    if (idx < 0) return res.status(403).json({ error: 'Ви не берете участі в цьому бою' });
    await GroupBattle.updateOne(
      { _id: b._id, status: 'active', resolving: false },
      {
        $set: { [`participants.${idx}.fled`]: true },
        $push: {
          log: { round: b.round, type: 'system', text: `${req.user.username} тікає з бою!` },
        },
      },
    );
    const after = await advance(b._id);
    return res.json({ battle: view(after, req.user._id) });
  } catch (err) {
    console.error('[GROUP]', err);
    return res.status(500).json({ error: 'Не вдалося втекти' });
  }
});

module.exports = router;
