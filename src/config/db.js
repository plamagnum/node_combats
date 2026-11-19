const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://root:rootpass@mongo:27017/combats?authSource=admin';
  const maxRetries = 10;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(uri);
      console.log('[DB] Підключено до MongoDB');
      return;
    } catch (err) {
      console.error(`[DB] Спроба ${attempt}/${maxRetries} не вдалася:`, err.message);
      if (attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

module.exports = { connectDB };
