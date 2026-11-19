const mongoose = require('mongoose');

const bonusSchema = new mongoose.Schema(
  {
    strength: { type: Number, default: 0 },
    agility: { type: Number, default: 0 },
    intuition: { type: Number, default: 0 },
    endurance: { type: Number, default: 0 },
    damageMin: { type: Number, default: 0 },
    damageMax: { type: Number, default: 0 },
    armor: { type: Number, default: 0 },
  },
  { _id: false },
);

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '', trim: true },
    slot: {
      type: String,
      enum: ['weapon', 'armor', 'helmet', 'ring'],
      required: true,
    },
    price: { type: Number, required: true, min: 1 },
    minLevel: { type: Number, default: 1, min: 1 },
    bonuses: {
      type: bonusSchema,
      default: () => ({}),
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Item', itemSchema);
