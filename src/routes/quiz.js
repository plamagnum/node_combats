const express = require('express');
const User = require('../models/User');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAnswer = require('../models/QuizAnswer');
const { requireAuth } = require('../middleware/auth');
const { z, objectId, validate } = require('../utils/validate');
const { isCorrectSelection, shuffle, rewardGold, dailyCap } = require('../services/quiz');
const { todayKey } = require('../services/progress');

const router = express.Router();
router.use(requireAuth);

const filterSchema = z.object({
  subject_id: z.coerce.number().int().min(0).optional(),
  class_id: z.coerce.number().int().min(0).optional(),
  topic_id: z.coerce.number().int().min(0).optional(),
});
const answerBody = z.object({
  questionId: objectId,
  answerIds: z.array(objectId).min(1).max(10),
});

function toFilter(q) {
  const f = {};
  if (q.subject_id !== undefined) f.subjectId = q.subject_id;
  if (q.class_id !== undefined) f.classId = q.class_id;
  if (q.topic_id !== undefined) f.topicId = q.topic_id;
  return f;
}

// Скидає лічильник денного ліміту, якщо настав новий день
async function earnedToday(userId) {
  const today = todayKey();
  await User.updateOne(
    { _id: userId, 'quizDaily.date': { $ne: today } },
    { $set: { quizDaily: { date: today, gold: 0 } } },
  );
  const u = await User.findById(userId).select('quizDaily');
  return u.quizDaily.gold;
}

router.get('/meta', async (req, res) => {
  try {
    const answered = await QuizAnswer.find({ userId: req.user._id }).distinct('questionId');
    const groups = await QuizQuestion.aggregate([
      {
        $group: {
          _id: { subjectId: '$subjectId', classId: '$classId', topicId: '$topicId' },
          subjectName: { $first: '$subjectName' },
          className: { $first: '$className' },
          topicName: { $first: '$topicName' },
          total: { $sum: 1 },
          remaining: { $sum: { $cond: [{ $in: ['$_id', answered] }, 0, 1] } },
        },
      },
      { $sort: { '_id.subjectId': 1, '_id.classId': 1, '_id.topicId': 1 } },
    ]);
    return res.json({
      groups: groups.map((g) => ({
        ...g._id,
        subjectName: g.subjectName,
        className: g.className,
        topicName: g.topicName,
        total: g.total,
        remaining: g.remaining,
      })),
      reward: rewardGold(),
      dailyCap: dailyCap(),
      earnedToday: await earnedToday(req.user._id),
    });
  } catch (err) {
    console.error('[QUIZ]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити тести' });
  }
});

router.get('/next', validate(filterSchema, 'query'), async (req, res) => {
  try {
    const answered = await QuizAnswer.find({ userId: req.user._id }).distinct('questionId');
    const [q] = await QuizQuestion.aggregate([
      { $match: { ...toFilter(req.query), _id: { $nin: answered } } },
      { $sample: { size: 1 } },
    ]);
    if (!q) return res.json({ question: null });
    return res.json({
      question: {
        id: q._id,
        text: q.text,
        multi: q.answers.length > 4,
        answers: shuffle(q.answers).map((a) => ({ id: a._id, text: a.text })),
      },
    });
  } catch (err) {
    console.error('[QUIZ]', err);
    return res.status(500).json({ error: 'Не вдалося отримати запитання' });
  }
});

router.post('/answer', validate(answerBody), async (req, res) => {
  try {
    const { questionId, answerIds } = req.body;
    const question = await QuizQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Запитання не знайдено' });

    const valid = new Set(question.answers.map((a) => String(a._id)));
    const unique = [...new Set(answerIds)];
    if (unique.length !== answerIds.length || unique.some((id) => !valid.has(id))) {
      return res.status(400).json({ error: 'Некоректні варіанти відповіді' });
    }
    if (!question.multi && unique.length !== 1) {
      return res.status(400).json({ error: 'Оберіть лише один варіант' });
    }

    const reward = rewardGold();
    const correct = isCorrectSelection(question, unique);
    if (correct && (await earnedToday(req.user._id)) + reward > dailyCap()) {
      return res.status(400).json({
        error: `Денний ліміт золота за тести (${dailyCap()}) вичерпано. Повертайтеся завтра!`,
      });
    }

    // Унікальний індекс гарантує, що на запитання відповідають лише раз
    try {
      await QuizAnswer.create({
        userId: req.user._id,
        questionId,
        correct,
        gold: correct ? reward : 0,
      });
    } catch (err) {
      if (err.code === 11000)
        return res.status(409).json({ error: 'Ви вже відповідали на це запитання' });
      throw err;
    }

    let gold = 0;
    let user = req.user;
    if (correct) {
      const updated = await User.findOneAndUpdate(
        { _id: req.user._id, 'quizDaily.gold': { $lte: dailyCap() - reward } },
        { $inc: { gold: reward, 'quizDaily.gold': reward } },
        { new: true },
      );
      if (updated) {
        gold = reward;
        user = updated;
      } else {
        await QuizAnswer.deleteOne({ userId: req.user._id, questionId });
        return res.status(400).json({ error: 'Денний ліміт золота за тести вичерпано' });
      }
    }
    await user.populateGear();
    return res.json({
      correct,
      gold,
      correctIds: question.answers.filter((a) => a.isCorrect).map((a) => a._id),
      user: user.toSafeJSON(),
    });
  } catch (err) {
    console.error('[QUIZ]', err);
    return res.status(500).json({ error: 'Не вдалося перевірити відповідь' });
  }
});

module.exports = router;
