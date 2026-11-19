const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    username: { type: String, default: '' },
    type: { type: String, enum: ['register', 'login', 'login_failed'], required: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  },
  { versionKey: false },
);

module.exports = mongoose.model('LoginEvent', loginEventSchema);
