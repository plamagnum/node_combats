const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema(
  {
    strength: { type: Number, default: 5, min: 1 },
    agility: { type: Number, default: 5, min: 1 },
    intuition: { type: Number, default: 5, min: 1 },
    endurance: { type: Number, default: 5, min: 1 },
  },
  { _id: false },
);

const equipmentSchema = new mongoose.Schema(
  {
    weapon: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    armor: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    helmet: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    ring: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  },
  { _id: false },
);

const { AVATAR_OPTIONS, DEFAULT_AVATAR } = require('../services/avatar');

const avatarSchema = new mongoose.Schema(
  Object.fromEntries(
    Object.keys(DEFAULT_AVATAR).map((k) => [
      k,
      { type: String, enum: AVATAR_OPTIONS[k], default: DEFAULT_AVATAR[k] },
    ]),
  ),
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['player', 'admin'],
      default: 'player',
    },
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0, min: 0 },
    gold: { type: Number, default: 80, min: 0 },
    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    freeStats: { type: Number, default: 3, min: 0 },
    stats: {
      type: statsSchema,
      default: () => ({ strength: 5, agility: 5, intuition: 5, endurance: 5 }),
    },
    inventory: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
      default: [],
    },
    equipment: {
      type: equipmentSchema,
      default: () => ({ weapon: null, armor: null, helmet: null, ring: null }),
    },
    gender: { type: String, enum: AVATAR_OPTIONS.gender, default: 'male' },
    avatar: { type: avatarSchema, default: () => ({}) },
    clanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clan', default: null, index: true },
    clanTag: { type: String, default: '' },
    clanRole: { type: String, enum: ['member', 'leader'], default: 'member' },
    achievements: { type: [String], default: [] },
    counters: {
      type: new mongoose.Schema(
        {
          pveWins: { type: Number, default: 0 },
          pvpWins: { type: Number, default: 0 },
          groupWins: { type: Number, default: 0 },
          dungeonClears: { type: Number, default: 0 },
          bossKills: { type: Number, default: 0 },
          purchases: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    quests: {
      type: new mongoose.Schema(
        {
          date: { type: String, default: '' },
          list: {
            type: [
              new mongoose.Schema(
                {
                  id: String,
                  progress: { type: Number, default: 0 },
                  claimed: { type: Boolean, default: false },
                },
                { _id: false },
              ),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
      default: () => ({ date: '', list: [] }),
    },
    rating: { type: Number, default: 1000, min: 0, index: true },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: '', maxlength: 200 },
    registerIp: { type: String, default: '' },
    registerUserAgent: { type: String, default: '' },
    lastIp: { type: String, default: '' },
    lastUserAgent: { type: String, default: '' },
    lastLoginAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0, min: 0 },
    maxHp: { type: Number, default: 110, min: 10 },
    hp: { type: Number, default: 110, min: 0 },
  },
  { timestamps: true },
);

userSchema.methods.getEquipmentBonuses = function getEquipmentBonuses() {
  const totals = {
    strength: 0,
    agility: 0,
    intuition: 0,
    endurance: 0,
    damageMin: 0,
    damageMax: 0,
    armor: 0,
  };
  const eq = this.equipment || {};
  ['weapon', 'armor', 'helmet', 'ring'].forEach((slot) => {
    const item = eq[slot];
    if (item && item.bonuses) {
      totals.strength += item.bonuses.strength || 0;
      totals.agility += item.bonuses.agility || 0;
      totals.intuition += item.bonuses.intuition || 0;
      totals.endurance += item.bonuses.endurance || 0;
      totals.damageMin += item.bonuses.damageMin || 0;
      totals.damageMax += item.bonuses.damageMax || 0;
      totals.armor += item.bonuses.armor || 0;
    }
  });
  return totals;
};

userSchema.methods.getEffectiveStats = function getEffectiveStats() {
  const b = this.getEquipmentBonuses();
  return {
    strength: this.stats.strength + b.strength,
    agility: this.stats.agility + b.agility,
    intuition: this.stats.intuition + b.intuition,
    endurance: this.stats.endurance + b.endurance,
    damageMin: b.damageMin,
    damageMax: b.damageMax,
    armor: b.armor,
  };
};

userSchema.methods.computeMaxHp = function computeMaxHp() {
  const eff = this.getEffectiveStats();
  return 60 + eff.endurance * 10 + (this.level - 1) * 15;
};

userSchema.methods.recalcVitals = function recalcVitals(fullHeal = false) {
  this.maxHp = this.computeMaxHp();
  if (fullHeal || this.hp > this.maxHp) {
    this.hp = this.maxHp;
  }
};

userSchema.methods.addXp = function addXp(amount) {
  this.xp += amount;
  let leveledUp = false;
  while (this.xp >= this.level * 100) {
    this.xp -= this.level * 100;
    this.level += 1;
    this.freeStats += 3;
    leveledUp = true;
  }
  this.recalcVitals(leveledUp);
  return leveledUp;
};

userSchema.methods.applyAvatar = function applyAvatar(changes) {
  const { gender, ...parts } = changes;
  if (gender) this.gender = gender;
  Object.entries(parts).forEach(([k, v]) => {
    this.avatar[k] = v;
  });
};

userSchema.methods.populateGear = async function populateGear() {
  await this.populate([
    { path: 'inventory' },
    { path: 'equipment.weapon' },
    { path: 'equipment.armor' },
    { path: 'equipment.helmet' },
    { path: 'equipment.ring' },
  ]);
  return this;
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const effectiveStats = this.getEffectiveStats();
  return {
    id: this._id,
    username: this.username,
    role: this.role,
    level: this.level,
    xp: this.xp,
    nextLevelXp: this.level * 100,
    gold: this.gold,
    wins: this.wins,
    losses: this.losses,
    rating: this.rating,
    clanId: this.clanId,
    clanTag: this.clanTag,
    clanRole: this.clanRole,
    gender: this.gender,
    avatar: {
      ...DEFAULT_AVATAR,
      ...(this.avatar?.toObject ? this.avatar.toObject() : this.avatar),
    },
    freeStats: this.freeStats,
    stats: this.stats,
    effectiveStats,
    inventory: this.inventory || [],
    equipment: this.equipment || { weapon: null, armor: null, helmet: null, ring: null },
    hp: this.hp,
    maxHp: this.maxHp,
    createdAt: this.createdAt,
  };
};

// Детальні дані для адмін-панелі (IP, user-agent, активність)
userSchema.methods.toAdminDetails = function toAdminDetails() {
  return {
    ...this.toSafeJSON(),
    isBanned: this.isBanned,
    banReason: this.banReason,
    registerIp: this.registerIp,
    registerUserAgent: this.registerUserAgent,
    lastIp: this.lastIp,
    lastUserAgent: this.lastUserAgent,
    lastLoginAt: this.lastLoginAt,
    lastSeenAt: this.lastSeenAt,
    loginCount: this.loginCount,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
