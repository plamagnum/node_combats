const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Battle = require('../models/Battle');
const PvpBattle = require('../models/PvpBattle');
const { applyElo } = require('../services/rating');
const { requireAuth } = require('../middleware/auth');
const { ZONES, BLOCK_PAIRS, resolveStrike } = require('../services/combatEngine');

const router = express.Router();
router.use(requireAuth);
router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id)
    ? next()
    : res.status(400).json({ error: 'Некоректний ідентифікатор' }),
);

function formatBattleForUser(battle, userId) {
  if (!battle) return null;
  const uid = userId.toString();
  const isChallenger = battle.challengerId.toString() === uid;
  const myPending = isChallenger
    ? Boolean(battle.pendingMoves?.challenger?.attackZone)
    : Boolean(battle.pendingMoves?.opponent?.attackZone);
  const oppPending = isChallenger
    ? Boolean(battle.pendingMoves?.opponent?.attackZone)
    : Boolean(battle.pendingMoves?.challenger?.attackZone);

  return {
    id: battle._id,
    status: battle.status,
    round: battle.round,
    isChallenger,
    challengerId: battle.challengerId,
    challengerName: battle.challengerName,
    challengerLevel: battle.challengerLevel,
    challengerHp: battle.challengerHp,
    challengerMaxHp: battle.challengerMaxHp,
    opponentId: battle.opponentId,
    opponentName: battle.opponentName,
    opponentLevel: battle.opponentLevel,
    opponentHp: battle.opponentHp,
    opponentMaxHp: battle.opponentMaxHp,
    myMoveSubmitted: myPending,
    opponentMoveSubmitted: oppPending,
    winnerId: battle.winnerId,
    winnerName: battle.winnerName,
    isDraw: battle.isDraw,
    log: battle.log,
    updatedAt: battle.updatedAt,
  };
}

// Стан PvP арени: відкриті виклики, власний активний/очікуваний бій та історія
router.get('/state', async (req, res) => {
  try {
    const uid = req.user._id;
    const [openChallenges, myBattle, recentHistory] = await Promise.all([
      PvpBattle.find({ status: 'waiting' }).sort({ createdAt: -1 }).limit(20),
      PvpBattle.findOne({
        status: { $in: ['waiting', 'active'] },
        $or: [{ challengerId: uid }, { opponentId: uid }],
      }).sort({ updatedAt: -1 }),
      PvpBattle.find({
        status: 'finished',
        $or: [{ challengerId: uid }, { opponentId: uid }],
      })
        .sort({ updatedAt: -1 })
        .limit(8),
    ]);

    return res.json({
      user: req.user.toSafeJSON(),
      myBattle: formatBattleForUser(myBattle, uid),
      openChallenges: openChallenges.map((c) => formatBattleForUser(c, uid)),
      history: recentHistory.map((h) => formatBattleForUser(h, uid)),
    });
  } catch (err) {
    console.error('[PVP]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити стан PvP арени' });
  }
});

// Створити відкриту заявку на PvP бій
router.post('/challenges', async (req, res) => {
  try {
    const uid = req.user._id;
    const [activePve, activePvp] = await Promise.all([
      Battle.findOne({ playerId: uid, status: 'active' }),
      PvpBattle.findOne({
        status: { $in: ['waiting', 'active'] },
        $or: [{ challengerId: uid }, { opponentId: uid }],
      }),
    ]);

    if (activePve) {
      return res.status(400).json({ error: 'Спочатку завершіть поточний бій проти бота' });
    }
    if (activePvp) {
      return res.status(400).json({ error: 'У вас уже є активна заявка або PvP-бій' });
    }
    if (req.user.hp <= 0) {
      return res.status(400).json({ error: "Здоров'я на нулі. Відновіть HP перед викликом." });
    }

    const battle = await PvpBattle.create({
      challengerId: uid,
      challengerName: req.user.username,
      challengerLevel: req.user.level,
      challengerHp: req.user.hp,
      challengerMaxHp: req.user.maxHp,
      challengerStats: req.user.getEffectiveStats(),
      status: 'waiting',
      round: 0,
      log: [
        {
          round: 0,
          type: 'system',
          text: `${req.user.username} [Рів. ${req.user.level}] кинув виклик на PvP арені. Очікування супротивника...`,
        },
      ],
    });

    return res.status(201).json({ battle: formatBattleForUser(battle, uid) });
  } catch (err) {
    console.error('[PVP]', err);
    return res.status(500).json({ error: 'Не вдалося створити PvP-виклик' });
  }
});

