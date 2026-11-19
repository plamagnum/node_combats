const LoginEvent = require('../models/LoginEvent');

function getClientInfo(req) {
  return {
    ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 64),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
  };
}

async function recordEvent(req, type, { userId = null, username = '' } = {}) {
  const { ip, userAgent } = getClientInfo(req);
  try {
    await LoginEvent.create({ userId, username, type, ip, userAgent });
  } catch (err) {
    console.error('[LOGIN_EVENT]', err.message);
  }
}

module.exports = { getClientInfo, recordEvent };
