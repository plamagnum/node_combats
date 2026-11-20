const crypto = require('crypto');
const mongoose = require('mongoose');
const { z } = require('zod');

const MAX_SINGLE_CHOICE = 4;
// Прибираємо префікси варіантів на кшталт "а) " чи "B) "
const LABEL = /^\s*[a-zа-яіїєґ]\)\s*/i;

const answerSchema = z.object({
  text: z.string().trim().min(1).max(500),
  is_correct: z.boolean(),
});
const questionSchema = z.object({
  text: z.string().trim().min(3).max(1000),
  answers: z.array(answerSchema).min(2).max(10),
});
const batchSchema = z.object({
  subject_id: z.number().int().min(0),
  class_id: z.number().int().min(0),
  topic_id: z.number().int().min(0),
  subject_name: z.string().trim().max(80).optional(),
  class_name: z.string().trim().max(40).optional(),
  topic_name: z.string().trim().max(120).optional(),
  source_url: z.string().trim().max(500).optional(),
  questions: z.array(z.unknown()).min(1).max(2000),
});

const hashOf = (b, text) =>
  crypto
    .createHash('sha1')
    .update(
      `${b.subject_id}|${b.class_id}|${b.topic_id}|${text.toLowerCase().replace(/\s+/g, ' ')}`,
    )
    .digest('hex');

// Приймає JSON-рядок або об'єкт (один набір чи масив наборів). Повертає валідні запитання й список помилок.
function parseQuizPayload(input) {
  const errors = [];
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (err) {
      return { docs: [], errors: [`Некоректний JSON: ${err.message}`] };
    }
  }
  const batches = Array.isArray(data) ? data : [data];
  const docs = [];
  const seen = new Set();

  batches.forEach((raw, bi) => {
    const parsed = batchSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push(`Набір ${bi + 1}: ${issue.path.join('.') || 'структура'} — ${issue.message}`);
      return;
    }
    const b = parsed.data;
    b.questions.forEach((rawQ, qi) => {
      const label = `Набір ${bi + 1}, запитання ${qi + 1}`;
      const q = questionSchema.safeParse(rawQ);
      if (!q.success) {
        errors.push(`${label}: ${q.error.issues[0].path.join('.')} — ${q.error.issues[0].message}`);
        return;
      }
      const answers = q.data.answers.map((a) => ({
        text: a.text.replace(LABEL, '').trim(),
        isCorrect: a.is_correct,
      }));
      const correct = answers.filter((a) => a.isCorrect).length;
      if (answers.some((a) => !a.text)) return errors.push(`${label}: порожній варіант відповіді`);
      if (correct === 0) return errors.push(`${label}: немає правильної відповіді`);
      if (answers.length <= MAX_SINGLE_CHOICE && correct !== 1) {
        return errors.push(
          `${label}: при ${MAX_SINGLE_CHOICE} і менше варіантах має бути одна правильна відповідь`,
        );
      }
      const hash = hashOf(b, q.data.text);
      if (seen.has(hash)) return errors.push(`${label}: дублікат у файлі`);
      seen.add(hash);
      docs.push({
        subjectId: b.subject_id,
        classId: b.class_id,
        topicId: b.topic_id,
        subjectName: b.subject_name || '',
        className: b.class_name || '',
        topicName: b.topic_name || '',
        sourceUrl: b.source_url || '',
        text: q.data.text,
        answers: answers.map((a) => ({ _id: new mongoose.Types.ObjectId(), ...a })),
        hash,
      });
    });
  });
  return { docs, errors };
}

// Відповідь правильна, якщо обрано рівно множину правильних варіантів
function isCorrectSelection(question, selectedIds) {
  const correct = new Set(question.answers.filter((a) => a.isCorrect).map((a) => String(a._id)));
  const chosen = new Set(selectedIds.map(String));
  return correct.size === chosen.size && [...correct].every((id) => chosen.has(id));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const rewardGold = () => Number(process.env.QUIZ_REWARD_GOLD) || 10;
const dailyCap = () => Number(process.env.QUIZ_DAILY_GOLD_CAP) || 300;

module.exports = {
  parseQuizPayload,
  isCorrectSelection,
  shuffle,
  rewardGold,
  dailyCap,
  MAX_SINGLE_CHOICE,
};
