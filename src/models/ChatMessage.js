const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    clanTag: { type: String, default: '' },
    role: { type: String, default: 'player' },
    level: { type: Number, default: 1 },
    text: { type: String, required: true, maxlength: 300 },
    createdAt: { type: Date, default: Date.now, index: true, expires: 60 * 60 * 24 * 7 },
  },
  { versionKey: false },
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
