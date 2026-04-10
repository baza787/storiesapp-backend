const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 300 },
  createdAt: { type: Date, default: Date.now }
});

const storySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mediaUrl: { type: String, required: true },
  mediaPublicId: { type: String },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  thumbnail: { type: String, default: '' },
  caption: { type: String, maxlength: 200, default: '' },
  // Viewers (unique)
  views: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  viewCount: { type: Number, default: 0 },
  // Likes
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  // Comments
  comments: [commentSchema],
  commentCount: { type: Number, default: 0 },
  // Story expires 24h after creation
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Index for fast expiry queries
storySchema.index({ expiresAt: 1 });
storySchema.index({ author: 1, isActive: 1 });

module.exports = mongoose.model('Story', storySchema);
