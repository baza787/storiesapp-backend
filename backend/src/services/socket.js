const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');

const onlineUsers = new Map(); // userId -> socketId

const setupSocket = (io) => {
  // Auth middleware for socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`✅ Socket connected: ${socket.user.username}`);

    // Track online status
    onlineUsers.set(userId, socket.id);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('userOnline', { userId });

    // Join personal room
    socket.join(userId);

    // Send a message via socket
    socket.on('sendMessage', async ({ chatId, content, type }) => {
      try {
        const chat = await Chat.findOne({
          _id: chatId,
          participants: socket.user._id
        });
        if (!chat) return;

        const message = {
          sender: socket.user._id,
          content,
          type: type || 'text',
          createdAt: new Date()
        };

        chat.messages.push(message);
        chat.lastMessage = { content, sender: socket.user._id, createdAt: new Date() };
        chat.updatedAt = new Date();
        await chat.save();

        await chat.populate('messages.sender', 'username avatar');
        const savedMessage = chat.messages[chat.messages.length - 1];

        // Emit to all participants
        chat.participants.forEach((participantId) => {
          io.to(participantId.toString()).emit('newMessage', {
            chatId,
            message: savedMessage
          });
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', ({ chatId, recipientId }) => {
      io.to(recipientId).emit('userTyping', {
        chatId,
        userId: userId,
        username: socket.user.username
      });
    });

    socket.on('stopTyping', ({ chatId, recipientId }) => {
      io.to(recipientId).emit('userStopTyping', { chatId, userId });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`❌ Socket disconnected: ${socket.user.username}`);
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      });
      io.emit('userOffline', { userId });
    });
  });
};

module.exports = { setupSocket, onlineUsers };
