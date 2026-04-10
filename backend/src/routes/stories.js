const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const Story = require('../models/Story');
const User = require('../models/User');
const { uploadToCloud, deleteFromCloud } = require('../config/cloudinary');
const fs = require('fs');

const upload = multer({ dest: '/tmp/uploads/' });

// Upload story
router.post('/', auth, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Media file required' });

    const isVideo = req.file.mimetype.startsWith('video/');
    const uploadOptions = isVideo
      ? { resource_type: 'video', eager: [{ format: 'jpg', transformation: [{ start_offset: '0' }] }] }
      : { resource_type: 'image' };

    const result = await uploadToCloud(req.file.path, uploadOptions);

    // Cleanup temp file
    fs.unlink(req.file.path, () => {});

    const story = new Story({
      author: req.user._id,
      mediaUrl: result.secure_url,
      mediaPublicId: result.public_id,
      mediaType: isVideo ? 'video' : 'image',
      thumbnail: isVideo && result.eager?.[0] ? result.eager[0].secure_url : result.secure_url,
      caption: req.body.caption || ''
    });

    await story.save();
    await story.populate('author', 'username avatar');

    res.status(201).json({ story });
  } catch (err) {
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// Get feed stories (following + own, active only)
router.get('/feed', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const ids = [...user.following, req.user._id];

    const stories = await Story.find({
      author: { $in: ids },
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1 })
      .populate('author', 'username avatar')
      .limit(100);

    res.json({ stories });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get stories by user
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const stories = await Story.find({
      author: req.params.userId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1 })
      .populate('author', 'username avatar');

    res.json({ stories });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// View a story (record view)
router.post('/:id/view', auth, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story || !story.isActive) return res.status(404).json({ message: 'Story not found' });

    const alreadyViewed = story.views.includes(req.user._id);
    if (!alreadyViewed) {
      story.views.push(req.user._id);
      story.viewCount += 1;
      await story.save();

      // Update author's popularity score
      await User.findByIdAndUpdate(story.author, {
        $inc: { 'popularityScore.totalViews': 1 }
      });
    }

    res.json({ viewCount: story.viewCount });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Like / unlike story
router.post('/:id/like', auth, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story || !story.isActive) return res.status(404).json({ message: 'Story not found' });

    const liked = story.likes.includes(req.user._id);
    if (liked) {
      story.likes.pull(req.user._id);
      story.likeCount = Math.max(0, story.likeCount - 1);
    } else {
      story.likes.push(req.user._id);
      story.likeCount += 1;
      await User.findByIdAndUpdate(story.author, {
        $inc: { 'popularityScore.totalLikes': 1 }
      });
    }

    await story.save();
    res.json({ liked: !liked, likeCount: story.likeCount });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Comment on story
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text required' });

    const story = await Story.findById(req.params.id);
    if (!story || !story.isActive) return res.status(404).json({ message: 'Story not found' });

    story.comments.push({ user: req.user._id, text });
    story.commentCount += 1;
    await story.save();

    await User.findByIdAndUpdate(story.author, {
      $inc: { 'popularityScore.totalComments': 1 }
    });

    await story.populate('comments.user', 'username avatar');
    const newComment = story.comments[story.comments.length - 1];

    res.status(201).json({ comment: newComment, commentCount: story.commentCount });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete own story
router.delete('/:id', auth, async (req, res) => {
  try {
    const story = await Story.findOne({ _id: req.params.id, author: req.user._id });
    if (!story) return res.status(404).json({ message: 'Story not found' });

    if (story.mediaPublicId) {
      await deleteFromCloud(story.mediaPublicId);
    }

    await story.deleteOne();
    res.json({ message: 'Story deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get history (all own stories including expired)
router.get('/history/mine', auth, async (req, res) => {
  try {
    const stories = await Story.find({ author: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ stories });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
