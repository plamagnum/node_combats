const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getClientInfo } = require('../utils/clientInfo');

const SEEN_THROTTLE_MS = 60 * 1000;

function getSecret() {
  return process.env.JWT_SECRET;
}

function signToken(user) {
  return jwt.sign({ userId: user._id.toString(), role: user.role }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Потрібна авторизація' });
    }
    const payload = jwt.verify(token, getSecret());
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'Користувача не знайдено' });
    }
    if (user.isBanned) {
      return res
        .status(403)
        .json({ error: `Акаунт заблоковано${user.banReason ? `: ${user.banReason}` : ''}` });
    }
    const now = Date.now();
    if (!user.lastSeenAt || now - user.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
      const { ip, userAgent } = getClientInfo(req);
      user.lastSeenAt = new Date(now);
      user.lastIp = ip;
      user.lastUserAgent = userAgent;
      await User.updateOne(
        { _id: user._id },
        { $set: { lastSeenAt: user.lastSeenAt, lastIp: ip, lastUserAgent: userAgent } },
      );
    }
    await user.populateGear();
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Недійсний або прострочений токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ лише для адміністратора' });
  }
  return next();
}

module.exports = { signToken, requireAuth, requireAdmin };
