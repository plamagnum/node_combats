const mongoose = require('mongoose');

const logEntrySchema = new mongoose.Schema(
  {
    round: { type: Number, required: true },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ['hit', 'crit', 'block', 'dodge', 'system'],
      default: 'system',
    },
  },
  { _id: false },
);

const battleSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    botId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bot',
      required: true,
    },
    botName: { type: String, required: true },
    botTitle: { type: String, default: '' },
    botLevel: { type: Number, required: true },
    status: {
      type: String,
      enum: ['active', 'won', 'lost', 'draw'],
      default: 'active',
      index: true,
    },
    round: { type: Number, default: 0 },
    playerHp: { type: Number, required: true },
    playerMaxHp: { type: Number, required: true },
    botHp: { type: Number, required: true },
    botMaxHp: { type: Number, required: true },
    log: { type: [logEntrySchema], default: [] },
    reward: {
      xp: { type: Number, default: 0 },
      gold: { type: Number, default: 0 },
      leveledUp: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Battle', battleSchema);
