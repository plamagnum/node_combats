const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');

const MAX_LEN = 300;
const BURST = 5;
const WINDOW_MS = 10 * 1000;
const HISTORY = 50;

function serialize(m) {
  return {
    id: m._id,
    userId: m.userId,
    username: m.username,
    role: m.role,
    level: m.level,
    text: m.text,
    createdAt: m.createdAt,
  };
}

async function getHistory() {
  const list = await ChatMessage.find().sort({ createdAt: -1 }).limit(HISTORY).lean();
  return list.reverse().map(serialize);
}

// Загальний чат у реальному часі (Socket.IO), авторизація через JWT
function attachChat(httpServer, allowedOrigins = []) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins.length ? allowedOrigins : false },
    maxHttpBufferSize: 4 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token || '', process.env.JWT_SECRET);
      const user = await User.findById(payload.userId);
      if (!user || user.isBanned) return next(new Error('unauthorized'));
      socket.data.user = {
        id: user._id,
        username: user.username,
        role: user.role,
        level: user.level,
      };
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const sent = [];
    try {
      socket.emit('chat:history', await getHistory());
    } catch (err) {
      console.error('[CHAT] history', err.message);
    }

    socket.on('chat:send', async (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text || text.length > MAX_LEN)
        return reply({ error: `Повідомлення: 1–${MAX_LEN} символів` });

      const now = Date.now();
      while (sent.length && now - sent[0] > WINDOW_MS) sent.shift();
      if (sent.length >= BURST) return reply({ error: 'Занадто часто. Зачекайте кілька секунд.' });
      sent.push(now);

      try {
        const fresh = await User.findById(socket.data.user.id).select(
          'isBanned level username role',
        );
        if (!fresh || fresh.isBanned) {
          socket.disconnect(true);
          return reply({ error: 'Акаунт недоступний' });
        }
        const msg = await ChatMessage.create({
          userId: fresh._id,
          username: fresh.username,
          role: fresh.role,
          level: fresh.level,
          text,
        });
        io.emit('chat:message', serialize(msg));
        return reply({ ok: true });
      } catch (err) {
        console.error('[CHAT] send', err.message);
        return reply({ error: 'Не вдалося надіслати повідомлення' });
      }
    });
  });

  return io;
}

module.exports = { attachChat, getHistory };
