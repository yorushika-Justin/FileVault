const path = require('path');
const CONFIG = require('../config');

function isValidFileId(fileId) {
    if (!fileId || typeof fileId !== 'string') return false;
    return /^[a-zA-Z0-9_\-\.]+$/.test(fileId);
}

function isValidFolderId(folderId) {
    if (!folderId || typeof folderId !== 'string') return false;
    return /^[a-zA-Z0-9_\-\.]+$/.test(folderId);
}

function getSafeFilePath(fileId) {
    const filePath = path.join(CONFIG.DATA_DIR, fileId);
    const resolvedPath = path.resolve(filePath);
    const resolvedDataDir = path.resolve(CONFIG.DATA_DIR);
    return resolvedPath.startsWith(resolvedDataDir) ? resolvedPath : null;
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function generateFileId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateFolderId() {
    return 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = {
    isValidFileId,
    isValidFolderId,
    getSafeFilePath,
    escapeHtml,
    generateFileId,
    generateFolderId
};
