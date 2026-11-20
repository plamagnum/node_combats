const express = require('express');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAnswer = require('../models/QuizAnswer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { z, validate } = require('../utils/validate');
const { parseQuizPayload } = require('../services/quiz');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// JSON можна передати текстом (json) або вже розібраним об'єктом (data); файл клієнт зчитує й надсилає як текст
const importSchema = z
  .object({ json: z.string().max(5_000_000).optional(), data: z.unknown().optional() })
  .refine((b) => b.json !== undefined || b.data !== undefined, 'Передайте json або data');
const filterSchema = z.object({
  subject_id: z.coerce.number().int().min(0),
  class_id: z.coerce.number().int().min(0),
  topic_id: z.coerce.number().int().min(0),
});

router.post('/import', validate(importSchema), async (req, res) => {
  try {
    const { docs, errors } = parseQuizPayload(
      req.body.json !== undefined ? req.body.json : req.body.data,
    );
    let added = 0;
    let updated = 0;
    if (docs.length) {
      const result = await QuizQuestion.bulkWrite(
        docs.map((d) => ({
          updateOne: { filter: { hash: d.hash }, update: { $set: d }, upsert: true },
        })),
      );
      added = result.upsertedCount;
      updated = result.modifiedCount;
    }
    return res
      .status(added || updated || !errors.length ? 200 : 400)
      .json({ added, updated, skipped: errors.length, errors: errors.slice(0, 30) });
  } catch (err) {
    console.error('[ADMIN_QUIZ]', err);
    return res.status(500).json({ error: 'Не вдалося імпортувати запитання' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const groups = await QuizQuestion.aggregate([
      {
        $group: {
          _id: { subjectId: '$subjectId', classId: '$classId', topicId: '$topicId' },
          subjectName: { $first: '$subjectName' },
          topicName: { $first: '$topicName' },
          total: { $sum: 1 },
        },
      },
      { $sort: { '_id.subjectId': 1, '_id.classId': 1, '_id.topicId': 1 } },
    ]);
    return res.json({
      groups: groups.map((g) => ({
        ...g._id,
        subjectName: g.subjectName,
        topicName: g.topicName,
        total: g.total,
      })),
    });
  } catch (err) {
    console.error('[ADMIN_QUIZ]', err);
    return res.status(500).json({ error: 'Не вдалося завантажити статистику' });
  }
});

router.delete('/', validate(filterSchema, 'query'), async (req, res) => {
  try {
    const filter = {
      subjectId: req.query.subject_id,
      classId: req.query.class_id,
      topicId: req.query.topic_id,
    };
    const ids = await QuizQuestion.find(filter).distinct('_id');
    await QuizQuestion.deleteMany({ _id: { $in: ids } });
    await QuizAnswer.deleteMany({ questionId: { $in: ids } });
    return res.json({ deleted: ids.length });
  } catch (err) {
    console.error('[ADMIN_QUIZ]', err);
    return res.status(500).json({ error: 'Не вдалося видалити запитання' });
  }
});

module.exports = router;
