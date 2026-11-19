const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { SKILLS, getSkill, maxManaFor } = require('../services/skills');

const router = express.Router();
router.use(requireAuth);

const view = (user) => ({
  gold: user.gold,
  maxMana: maxManaFor(user.getEffectiveStats()),
  skills: SKILLS.map((s) => ({
    ...s,
    learned: user.skills.includes(s.id),
    locked: user.level < s.minLevel,
  })),
});

router.get('/', (req, res) => res.json(view(req.user)));

router.post('/:id/learn', async (req, res) => {
  try {
    const skill = getSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Навичку не знайдено' });
    if (req.user.level < skill.minLevel) {
      return res.status(400).json({ error: `Потрібен рівень ${skill.minLevel}` });
    }
    // Атомарно: списання золота й додавання навички
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, gold: { $gte: skill.price }, skills: { $ne: skill.id } },
      { $inc: { gold: -skill.price }, $push: { skills: skill.id } },
      { new: true },
    );
    if (!user) return res.status(400).json({ error: 'Недостатньо золота або навичку вже вивчено' });
    await user.populateGear();
    return res.json({ ...view(user), user: user.toSafeJSON() });
  } catch (err) {
    console.error('[SKILLS]', err);
    return res.status(500).json({ error: 'Не вдалося вивчити навичку' });
  }
});

module.exports = router;
