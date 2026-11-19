require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { seedInitialData } = require('./services/seed');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const shopRoutes = require('./routes/shop');
const pvpRoutes = require('./routes/pvp');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'combats-arena' });
});

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/admin', adminRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  try {
    await connectDB();
    await seedInitialData();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Combats Arena запущено на http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Не вдалося запустити сервер:', err);
    process.exit(1);
  }
}

start();
