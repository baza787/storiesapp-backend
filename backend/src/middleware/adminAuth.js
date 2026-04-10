const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Нет токена' });

    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET + '_admin');
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) return res.status(401).json({ message: 'Администратор не найден' });

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Недействительный токен' });
  }
};

module.exports = adminAuth;
