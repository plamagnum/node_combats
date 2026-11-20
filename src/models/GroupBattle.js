const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema(
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

const moveSchema = new mongoose.Schema(
  {
    attackZone: { type: String, default: null },
    blockPair: { type: String, default: null },
    targetIdx: { type: Number, default: null },
    skill: { type: String, default: null },
  },
  { _id: false },
);

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true },
    level: { type: Number, default: 1 },
    team: { type: String, enum: ['A', 'B'], required: true },
    isNpc: { type: Boolean, default: false },
    boss: { type: Boolean, default: false },
    emoji: { type: String, default: '' },
    clanTag: { type: String, default: '' },
    gender: { type: String, default: 'male' },
    avatar: { type: mongoose.Schema.Types.Mixed, default: null },
    rating: { type: Number, default: 1000 },
    hp: { type: Number, default: 0 },
    maxHp: { type: Number, default: 0 },
    stats: { type: statsSchema, default: null },
    skills: { type: [String], default: [] },
    mana: { type: Number, default: 0 },
    maxMana: { type: Number, default: 0 },
    cooldowns: { type: [{ _id: false, id: String, left: Number }], default: [] },
    buffs: { type: [{ _id: false, kind: String, amount: Number, left: Number }], default: [] },
    fled: { type: Boolean, default: false },
    missed: { type: Number, default: 0 },
    move: { type: moveSchema, default: () => ({}) },
    earnXp: { type: Number, default: 0 },
    earnGold: { type: Number, default: 0 },
    ratingDelta: { type: Number, default: 0 },
  },
  { _id: false },
);

const logSchema = new mongoose.Schema(
  {
    round: Number,
    type: { type: String, enum: ['hit', 'crit', 'block', 'dodge', 'system'], default: 'system' },
    text: String,
  },
  { _id: false },
);

const groupBattleSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['pvp', 'dungeon'], required: true },
    status: {
      type: String,
      enum: ['lobby', 'active', 'finished', 'cancelled'],
      default: 'lobby',
      index: true,
    },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hostName: String,
    teamSize: { type: Number, default: 2, min: 1, max: 3 },
    dungeonId: { type: String, default: null },
    floor: { type: Number, default: 0 },
    totalFloors: { type: Number, default: 0 },
    round: { type: Number, default: 0 },
    resolving: { type: Boolean, default: false },
    resolveStartedAt: { type: Date, default: null },
    roundStartedAt: { type: Date, default: null },
    participants: { type: [participantSchema], default: [] },
    log: { type: [logSchema], default: [] },
    winnerTeam: { type: String, enum: ['A', 'B', 'draw', null], default: null },
    rewardsApplied: { type: Boolean, default: false },
    bossKills: { type: Number, default: 0 },
    dungeonCleared: { type: Boolean, default: false },
  },
  { timestamps: true },
);

groupBattleSchema.index({ 'participants.userId': 1, status: 1 });

module.exports = mongoose.model('GroupBattle', groupBattleSchema);
