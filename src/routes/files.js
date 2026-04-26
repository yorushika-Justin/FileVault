const url = require('url');
const dbService = require('../services/dbService');
const fileService = require('../services/fileService');
const { generateFileId } = require('../middleware/security');
const { notifyFileUpdate } = require('../websocket');

function handleFilesRoute(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // GET /api/files - 获取所有文件
    if (pathname === '/api/files' && method === 'GET') {
        const folderId = parsedUrl.query.folder;
        let files;
        if (folderId === undefined || folderId === 'null') {
            files = dbService.getFilesByFolder(null);
        } else {
            files = dbService.getFilesByFolder(folderId);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
        return true;
    }

    // GET /api/search?q=keyword - 搜索文件
    if (pathname === '/api/search' && method === 'GET') {
        const keyword = parsedUrl.query.q || '';
        const files = dbService.searchFiles(keyword);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
        return true;
    }

    // POST /api/files - 创建文件元数据
    if (pathname === '/api/files' && method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '文件名不能为空' }));
                    return;
                }
                const fileData = {
                    id: data.id || generateFileId(),
                    name: data.name,
                    size: data.size || 0,
                    type: data.type || '',
                    folderId: data.folderId
                };
                const metadata = fileService.createFileMetadata(fileData);
                const files = dbService.getAllFiles();
                notifyFileUpdate(files);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, file: metadata }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return true;
    }

    return false;
}

function handleFileById(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const parts = pathname.split('/');

    if (parts[2] !== 'files' || parts.length !== 4) return false;
    const fileId = parts[3];

    // GET /api/files/:id - 获取单个文件
    if (method === 'GET') {
        const file = dbService.getFileById(fileId);
        if (file) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(file));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }
        return true;
    }

    // PUT /api/files/:id - 更新文件
    if (method === 'PUT') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                dbService.updateFile(fileId, data);
                const files = dbService.getAllFiles();
                notifyFileUpdate(files);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return true;
    }

    // DELETE /api/files/:id - 删除文件
    if (method === 'DELETE') {
        fileService.deleteFileWithData(fileId);
        const files = dbService.getAllFiles();
        notifyFileUpdate(files);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    return false;
}

function handleUpload(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (!pathname.startsWith('/api/upload/')) return false;
    if (req.method !== 'POST') return false;

    const fileId = pathname.split('/').pop();
    return fileService.handleUpload(fileId, req, res);
}

function handleDownload(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (!pathname.startsWith('/api/download/')) return false;
    if (req.method !== 'GET') return false;

    const fileId = pathname.split('/').pop();
    return fileService.handleDownload(fileId, req, res);
}

function handleMove(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (!pathname.match(/^\/api\/files\/[^/]+\/move$/)) return false;
    if (req.method !== 'PUT') return false;

    const parts = pathname.split('/');
    const fileId = parts[3];

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            fileService.moveFile(fileId, data.folderId);
            const files = dbService.getAllFiles();
            notifyFileUpdate(files);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
    return true;
}

module.exports = {
    handleFilesRoute,
    handleFileById,
    handleUpload,
    handleDownload,
    handleMove
};
