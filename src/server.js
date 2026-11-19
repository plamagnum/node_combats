require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { validateEnv } = require('./config/env');
const { connectDB } = require('./config/db');
const { seedInitialData } = require('./services/seed');
const { attachChat } = require('./services/chat');
const { startPvpTimeoutJob } = require('./services/pvpTimeout');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const shopRoutes = require('./routes/shop');
const pvpRoutes = require('./routes/pvp');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS_ORIGIN — список дозволених origin через кому; без нього лише same-origin
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', service: 'combats-arena' });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато спроб. Спробуйте пізніше.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато запитів. Спробуйте пізніше.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', req.method, req.originalUrl, err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некоректний JSON' });
  }
  return res.status(err.status || 500).json({ error: 'Внутрішня помилка сервера' });
});

async function start() {
  try {
    validateEnv();
    await connectDB();
    await seedInitialData();
    const server = http.createServer(app);
    const io = attachChat(server, allowedOrigins);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Combats Arena запущено на http://localhost:${PORT}`);
    });
    const stopJob = startPvpTimeoutJob();

    let closing = false;
    const shutdown = (signal) => {
      if (closing) return;
      closing = true;
      console.log(`[SERVER] ${signal}: завершення роботи...`);
      stopJob();
      io.close();
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[FATAL] Не вдалося запустити сервер:', err);
    process.exit(1);
  }
}

start();
