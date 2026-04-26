const fs = require('fs');
const path = require('path');
const dbService = require('./dbService');
const { isValidFileId, getSafeFilePath, escapeHtml } = require('../middleware/security');
const CONFIG = require('../config');

function getFileCategory(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const categories = {
        image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'],
        document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
        video: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'],
        audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a']
    };
    for (const [category, extensions] of Object.entries(categories)) {
        if (extensions.includes(ext)) return category;
    }
    return 'other';
}

function getTimeCategory(uploadTime) {
    const now = Date.now();
    const diff = now - uploadTime;
    const day = 24 * 60 * 60 * 1000;
    if (diff < day) return 'today';
    if (diff < 7 * day) return 'week';
    return 'older';
}

function handleUpload(fileId, req, res) {
    if (!isValidFileId(fileId)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid file ID' }));
        return false;
    }

    const filePath = getSafeFilePath(fileId);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return false;
    }

    const writeStream = fs.createWriteStream(filePath);
    let totalSize = 0;

    req.on('data', chunk => {
        totalSize += chunk.length;
        if (totalSize > CONFIG.MAX_FILE_SIZE) {
            writeStream.close();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件大小超过限制 (最大1GB)' }));
            req.destroy();
        }
    });

    req.on('end', () => {
        writeStream.end();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, size: totalSize }));
    });

    req.pipe(writeStream);

    writeStream.on('error', err => {
        console.error('File write error:', err);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File write failed' }));
        }
    });

    return true;
}

function handleDownload(fileId, req, res) {
    if (!isValidFileId(fileId)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid file ID' }));
        return false;
    }

    const filePath = getSafeFilePath(fileId);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return false;
    }

    const metadata = dbService.getFileById(fileId);
    if (!metadata || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return false;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': metadata.type || 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(metadata.name) + '"'
        });
        fileStream.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Type': metadata.type || 'application/octet-stream',
            'Content-Length': fileSize,
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(metadata.name) + '"'
        });
        fs.createReadStream(filePath).pipe(res);
    }
    return true;
}

function deleteFileWithData(fileId) {
    const file = dbService.getFileById(fileId);
    if (file) {
        const filePath = path.join(CONFIG.DATA_DIR, fileId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        dbService.deleteFile(fileId);
        return true;
    }
    return false;
}

function moveFile(fileId, folderId) {
    const file = dbService.getFileById(fileId);
    if (!file) return false;
    dbService.updateFile(fileId, { folderId });
    return true;
}

function createFileMetadata(fileData) {
    const metadata = {
        id: fileData.id,
        name: escapeHtml(fileData.name),
        size: fileData.size || 0,
        type: fileData.type || '',
        category: getFileCategory(fileData.name),
        folderId: fileData.folderId || null,
        uploadTime: Date.now(),
        timeCategory: getTimeCategory(Date.now())
    };
    dbService.createFile(metadata);
    return metadata;
}

module.exports = {
    getFileCategory,
    getTimeCategory,
    handleUpload,
    handleDownload,
    deleteFileWithData,
    moveFile,
    createFileMetadata
};
