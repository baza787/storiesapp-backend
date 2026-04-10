const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { uploadToCloud, deleteFromCloud } = require('../config/cloudinary');
const fs = require('fs');

const upload = multer({ dest: '/tmp/uploads/' });

// Search users
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ users: [] });

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user._id }
    }).select('username avatar bio').limit(20);

    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get user profile
router.get('/:username', auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', 'username avatar')
      .populate('following', 'username avatar');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Follow / unfollow
router.post('/:id/follow', auth, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: "Can't follow yourself" });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const isFollowing = req.user.following.includes(req.params.id);

    if (isFollowing) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: req.params.id } });
      await User.findByIdAndUpdate(req.params.id, { $pull: { followers: req.user._id } });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: req.params.id } });
      await User.findByIdAndUpdate(req.params.id, { $addToSet: { followers: req.user._id } });
    }

    res.json({ following: !isFollowing });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update profile
router.put('/profile/update', auth, upload.single('avatar'), async (req, res) => {
  try {
    const updates = {};
    if (req.body.bio !== undefined) updates.bio = req.body.bio;

    if (req.file) {
      if (req.user.avatarPublicId) {
        await deleteFromCloud(req.user.avatarPublicId);
      }
      const result = await uploadToCloud(req.file.path, {
        transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }]
      });
      fs.unlink(req.file.path, () => {});
      updates.avatar = result.secure_url;
      updates.avatarPublicId = result.public_id;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get popularity leaderboard
router.get('/leaderboard/top', auth, async (req, res) => {
  try {
    const users = await User.find()
      .select('username avatar popularityScore')
      .sort({ 'popularityScore.totalViews': -1 })
      .limit(20);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
