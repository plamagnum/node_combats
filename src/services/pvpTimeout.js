const PvpBattle = require('../models/PvpBattle');
const User = require('../models/User');
const { applyElo } = require('./rating');

const MOVE_TIMEOUT_MS = (Number(process.env.PVP_TURN_TIMEOUT_SEC) || 300) * 1000;
const WAITING_TTL_MS = (Number(process.env.PVP_CHALLENGE_TTL_SEC) || 900) * 1000;
const INTERVAL_MS = 30 * 1000;

async function finishByInactivity(battle) {
  const cMoved = Boolean(battle.pendingMoves?.challenger?.attackZone);
  const oMoved = Boolean(battle.pendingMoves?.opponent?.attackZone);

  const claimed = await PvpBattle.findOneAndUpdate(
    { _id: battle._id, status: 'active', updatedAt: battle.updatedAt },
    { $set: { status: 'finished' } },
    { new: true },
  );
  if (!claimed) return;

  // Програє той, хто не зробив хід; якщо обидва мовчали або обидва походили — нічия
  if (cMoved === oMoved) {
    claimed.isDraw = true;
    claimed.log.push({
      round: claimed.round,
      type: 'system',
      text: 'Бій завершено за неактивністю: нічия.',
    });
    await claimed.save();
    return;
  }

  const challengerWon = cMoved;
  claimed.winnerId = challengerWon ? claimed.challengerId : claimed.opponentId;
  claimed.winnerName = challengerWon ? claimed.challengerName : claimed.opponentName;
  const loserId = challengerWon ? claimed.opponentId : claimed.challengerId;
  claimed.log.push({
    round: claimed.round,
    type: 'system',
    text: `Час на хід вичерпано. Перемога зарахована ${claimed.winnerName}!`,
  });
  await claimed.save();

  const [winner, loser] = await Promise.all([
    User.findById(claimed.winnerId),
    User.findById(loserId),
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
    loser.losses += 1;
    await loser.save();
  }
}

async function runOnce(now = Date.now()) {
  await PvpBattle.updateMany(
    { status: 'waiting', updatedAt: { $lt: new Date(now - WAITING_TTL_MS) } },
    { $set: { status: 'cancelled' } },
  );
  const stale = await PvpBattle.find({
    status: 'active',
    updatedAt: { $lt: new Date(now - MOVE_TIMEOUT_MS) },
  }).limit(50);
  for (const battle of stale) {
    await finishByInactivity(battle);
  }
}

function startPvpTimeoutJob() {
  const timer = setInterval(() => {
    runOnce().catch((err) => console.error('[PVP_TIMEOUT]', err.message));
  }, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startPvpTimeoutJob, runOnce };
