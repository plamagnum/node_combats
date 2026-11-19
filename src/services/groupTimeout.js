const GroupBattle = require('../models/GroupBattle');
const { advance } = require('./groupBattle');

const TURN_TIMEOUT_MS = (Number(process.env.GROUP_TURN_TIMEOUT_SEC) || 60) * 1000;
const LOBBY_TTL_MS = (Number(process.env.GROUP_LOBBY_TTL_SEC) || 900) * 1000;
const STALE_RESOLVE_MS = 15 * 1000;
const INTERVAL_MS = 10 * 1000;

async function runOnce(now = Date.now()) {
  await GroupBattle.updateMany(
    { status: 'lobby', createdAt: { $lt: new Date(now - LOBBY_TTL_MS) } },
    { $set: { status: 'cancelled' } },
  );
  // Розблокування раундів, що «зависли» після збою під час розрахунку
  await GroupBattle.updateMany(
    {
      status: 'active',
      resolving: true,
      resolveStartedAt: { $lt: new Date(now - STALE_RESOLVE_MS) },
    },
    { $set: { resolving: false, resolveStartedAt: null } },
  );
  const stale = await GroupBattle.find({
    status: 'active',
    resolving: false,
    roundStartedAt: { $lt: new Date(now - TURN_TIMEOUT_MS) },
  }).limit(50);
  for (const b of stale) {
    await advance(b._id, { force: true });
  }
}

function startGroupTimeoutJob() {
  const timer = setInterval(() => {
    runOnce().catch((err) => console.error('[GROUP_TIMEOUT]', err.message));
  }, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startGroupTimeoutJob, runOnce };
