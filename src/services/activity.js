const GroupBattle = require('../models/GroupBattle');

// Чи бере гравець участь у груповому бої (activeOnly — лише бій, що триває)
async function inGroupBattle(userId, { activeOnly = false } = {}) {
  const statuses = activeOnly ? ['active'] : ['lobby', 'active'];
  const found = await GroupBattle.exists({
    status: { $in: statuses },
    participants: { $elemMatch: { userId, isNpc: false, fled: false } },
  });
  return Boolean(found);
}

module.exports = { inGroupBattle };
