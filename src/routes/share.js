const url = require('url');
const dbService = require('../services/dbService');

function handleShareRoute(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    const method = req.method;

    // GET /api/share/check - 检查分享类型
    if (pathname === '/api/share/check' && method === 'GET') {
        const fileId = query.f;
        const folderId = query.folder;

        if (fileId) {
            const file = dbService.getFileById(fileId);
            if (file) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ type: 'file', data: file }));
                return true;
            }
        }

        if (folderId) {
            const folder = dbService.getFolderById(folderId);
            if (folder) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ type: 'folder', data: folder }));
                return true;
            }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return true;
    }

    return false;
}

module.exports = {
    handleShareRoute
};
