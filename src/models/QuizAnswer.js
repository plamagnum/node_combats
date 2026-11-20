const mongoose = require('mongoose');

// Одна відповідь на запитання на гравця: запобігає повторному фарму золота
const quizAnswerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
    correct: { type: Boolean, required: true },
    gold: { type: Number, default: 0 },
  },
  { timestamps: true },
);

quizAnswerSchema.index({ userId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('QuizAnswer', quizAnswerSchema);
