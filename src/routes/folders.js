const url = require('url');
const dbService = require('../services/dbService');
const folderService = require('../services/folderService');
const { notifyFolderUpdate } = require('../websocket');

function handleFoldersRoute(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // GET /api/folders - 获取所有文件夹
    if (pathname === '/api/folders' && method === 'GET') {
        const folders = dbService.getAllFolders();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(folders));
        return true;
    }

    // POST /api/folders - 创建文件夹
    if (pathname === '/api/folders' && method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '文件夹名称不能为空' }));
                    return;
                }
                const folder = folderService.createFolder(data.name, data.parentId);
                const folders = dbService.getAllFolders();
                notifyFolderUpdate(folders);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, folder }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return true;
    }

    return false;
}

function handleFolderById(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 匹配 /api/folders/:id/* 格式
    const match = pathname.match(/^\/api\/folders\/([^/]+)(\/.*)?$/);
    if (!match) return false;

    const folderId = match[1];
    const subPath = match[2] || '';

    // GET /api/folders/:id/info
    if (subPath === '/info' && method === 'GET') {
        const folder = dbService.getFolderById(folderId);
        if (!folder) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件夹不存在' }));
            return true;
        }
        const contents = folderService.collectFolderContents(folderId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ folder, contents }));
        return true;
    }

    // GET /api/folders/:id/download
    if (subPath === '/download' && method === 'GET') {
        const folder = dbService.getFolderById(folderId);
        if (!folder) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件夹不存在' }));
            return true;
        }
        const contents = folderService.collectFolderContents(folderId);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(folder.name) + '.zip"'
        });
        res.end(JSON.stringify({ folderName: folder.name, contents }));
        return true;
    }

    // PUT /api/folders/:id - 更新文件夹
    if (!subPath && method === 'PUT') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const folder = folderService.updateFolderName(folderId, data.name);
                const folders = dbService.getAllFolders();
                notifyFolderUpdate(folders);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, folder }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return true;
    }

    // DELETE /api/folders/:id - 删除文件夹
    if (!subPath && method === 'DELETE') {
        const folder = dbService.getFolderById(folderId);
        if (!folder) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件夹不存在' }));
            return true;
        }
        folderService.deleteFolderRecursive(folderId);
        const folders = dbService.getAllFolders();
        notifyFolderUpdate(folders);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    return false;
}

module.exports = {
    handleFoldersRoute,
    handleFolderById
};
