const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const CloudAccount = require('../models/CloudAccount');
const User = require('../models/User');
const Story = require('../models/Story');
const adminAuth = require('../middleware/adminAuth');
const { fetchCloudinaryUsage } = require('../config/cloudinary');

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET + '_admin';

const genToken = (adminId) => jwt.sign({ adminId }, ADMIN_SECRET, { expiresIn: '24h' });

// ─── AUTH ──────────────────────────────────────────────────────────────────

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email и пароль обязательны' });

    const admin = await Admin.findOne({ email });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: 'Неверные данные' });
    }

    await Admin.findByIdAndUpdate(admin._id, { lastLogin: new Date() });
    const token = genToken(admin._id);
    res.json({ token, admin });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера', error: err.message });
  }
});

// Verify token
router.get('/me', adminAuth, (req, res) => {
  res.json({ admin: req.admin });
});

// ─── DASHBOARD STATS ───────────────────────────────────────────────────────

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalUsers, totalStories, activeStories, cloudAccounts] = await Promise.all([
      User.countDocuments(),
      Story.countDocuments(),
      Story.countDocuments({ isActive: true }),
      CloudAccount.find()
    ]);

    const totalStorage = cloudAccounts.reduce((s, a) => s + (a.usageBytes || 0), 0);
    const totalLimit = cloudAccounts.reduce((s, a) => s + (a.limitBytes || 0), 0);

    res.json({
      users: totalUsers,
      stories: { total: totalStories, active: activeStories, expired: totalStories - activeStories },
      storage: { used: totalStorage, limit: totalLimit, percent: totalLimit ? Math.round((totalStorage / totalLimit) * 100) : 0 },
      cloudAccounts: {
        total: cloudAccounts.length,
        active: cloudAccounts.filter(a => a.isActive).length,
        overLimit: cloudAccounts.filter(a => a.usageBytes >= a.limitBytes * 0.9).length
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// ─── CLOUD ACCOUNTS ────────────────────────────────────────────────────────

// Get all accounts
router.get('/cloud', adminAuth, async (req, res) => {
  try {
    const accounts = await CloudAccount.find().sort({ priority: 1, createdAt: 1 });
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Add new account
router.post('/cloud', adminAuth, async (req, res) => {
  try {
    const { name, cloudName, apiKey, apiSecret, limitBytes, notes } = req.body;
    if (!name || !cloudName || !apiKey || !apiSecret) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }

    // Set priority = count of existing accounts
    const count = await CloudAccount.countDocuments();

    const account = new CloudAccount({
      name, cloudName, apiKey, apiSecret,
      limitBytes: limitBytes || 26843545600,
      notes: notes || '',
      priority: count
    });

    await account.save();
    res.status(201).json({ account, message: 'Аккаунт добавлен' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Update account
router.put('/cloud/:id', adminAuth, async (req, res) => {
  try {
    const { name, cloudName, apiKey, apiSecret, isActive, priority, limitBytes, notes } = req.body;
    const account = await CloudAccount.findByIdAndUpdate(
      req.params.id,
      { name, cloudName, apiKey, apiSecret, isActive, priority, limitBytes, notes },
      { new: true, runValidators: true }
    );
    if (!account) return res.status(404).json({ message: 'Аккаунт не найден' });
    res.json({ account, message: 'Аккаунт обновлён' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Toggle account active/inactive
router.patch('/cloud/:id/toggle', adminAuth, async (req, res) => {
  try {
    const account = await CloudAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Не найден' });

    // Don't allow disabling last active account
    if (account.isActive) {
      const activeCount = await CloudAccount.countDocuments({ isActive: true });
      if (activeCount <= 1) return res.status(400).json({ message: 'Нельзя отключить последний активный аккаунт' });
    }

    account.isActive = !account.isActive;
    await account.save();
    res.json({ account, message: `Аккаунт ${account.isActive ? 'включён' : 'отключён'}` });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Delete account
router.delete('/cloud/:id', adminAuth, async (req, res) => {
  try {
    const activeCount = await CloudAccount.countDocuments({ isActive: true });
    const account = await CloudAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Не найден' });

    if (account.isActive && activeCount <= 1) {
      return res.status(400).json({ message: 'Нельзя удалить последний активный аккаунт' });
    }

    await account.deleteOne();
    res.json({ message: 'Аккаунт удалён' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Sync real Cloudinary usage for an account
router.post('/cloud/:id/sync', adminAuth, async (req, res) => {
  try {
    const account = await CloudAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Не найден' });

    const usage = await fetchCloudinaryUsage(account);
    if (!usage) return res.status(400).json({ message: 'Не удалось получить данные от Cloudinary' });

    const updated = await CloudAccount.findByIdAndUpdate(
      account._id,
      { usageBytes: usage.usageBytes, limitBytes: usage.limitBytes },
      { new: true }
    );

    res.json({ account: updated, message: 'Использование синхронизировано' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Reorder priorities
router.put('/cloud/reorder', adminAuth, async (req, res) => {
  try {
    const { order } = req.body; // array of { id, priority }
    await Promise.all(order.map(({ id, priority }) =>
      CloudAccount.findByIdAndUpdate(id, { priority })
    ));
    res.json({ message: 'Порядок обновлён' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// ─── USER MANAGEMENT ───────────────────────────────────────────────────────

router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = search ? { username: { $regex: search, $options: 'i' } } : {};
    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).limit(limit * 1).skip((page - 1) * limit),
      User.countDocuments(query)
    ]);
    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// Ban/unban user
router.patch('/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isBanned: req.body.banned }, { new: true }).select('-password');
    res.json({ user, message: `Пользователь ${req.body.banned ? 'заблокирован' : 'разблокирован'}` });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

// ─── SETUP: Create first admin (only if no admins exist) ───────────────────
router.post('/setup', async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) return res.status(403).json({ message: 'Администратор уже создан' });

    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Все поля обязательны' });
    if (password.length < 8) return res.status(400).json({ message: 'Пароль минимум 8 символов' });

    const admin = new Admin({ username, email, password, role: 'superadmin' });
    await admin.save();

    const token = genToken(admin._id);
    res.status(201).json({ token, admin, message: 'Администратор создан' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка', error: err.message });
  }
});

module.exports = router;
