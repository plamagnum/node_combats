const GroupBattle = require('../models/GroupBattle');
const User = require('../models/User');
const Clan = require('../models/Clan');
const { isAlive, outcomeOf, resolveGroupRound, MAX_ROUNDS } = require('./groupEngine');
const { getDungeon, buildNpcs } = require('./dungeons');
const { teamEloDelta } = require('./rating');
const { maxManaFor } = require('./skills');
const { track } = require('./progress');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emptyMove = () => ({ attackZone: null, blockPair: null, targetIdx: null, skill: null });

function humanParticipant(user, team) {
  return {
    userId: user._id,
    name: user.username,
    level: user.level,
    team,
    isNpc: false,
    clanTag: user.clanTag || '',
    gender: user.gender,
    avatar: user.avatar ? (user.avatar.toObject ? user.avatar.toObject() : user.avatar) : null,
    rating: user.rating,
    hp: user.hp,
    maxHp: user.maxHp,
    stats: user.getEffectiveStats(),
    skills: user.skills || [],
    mana: maxManaFor(user.getEffectiveStats()),
    maxMana: maxManaFor(user.getEffectiveStats()),
    move: emptyMove(),
  };
}

function npcParticipant(npc) {
  return {
    userId: null,
    name: npc.name,
    level: npc.level,
    team: 'B',
    isNpc: true,
    boss: npc.boss,
    emoji: npc.emoji,
    hp: npc.hp,
    maxHp: npc.maxHp,
    stats: npc.stats,
    move: emptyMove(),
  };
}

function dungeonCap(totalFloors) {
  return MAX_ROUNDS * Math.max(1, totalFloors);
}

function roundCap(b) {
  return b.mode === 'dungeon' ? dungeonCap(b.totalFloors) : MAX_ROUNDS;
}

// Нагороди за поверх: усі, хто не втік, отримують XP/золото (виплачується при завершенні бою)
function addFloorRewards(b, reward) {
  b.participants.forEach((p) => {
    if (!p.isNpc && !p.fled) {
      p.earnXp += reward.xp;
      p.earnGold += reward.gold;
    }
  });
}

function finishBattle(b, winnerTeam, text) {
  b.status = 'finished';
  b.winnerTeam = winnerTeam;
  b.log.push({ round: b.round, type: 'system', text });
}

function handleOutcome(b, outcome) {
  if (b.mode === 'pvp') {
    const text =
      outcome === 'draw' ? 'Нічия! Обидві команди впали.' : `Перемогла команда ${outcome}!`;
    finishBattle(b, outcome, text);
    return;
  }

  const dungeon = getDungeon(b.dungeonId);
  if (outcome !== 'A') {
    finishBattle(
      b,
      outcome === 'draw' ? 'draw' : 'B',
      'Загін загинув у підземеллі... Нагороди за пройдені поверхи збережено.',
    );
    return;
  }

  const floorDef = dungeon.floors[b.floor - 1];
  addFloorRewards(b, floorDef.reward);
  if (floorDef.monsters.some((m) => m.boss)) b.bossKills += 1;
  b.log.push({
    round: b.round,
    type: 'system',
    text: `Поверх ${b.floor} «${floorDef.name}» зачищено! +${floorDef.reward.xp} XP, +${floorDef.reward.gold} зол. кожному.`,
  });

  if (b.floor >= b.totalFloors) {
    addFloorRewards(b, dungeon.finalBonus);
    b.dungeonCleared = true;
    finishBattle(
      b,
      'A',
      `Підземелля «${dungeon.name}» пройдено! Бонус: +${dungeon.finalBonus.xp} XP, +${dungeon.finalBonus.gold} зол.`,
    );
    return;
  }

  b.floor += 1;
  const next = dungeon.floors[b.floor - 1];
  const humans = b.participants.filter((p) => !p.isNpc);
  const partySize = humans.filter((p) => !p.fled).length;
  b.participants = [
    ...humans.map((p) => p.toObject()),
    ...buildNpcs(next, partySize).map(npcParticipant),
  ];
  b.log.push({
    round: b.round,
    type: 'system',
    text: `Поверх ${b.floor}: «${next.name}». З'являються вороги: ${next.monsters.map((m) => m.name).join(', ')}.`,
  });
}

// Одна спроба просунути бій. Повертає { recheck } — чи варто повторити, якщо хтось ще не зробив хід
async function processClaimed(b, force) {
  let recheck = false;

  if (force) {
    b.participants.forEach((p) => {
      if (!p.isNpc && isAlive(p) && !p.move.attackZone) {
        p.missed += 1;
        if (p.missed >= 3) {
          p.fled = true;
          b.log.push({
            round: b.round,
            type: 'system',
            text: `${p.name} неактивний і залишає бій.`,
          });
        }
      }
    });
  }

  let outcome = outcomeOf(b.participants, b.round - 1, roundCap(b));
  if (!outcome) {
    const pending = b.participants.some((p) => !p.isNpc && isAlive(p) && !p.move.attackZone);
    if (pending && !force) {
      recheck = true;
    } else {
      const logs = resolveGroupRound(b.participants, b.round);
      b.log.push(...logs);
      b.round += 1;
      b.roundStartedAt = new Date();
      outcome = outcomeOf(b.participants, b.round - 1, roundCap(b));
    }
  }

  if (outcome) handleOutcome(b, outcome);

  b.resolving = false;
  b.resolveStartedAt = null;
  await b.save();
  return { recheck, finished: b.status === 'finished' };
}

