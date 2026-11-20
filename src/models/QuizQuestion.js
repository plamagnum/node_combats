const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema(
  {
    subjectId: { type: Number, required: true },
    classId: { type: Number, required: true },
    topicId: { type: Number, required: true },
    subjectName: { type: String, default: '' },
    className: { type: String, default: '' },
    topicName: { type: String, default: '' },
    text: { type: String, required: true },
    answers: [
      { text: { type: String, required: true }, isCorrect: { type: Boolean, required: true } },
    ],
    sourceUrl: { type: String, default: '' },
    hash: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

quizQuestionSchema.index({ subjectId: 1, classId: 1, topicId: 1 });

// Більше 4 варіантів — можна кілька правильних, інакше лише один
quizQuestionSchema.virtual('multi').get(function multi() {
  return this.answers.length > 4;
});

module.exports = mongoose.model('QuizQuestion', quizQuestionSchema);
