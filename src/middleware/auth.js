const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_combats_jwt_key_change_me';

function signToken(user) {
  return jwt.sign({ userId: user._id.toString(), role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Потрібна авторизація' });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'Користувача не знайдено' });
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
