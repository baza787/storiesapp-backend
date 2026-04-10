const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const User = require('../models/User');

// Get or create chat with user
router.post('/with/:userId', auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({ message: "Can't chat with yourself" });
    }

    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, targetUserId] }
    }).populate('participants', 'username avatar isOnline lastSeen');

    if (!chat) {
      chat = new Chat({
        participants: [req.user._id, targetUserId],
        messages: []
      });
      await chat.save();
      await chat.populate('participants', 'username avatar isOnline lastSeen');
    }

    res.json({ chat });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all user chats
router.get('/my', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate('participants', 'username avatar isOnline lastSeen')
      .sort({ updatedAt: -1 });

    res.json({ chats });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get messages of a chat
router.get('/:chatId/messages', auth, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.user._id
    }).populate('messages.sender', 'username avatar');

    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Mark messages as read
    await Chat.updateOne(
      { _id: chat._id },
      { $set: { 'messages.$[elem].read': true } },
      { arrayFilters: [{ 'elem.sender': { $ne: req.user._id }, 'elem.read': false }] }
    );

    res.json({ messages: chat.messages });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Send message (HTTP fallback, prefer WebSocket)
router.post('/:chatId/send', auth, async (req, res) => {
  try {
    const { content, type } = req.body;
    if (!content) return res.status(400).json({ message: 'Message content required' });

    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.user._id
    });

    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const message = {
      sender: req.user._id,
      content,
      type: type || 'text',
      createdAt: new Date()
    };

    chat.messages.push(message);
    chat.lastMessage = { content, sender: req.user._id, createdAt: new Date() };
    chat.updatedAt = new Date();
    await chat.save();

    await chat.populate('messages.sender', 'username avatar');
    const newMsg = chat.messages[chat.messages.length - 1];

    res.status(201).json({ message: newMsg });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
