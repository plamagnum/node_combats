const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Спрощена реєстрація: лише логін та пароль
router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ error: 'Нікнейм має містити від 3 до 24 символів' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Пароль має містити щонайменше 4 символи' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Персонаж із таким нікнеймом уже існує' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      passwordHash,
      role: 'player',
    });
    user.recalcVitals(true);
    await user.save();
    await user.populateGear();

    const token = signToken(user);
    return res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Помилка реєстрації', details: err.message });
  }
});

// Вхід
router.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Невірний нікнейм або пароль' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Невірний нікнейм або пароль' });
    }

    await user.populateGear();
    const token = signToken(user);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: 'Помилка входу', details: err.message });
  }
});

// Профіль поточного гравця
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
