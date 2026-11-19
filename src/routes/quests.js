const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  questsView,
  achievementsView,
  claimQuest,
  ensureQuests,
  checkAchievements,
} = require('../services/progress');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    ensureQuests(req.user);
    checkAchievements(req.user);
    await req.user.save();
    return res.json({ quests: questsView(req.user), achievements: achievementsView(req.user) });
  } catch (err) {
    console.error('[QUESTS]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити квести' });
  }
});

router.post('/:id/claim', async (req, res) => {
  try {
    const result = claimQuest(req.user, req.params.id);
    if (result.error) return res.status(400).json({ error: result.error });
    await req.user.save();
    return res.json({
      reward: result.reward,
      user: req.user.toSafeJSON(),
      quests: questsView(req.user),
    });
  } catch (err) {
    console.error('[QUESTS]', err);
    return res.status(500).json({ error: 'Не вдалося отримати нагороду' });
  }
});

module.exports = router;
