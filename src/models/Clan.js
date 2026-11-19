const mongoose = require('mongoose');

const clanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
    tag: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 5,
    },
    description: { type: String, default: '', maxlength: 120 },
    leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    xp: { type: Number, default: 0, min: 0 },
    treasury: { type: Number, default: 0, min: 0 },
    memberCount: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true },
);

clanSchema.virtual('level').get(function level() {
  return Math.floor(Math.sqrt(this.xp / 100)) + 1;
});

module.exports = mongoose.model('Clan', clanSchema);
