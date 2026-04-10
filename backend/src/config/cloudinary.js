const cloudinary = require('cloudinary').v2;
const CloudAccount = require('../models/CloudAccount');

const configureFromAccount = (account) => {
  cloudinary.config({
    cloud_name: account.cloudName,
    api_key: account.apiKey,
    api_secret: account.apiSecret
  });
};

const uploadToCloud = async (filePath, options = {}) => {
  const accounts = await CloudAccount.find({ isActive: true }).sort({ priority: 1, usageBytes: 1 });
  if (accounts.length === 0) throw new Error('Нет облачных аккаунтов. Добавьте аккаунт в панели администратора.');

  let lastError;
  for (let i = 0; i < Math.min(accounts.length, 3); i++) {
    const account = accounts[i];
    configureFromAccount(account);
    try {
      const result = await cloudinary.uploader.upload(filePath, { folder: 'storiesapp', ...options });
      const fileSize = result.bytes || 0;
      await CloudAccount.findByIdAndUpdate(account._id, {
        $inc: { usageBytes: fileSize, totalUploads: 1 },
        lastUsed: new Date()
      });
      result._accountId = account._id.toString();
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Upload failed on "${account.name}": ${err.message}`);
    }
  }
  throw lastError || new Error('Все облачные аккаунты недоступны');
};

const deleteFromCloud = async (publicId, accountId = null) => {
  let accounts = await CloudAccount.find({ isActive: true });
  if (accountId) {
    const specific = await CloudAccount.findById(accountId);
    if (specific) accounts = [specific, ...accounts.filter(a => a._id.toString() !== accountId)];
  }
  for (const account of accounts) {
    configureFromAccount(account);
    try { await cloudinary.uploader.destroy(publicId); return true; } catch (e) {}
  }
  return false;
};

const fetchCloudinaryUsage = async (account) => {
  configureFromAccount(account);
  try {
    const usage = await cloudinary.api.usage();
    return { usageBytes: usage.storage?.usage || 0, limitBytes: usage.storage?.limit || 26843545600, bandwidth: usage.bandwidth?.usage || 0 };
  } catch (e) { return null; }
};

module.exports = { uploadToCloud, deleteFromCloud, fetchCloudinaryUsage, configureFromAccount };
