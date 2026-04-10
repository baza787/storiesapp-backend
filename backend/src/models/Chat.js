const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 1000 },
  type: { type: String, enum: ['text', 'image', 'storyReply'], default: 'text' },
  storyRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  messages: [messageSchema],
  lastMessage: {
    content: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: Date
  },
  updatedAt: { type: Date, default: Date.now }
});

chatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', chatSchema);
