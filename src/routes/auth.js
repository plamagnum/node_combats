const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { validate, z } = require('../utils/validate');
const { getClientInfo, recordEvent } = require('../utils/clientInfo');

const router = express.Router();

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Нікнейм має містити від 3 до 24 символів')
    .max(24, 'Нікнейм має містити від 3 до 24 символів'),
  password: z
    .string()
    .min(8, 'Пароль має містити щонайменше 8 символів')
    .max(128, 'Пароль занадто довгий'),
});
const loginSchema = z.object({
  username: z.string().trim().min(1).max(24),
  password: z.string().min(1).max(128),
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Персонаж із таким нікнеймом уже існує' });
    }

    const { ip, userAgent } = getClientInfo(req);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      passwordHash,
      role: 'player',
      registerIp: ip,
      registerUserAgent: userAgent,
      lastIp: ip,
      lastUserAgent: userAgent,
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
      loginCount: 1,
    });
    user.recalcVitals(true);
    await user.save();
    await user.populateGear();
    await recordEvent(req, 'register', { userId: user._id, username });

    return res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) {
      await recordEvent(req, 'login_failed', { userId: user?._id || null, username });
      return res.status(401).json({ error: 'Невірний нікнейм або пароль' });
    }
    if (user.isBanned) {
      return res
        .status(403)
        .json({ error: `Акаунт заблоковано${user.banReason ? `: ${user.banReason}` : ''}` });
    }

    const { ip, userAgent } = getClientInfo(req);
    user.lastIp = ip;
    user.lastUserAgent = userAgent;
    user.lastLoginAt = new Date();
    user.lastSeenAt = user.lastLoginAt;
    user.loginCount += 1;
    await user.save();
    await recordEvent(req, 'login', { userId: user._id, username });

    await user.populateGear();
    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