// Скасувати власну заявку
router.post('/challenges/:id/cancel', async (req, res) => {
  try {
    const battle = await PvpBattle.findOne({
      _id: req.params.id,
      challengerId: req.user._id,
      status: 'waiting',
    });
    if (!battle) {
      return res.status(404).json({ error: 'Заявку не знайдено або бій уже почався' });
    }
    battle.status = 'cancelled';
    await battle.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[PVP]', err);
    return res.status(500).json({ error: 'Не вдалося скасувати заявку' });
  }
});

// Прийняти виклик іншого гравця
router.post('/challenges/:id/accept', async (req, res) => {
  try {
    const uid = req.user._id;
    const [activePve, activePvp] = await Promise.all([
      Battle.findOne({ playerId: uid, status: 'active' }),
      PvpBattle.findOne({
        status: { $in: ['waiting', 'active'] },
        $or: [{ challengerId: uid }, { opponentId: uid }],
      }),
    ]);

    if (activePve || activePvp) {
      return res.status(400).json({ error: 'У вас уже є активний бій або відкрита заявка' });
    }
    if (req.user.hp <= 0) {
      return res.status(400).json({ error: "Здоров'я на нулі. Спочатку відновіть HP." });
    }

    const battle = await PvpBattle.findOne({ _id: req.params.id, status: 'waiting' });
    if (!battle) {
      return res.status(404).json({ error: 'Виклик уже недоступний' });
    }
    if (battle.challengerId.toString() === uid.toString()) {
      return res.status(400).json({ error: 'Не можна прийняти власний виклик' });
    }

    battle.opponentId = uid;
    battle.opponentName = req.user.username;
    battle.opponentLevel = req.user.level;
    battle.opponentHp = req.user.hp;
    battle.opponentMaxHp = req.user.maxHp;
    battle.opponentStats = req.user.getEffectiveStats();
    battle.status = 'active';
    battle.round = 1;
    battle.log.push({
      round: 0,
      type: 'system',
      text: `${req.user.username} [Рів. ${req.user.level}] прийняв виклик! Поєдинок розпочато.`,
    });
    await battle.save();

    return res.json({ battle: formatBattleForUser(battle, uid) });
  } catch (err) {
    console.error('[PVP]', err);
    return res.status(500).json({ error: 'Не вдалося прийняти виклик' });
  }
});