// Блокування resolving гарантує, що раунд розраховується лише одним запитом
async function advance(battleId, { force = false } = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const claimed = await GroupBattle.findOneAndUpdate(
      { _id: battleId, status: 'active', resolving: false },
      { $set: { resolving: true, resolveStartedAt: new Date() } },
      { new: true },
    );
    if (!claimed) {
      const cur = await GroupBattle.findById(battleId).select('status resolving');
      if (!cur || cur.status !== 'active') break;
      await sleep(40);
      continue;
    }
    let result;
    try {
      result = await processClaimed(claimed, force);
    } catch (err) {
      await GroupBattle.updateOne(
        { _id: battleId },
        { $set: { resolving: false, resolveStartedAt: null } },
      );
      throw err;
    }
    if (result.finished) {
      await finalize(claimed);
      break;
    }
    if (!result.recheck) break;
    await sleep(40);
    if (attempt >= 2) break;
  }
  return GroupBattle.findById(battleId);
}

async function addClanXp(users, perMember) {
  const byClan = new Map();
  users.forEach((u) => {
    if (u.clanId) byClan.set(String(u.clanId), (byClan.get(String(u.clanId)) || 0) + perMember);
  });
  await Promise.all([...byClan].map(([id, xp]) => Clan.updateOne({ _id: id }, { $inc: { xp } })));
}

// Виплата нагород і запис HP гравцям; виконується один раз
async function finalize(finished) {
  const b = await GroupBattle.findOneAndUpdate(
    { _id: finished._id, status: 'finished', rewardsApplied: false },
    { $set: { rewardsApplied: true } },
    { new: true },
  );
  if (!b) return;

  const humans = b.participants.filter((p) => !p.isNpc && p.userId);
  const users = await User.find({ _id: { $in: humans.map((p) => p.userId) } });
  await Promise.all(users.map((u) => u.populateGear()));
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const winnerTeam = b.winnerTeam;
  const isPvpDecisive = b.mode === 'pvp' && (winnerTeam === 'A' || winnerTeam === 'B');
  let delta = 0;
  let avgLoserLevel = 1;
  if (isPvpDecisive) {
    const winners = humans.filter((p) => p.team === winnerTeam && !p.fled);
    const losers = humans.filter((p) => p.team !== winnerTeam || p.fled);
    delta = teamEloDelta(
      winners.map((p) => byId.get(String(p.userId))?.rating ?? 1000),
      losers.map((p) => byId.get(String(p.userId))?.rating ?? 1000),
    );
    const lvls = humans.filter((p) => p.team !== winnerTeam).map((p) => p.level);
    avgLoserLevel = lvls.length ? lvls.reduce((s, l) => s + l, 0) / lvls.length : 1;
  }

  const rewarded = [];
  const unlockedLog = [];
  humans.forEach((p) => {
    const u = byId.get(String(p.userId));
    if (!u) return;
    u.hp = Math.max(0, Math.min(p.hp, u.maxHp));

    if (isPvpDecisive) {
      const won = p.team === winnerTeam && !p.fled;
      if (won) {
        p.earnXp = Math.round(60 + 12 * avgLoserLevel);
        p.earnGold = Math.round(40 + 8 * avgLoserLevel);
        p.ratingDelta = delta;
        u.wins += 1;
        u.rating += delta;
        track(u, 'groupWin');
        rewarded.push(u);
      } else {
        p.ratingDelta = -Math.min(delta, u.rating);
        u.losses += 1;
        u.rating = Math.max(0, u.rating - delta);
      }
    } else if (b.mode === 'dungeon') {
      if (b.dungeonCleared && !p.fled) {
        track(u, 'dungeonClear');
        rewarded.push(u);
      }
      if (b.bossKills && !p.fled) track(u, 'bossKill', b.bossKills);
    }

    u.gold += p.earnGold;
    if (p.earnXp) u.addXp(p.earnXp);
    const unlocked = track(u, 'noop');
    if (unlocked.length) unlockedLog.push(`${p.name}: ${unlocked.join(', ')}`);
  });

  await Promise.all(users.map((u) => u.save()));
  await addClanXp(rewarded, b.mode === 'dungeon' ? 20 : 10);

  if (unlockedLog.length)
    b.log.push({ round: b.round, type: 'system', text: `Досягнення: ${unlockedLog.join('; ')}` });
  await b.save();
}

module.exports = { advance, finalize, humanParticipant, npcParticipant, emptyMove };
