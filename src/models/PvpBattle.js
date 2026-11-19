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

const moveSchema = new mongoose.Schema(
  {
    attackZone: { type: String, default: null },
    blockPair: { type: String, default: null },
  },
  { _id: false },
);

const snapshotStatsSchema = new mongoose.Schema(
  {
    strength: { type: Number, default: 5 },
    agility: { type: Number, default: 5 },
    intuition: { type: Number, default: 5 },
    endurance: { type: Number, default: 5 },
    damageMin: { type: Number, default: 0 },
    damageMax: { type: Number, default: 0 },
    armor: { type: Number, default: 0 },
  },
  { _id: false },
);

const pvpBattleSchema = new mongoose.Schema(
  {
    challengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    challengerName: { type: String, required: true },
    challengerLevel: { type: Number, required: true },
    challengerHp: { type: Number, required: true },
    challengerMaxHp: { type: Number, required: true },
    challengerStats: { type: snapshotStatsSchema, required: true },

    opponentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    opponentName: { type: String, default: null },
    opponentLevel: { type: Number, default: null },
    opponentHp: { type: Number, default: 0 },
    opponentMaxHp: { type: Number, default: 0 },
    opponentStats: { type: snapshotStatsSchema, default: null },

    status: {
      type: String,
      enum: ['waiting', 'active', 'finished', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    round: { type: Number, default: 0 },
    pendingMoves: {
      challenger: { type: moveSchema, default: () => ({}) },
      opponent: { type: moveSchema, default: () => ({}) },
    },
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    winnerName: { type: String, default: null },
    isDraw: { type: Boolean, default: false },
    log: { type: [logEntrySchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PvpBattle', pvpBattleSchema);
