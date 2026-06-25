import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';

let io;

// ─── Initialize Socket.io ────────────────────────────────────
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    connectionTimeout: 10000,
  });

  // ─── Auth middleware ───────────────────────────────────────
  // Tries socket.handshake.auth.token first (mobile/native clients),
  // then falls back to the httpOnly accessToken cookie (browser clients).
  io.use((socket, next) => {
    let token = socket.handshake.auth?.token;

    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie;
      if (cookieHeader) {
        const cookies = parseCookie(cookieHeader);
        token = cookies.accessToken;
      }
    }

    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  // ─── Connection handler ────────────────────────────────────
  io.on('connection', (socket) => {
    const { userId: userId, role } = socket.user;

    console.info(`Connected: ${userId} [${role}]`);

    // Personal room (for targeted events)
    socket.join(userId);
    // Role room (for broadcasts to all admins, all students, etc.)
    socket.join(role);

    // ── Messaging events ──────────────────────────────────────
    socket.on('message:send', async (data) => {
      socket.to(data.recipientId).emit('message:new', {
        conversationId: data.conversationId,
        senderId: userId,
        content: data.content,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('message:read', (data) => {
      socket.to(data.senderId).emit('message:read', {
        conversationId: data.conversationId,
        readBy: userId,
        readAt: new Date().toISOString(),
      });
    });

    // ── Typing indicators ─────────────────────────────────────
    socket.on('typing:start', (data) => {
      socket.to(data.recipientId).emit('typing:indicator', {
        conversationId: data.conversationId,
        userId,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(data.recipientId).emit('typing:indicator', {
        conversationId: data.conversationId,
        userId,
        isTyping: false,
      });
    });

    // ── Help chat typing ──────────────────────────────────────
    socket.on('helpChat:typing', (data) => {
      // data = { chatId, recipientId }
      socket.to(data.recipientId).emit('helpChat:typing', {
        chatId: data.chatId,
        userId,
        isTyping: !!data.isTyping,
      });
    });

    // ── Disconnect ────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.info(`Disconnected: ${userId} — reason: ${reason}`);
    });
  });

  console.info('Socket.io initialized');
  return io;
};

// ─── Get IO instance ─────────────────────────────────────────
export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized — call initSocket first');
  return io;
};

// ─── Best-effort emit ────────────────────────────────────────
// Realtime updates are a side effect, never a hard dependency. This emits to a
// room if the socket layer is up and silently no-ops otherwise, so a missing or
// failed realtime layer can never take down a core flow (booking, cancel, etc.).
export const emitToRoom = (room, event, payload) => {
  if (!io) return false;
  try {
    io.to(room).emit(event, payload);
    return true;
  } catch {
    return false;
  }
};
