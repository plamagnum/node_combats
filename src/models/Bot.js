const mongoose = require('mongoose');

const botSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    title: { type: String, default: 'Боєць Арени', trim: true },
    level: { type: Number, default: 1, min: 1 },
    rewardXp: { type: Number, default: 35, min: 1 },
    rewardGold: { type: Number, default: 20, min: 0 },
    stats: {
      strength: { type: Number, default: 4, min: 1 },
      agility: { type: Number, default: 4, min: 1 },
      intuition: { type: Number, default: 4, min: 1 },
      endurance: { type: Number, default: 4, min: 1 },
    },
    maxHp: { type: Number, default: 100, min: 20 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

botSchema.pre('save', function recalcBotHp(next) {
  this.maxHp = 60 + this.stats.endurance * 10 + (this.level - 1) * 15;
  next();
});

module.exports = mongoose.model('Bot', botSchema);
