const Story = require('../models/Story');
const { deleteFromCloud } = require('../config/cloudinary');

const deleteExpiredStories = async () => {
  try {
    const expired = await Story.find({
      isActive: true,
      expiresAt: { $lte: new Date() }
    });

    let count = 0;
    for (const story of expired) {
      // Mark as inactive (preserves stats)
      story.isActive = false;

      // Delete media from Cloudinary
      if (story.mediaPublicId) {
        try {
          await deleteFromCloud(story.mediaPublicId);
        } catch (e) {
          console.error(`Failed to delete media for story ${story._id}:`, e.message);
        }
      }

      await story.save();
      count++;
    }

    if (count > 0) {
      console.log(`🗑️  Expired ${count} stories`);
    }
  } catch (err) {
    console.error('Story cleanup error:', err.message);
  }
};

module.exports = { deleteExpiredStories };