// Зробити хід у PvP (синхронний розрахунок, коли обидва гравці подали ходи)
router.post('/battles/:id/turn', async (req, res) => {
  try {
    const { attackZone, blockPair } = req.body;
    if (!ZONES.includes(attackZone)) {
      return res.status(400).json({ error: 'Оберіть коректну зону удару' });
    }
    if (!BLOCK_PAIRS[blockPair]) {
      return res.status(400).json({ error: 'Оберіть коректну пару зон блоку' });
    }

    const uid = req.user._id.toString();
    let battle = await PvpBattle.findOne({
      _id: req.params.id,
      status: 'active',
      $or: [{ challengerId: uid }, { opponentId: uid }],
    });
    if (!battle) {
      return res.status(404).json({ error: 'Активний PvP-бій не знайдено' });
    }

    const isChallenger = battle.challengerId.toString() === uid;
    const mySlot = isChallenger ? 'challenger' : 'opponent';

    // Атомарно фіксуємо хід: повторна відправка або гонка запитів не пройде
    const updated = await PvpBattle.findOneAndUpdate(
      { _id: battle._id, status: 'active', [`pendingMoves.${mySlot}.attackZone`]: null },
      { $set: { [`pendingMoves.${mySlot}`]: { attackZone, blockPair } } },
      { new: true },
    );
    if (!updated) {
      return res
        .status(400)
        .json({ error: 'Ви вже зробили хід у цьому раунді. Очікуйте суперника.' });
    }

    // Лише один запит "забирає" раунд для розрахунку
    const emptyMove = { attackZone: null, blockPair: null };
    const claimed = await PvpBattle.findOneAndUpdate(
      {
        _id: battle._id,
        status: 'active',
        'pendingMoves.challenger.attackZone': { $ne: null },
        'pendingMoves.opponent.attackZone': { $ne: null },
      },
      { $set: { 'pendingMoves.challenger': emptyMove, 'pendingMoves.opponent': emptyMove } },
      { new: false },
    );

    if (!claimed) {
      const freshUser = await User.findById(req.user._id);
      await freshUser.populateGear();
      return res.json({
        battle: formatBattleForUser(updated, req.user._id),
        user: freshUser.toSafeJSON(),
      });
    }

    battle = claimed;
    const cMove = claimed.pendingMoves.challenger;
    const oMove = claimed.pendingMoves.opponent;

    {
      const currentRound = battle.round;
      const cStrike = resolveStrike(
        battle.challengerName,
        battle.challengerStats,
        battle.opponentName,
        battle.opponentStats,
        cMove.attackZone,
        BLOCK_PAIRS[oMove.blockPair],
      );
      const oStrike = resolveStrike(
        battle.opponentName,
        battle.opponentStats,
        battle.challengerName,
        battle.challengerStats,
        oMove.attackZone,
        BLOCK_PAIRS[cMove.blockPair],
      );

      battle.opponentHp = Math.max(0, battle.opponentHp - cStrike.damage);
      battle.challengerHp = Math.max(0, battle.challengerHp - oStrike.damage);

      battle.log.push(
        { round: currentRound, type: cStrike.type, text: cStrike.text },
        { round: currentRound, type: oStrike.type, text: oStrike.text },
      );

      const [challengerUser, opponentUser] = await Promise.all([
        User.findById(battle.challengerId),
        User.findById(battle.opponentId),
      ]);

      if (challengerUser) {
        await challengerUser.populateGear();
        challengerUser.hp = battle.challengerHp;
      }
      if (opponentUser) {
        await opponentUser.populateGear();
        opponentUser.hp = battle.opponentHp;
      }

      if (battle.challengerHp <= 0 && battle.opponentHp <= 0) {
        battle.status = 'finished';
        battle.isDraw = true;
        battle.log.push({
          round: currentRound,
          type: 'system',
          text: 'Нічия! Обидва бійці впали одночасно.',
        });
      } else if (battle.opponentHp <= 0 || battle.challengerHp <= 0) {
        battle.status = 'finished';
        const challengerWon = battle.opponentHp <= 0;
        const winner = challengerWon ? challengerUser : opponentUser;
        const loser = challengerWon ? opponentUser : challengerUser;
        const xpGain = 70 + (loser ? loser.level * 15 : 15);
        const goldGain = 45 + (loser ? loser.level * 10 : 10);

        battle.winnerId = challengerWon ? battle.challengerId : battle.opponentId;
        battle.winnerName = challengerWon ? battle.challengerName : battle.opponentName;

        let leveledUp = false;
        if (winner) {
          winner.wins += 1;
          winner.gold += goldGain;
          leveledUp = winner.addXp(xpGain);
        }
        if (loser) {
          loser.losses += 1;
        }
        if (winner && loser) applyElo(winner, loser);

        battle.log.push({
          round: currentRound,
          type: 'system',
          text: `Переміг ${battle.winnerName}! Нагорода: +${xpGain} XP та +${goldGain} золота.${
            leveledUp ? ' Підвищено рівень!' : ''
          }`,
        });
      } else {
        battle.round += 1;
      }

      await Promise.all([
        challengerUser ? challengerUser.save() : Promise.resolve(),
        opponentUser ? opponentUser.save() : Promise.resolve(),
      ]);
    }

    await battle.save();
    const freshUser = await User.findById(req.user._id);
    await freshUser.populateGear();

    return res.json({
      battle: formatBattleForUser(battle, req.user._id),
      user: freshUser.toSafeJSON(),
    });
  } catch (err) {
    console.error('[PVP]', err);
    return res.status(500).json({ error: 'Помилка виконання PvP ходу' });
  }
});

// Здатися у PvP бою
router.post('/battles/:id/flee', async (req, res) => {
  try {
    const uid = req.user._id.toString();
    const battle = await PvpBattle.findOne({
      _id: req.params.id,
      status: 'active',
      $or: [{ challengerId: uid }, { opponentId: uid }],
    });
    if (!battle) {
      return res.status(404).json({ error: 'Активний PvP-бій не знайдено' });
    }

    const challengerFled = battle.challengerId.toString() === uid;
    battle.status = 'finished';
    battle.winnerId = challengerFled ? battle.opponentId : battle.challengerId;
    battle.winnerName = challengerFled ? battle.opponentName : battle.challengerName;
    battle.log.push({
      round: battle.round,
      type: 'system',
      text: `${req.user.username} здався. Перемога зарахована ${battle.winnerName}!`,
    });

    const [winner, loser] = await Promise.all([
      User.findById(battle.winnerId),
      User.findById(req.user._id),
    ]);
    if (winner && loser) applyElo(winner, loser);
    if (winner) {
      await winner.populateGear();
      winner.wins += 1;
      winner.gold += 35;
      winner.addXp(50);
      await winner.save();
    }
    if (loser) {
      await loser.populateGear();
      loser.losses += 1;
      await loser.save();
    }
    await battle.save();

    return res.json({
      battle: formatBattleForUser(battle, req.user._id),
      user: loser ? loser.toSafeJSON() : req.user.toSafeJSON(),
    });
  } catch (err) {
    console.error('[PVP]', err);
    return res.status(500).json({ error: 'Не вдалося здатися в PvP бою' });
  }
});

module.exports = router;
