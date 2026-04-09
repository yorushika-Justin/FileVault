const http = require('http');
const fs = require('fs');
const path = require('path');
const { networkInterfaces } = require('os');
const { createWriteStream, readFileSync } = require('fs');

console.log('Starting FileVault server...');

const CONFIG = {
    PORT: 8888,
    MAX_FILE_SIZE: 1024 * 1024 * 1024,
    DATA_DIR: path.join(__dirname, 'data')
};

function isValidFileId(fileId) {
    return /^[a-zA-Z0-9_\-\.]+$/.test(fileId);
}

function getSafeFilePath(fileId) {
    const filePath = path.join(CONFIG.DATA_DIR, fileId);
    const resolvedPath = path.resolve(filePath);
    const resolvedDataDir = path.resolve(CONFIG.DATA_DIR);
    return resolvedPath.startsWith(resolvedDataDir) ? resolvedPath : null;
}

if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

let fileMetadata = {};
let folders = {};
const metadataFile = path.join(CONFIG.DATA_DIR, 'metadata.json');
const foldersFile = path.join(CONFIG.DATA_DIR, 'folders.json');

if (fs.existsSync(metadataFile)) {
    try {
        fileMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    } catch (e) {
        console.error('Failed to load metadata:', e);
        fileMetadata = {};
    }
}

if (fs.existsSync(foldersFile)) {
    try {
        folders = JSON.parse(fs.readFileSync(foldersFile, 'utf8'));
    } catch (e) {
        console.error('Failed to load folders:', e);
        folders = {};
    }
}

function saveMetadata() {
    try {
        fs.writeFileSync(metadataFile, JSON.stringify(fileMetadata, null, 2));
    } catch (e) {
        console.error('Failed to save metadata:', e);
    }
}

function saveFolders() {
    try {
        fs.writeFileSync(foldersFile, JSON.stringify(folders, null, 2));
    } catch (e) {
        console.error('Failed to save folders:', e);
    }
}

function getLocalIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain; charset=utf-8',
    '.zip': 'application/zip'
};

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function deleteFolderRecursive(folderId) {
    const childFolders = Object.values(folders).filter(f => f.parentId === folderId);
    childFolders.forEach(child => deleteFolderRecursive(child.id));
    
    Object.keys(fileMetadata).forEach(fileId => {
        if (fileMetadata[fileId].folderId === folderId) {
            delete fileMetadata[fileId];
            const filePath = path.join(CONFIG.DATA_DIR, fileId);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });
    
    delete folders[folderId];
}

function collectFolderContents(folderId, basePath = '') {
    const contents = [];
    const childFolders = Object.values(folders).filter(f => f.parentId === folderId);
    const folderFiles = Object.values(fileMetadata).filter(f => f.folderId === folderId);
    
    folderFiles.forEach(file => {
        const filePath = basePath ? basePath + '/' + file.name : file.name;
        contents.push({
            type: 'file',
            id: file.id,
            name: file.name,
            path: filePath
        });
    });
    
    childFolders.forEach(folder => {
        const folderPath = basePath ? basePath + '/' + folder.name : folder.name;
        contents.push({
            type: 'folder',
            id: folder.id,
            name: folder.name,
            path: folderPath
        });
        const childContents = collectFolderContents(folder.id, folderPath);
        contents.push(...childContents);
    });
    
    return contents;
}

function handleApi(req, res) {
    const url = req.url.split('?')[0];
    console.log('=== New API Request ===');
    console.log('Method:', req.method);
    console.log('URL:', url);
    console.log('URL starts with /api/folders/:', url.startsWith('/api/folders/'));
    console.log('URL ends with /info:', url.endsWith('/info'));
    console.log('URL ends with /download:', url.endsWith('/download'));

    if (url === '/api/files' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.values(fileMetadata)));
        return;
    }

    if (url === '/api/files' && req.method === 'POST') {
        let body = '';
        let bodySize = 0;
        
        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > 1024 * 1024) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '请求体过大' }));
                req.destroy();
                return;
            }
            body += chunk;
        });
        
        req.on('end', () => {
            try {
                const metadata = JSON.parse(body);
                
                if (!metadata.id || !metadata.name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '缺少必要字段' }));
                    return;
                }
                
                metadata.name = escapeHtml(metadata.name);
                fileMetadata[metadata.id] = metadata;
                saveMetadata();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, id: metadata.id }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (url.startsWith('/api/files/') && req.method === 'GET') {
        const fileId = url.split('/').pop();
        const metadata = fileMetadata[fileId];
        
        if (metadata) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metadata));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }
        return;
    }

    if (url.startsWith('/api/upload/') && req.method === 'POST') {
        const fileId = url.split('/').pop();
        
        if (!isValidFileId(fileId)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid file ID' }));
            return;
        }
        
        const filePath = getSafeFilePath(fileId);
        if (!filePath) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Access denied' }));
            return;
        }
        
        const chunks = [];
        let totalSize = 0;
        
        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > CONFIG.MAX_FILE_SIZE) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '文件大小超过限制 (最大1GB)' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const filePath = path.join(CONFIG.DATA_DIR, fileId);
                fs.writeFileSync(filePath, buffer);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('Upload error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (url.startsWith('/api/download/') && req.method === 'GET') {
        const fileId = url.split('/').pop();
        
        if (!isValidFileId(fileId)) {
            console.error('Invalid fileId:', fileId);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid file ID' }));
            return;
        }
        
        const filePath = getSafeFilePath(fileId);
        if (!filePath) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Access denied' }));
            return;
        }
        
        const metadata = fileMetadata[fileId];
        
        if (metadata && fs.existsSync(filePath)) {
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
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }
        return;
    }

    if (url.startsWith('/api/files/') && req.method === 'DELETE') {
        const fileId = url.split('/').pop();
        
        if (fileMetadata[fileId]) {
            delete fileMetadata[fileId];
            saveMetadata();
            
            const filePath = path.join(CONFIG.DATA_DIR, fileId);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }
        return;
    }

    if (url === '/api/files/batch-delete' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk;
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const fileIds = data.ids || [];
                const deletedIds = [];
                
                for (const fileId of fileIds) {
                    if (fileMetadata[fileId]) {
                        delete fileMetadata[fileId];
                        
                        const filePath = path.join(CONFIG.DATA_DIR, fileId);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                        deletedIds.push(fileId);
                    }
                }
                
                saveMetadata();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, deleted: deletedIds.length }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (url === '/api/folders' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.values(folders)));
        return;
    }

    if (url === '/api/folders' && req.method === 'POST') {
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
                const folderId = 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const folder = {
                    id: folderId,
                    name: escapeHtml(data.name),
                    createdAt: Date.now(),
                    fileCount: 0,
                    parentId: data.parentId || null
                };
                folders[folderId] = folder;
                saveFolders();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, folder: folder }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 必须放在 PUT 和 DELETE 之前，避免被错误路由
    console.log('Checking /info route match:', url.startsWith('/api/folders/'), '&&', url.endsWith('/info'), '&&', req.method === 'GET');
    if (url.startsWith('/api/folders/') && url.endsWith('/info') && req.method === 'GET') {
        console.log('>>> /info route matched!');
        const parts = url.split('/');
        const folderId = parts[3];
        console.log('Folder info request for:', folderId, 'URL:', url);
        console.log('Available folders:', Object.keys(folders));
        
        if (folders[folderId]) {
            const contents = collectFolderContents(folderId);
            console.log('Folder found, contents:', contents.length);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                folder: folders[folderId], 
                contents: contents 
            }));
        } else {
            console.log('Folder not found:', folderId);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件夹不存在' }));
        }
        return;
    }

    console.log('Checking /download route match:', url.startsWith('/api/folders/'), '&&', url.endsWith('/download'), '&&', req.method === 'GET');
    if (url.startsWith('/api/folders/') && url.endsWith('/download') && req.method === 'GET') {
        console.log('>>> /download route matched!');
        const folderId = url.split('/')[3];
        console.log('Folder download request for:', folderId);
        if (!folders[folderId]) {
            console.log('Folder not found:', folderId);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件夹不存在' }));
            return;
        }
        
        const folderName = folders[folderId].name;
        const contents = collectFolderContents(folderId);
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(folderName)}.zip"`
        });
        
        res.end(JSON.stringify({
            folderName: folderName,
            contents: contents
        }));
        return;
    }

    // 通用的 PUT 和 DELETE 路由放在最后
    console.log('Checking generic PUT route match:', url.startsWith('/api/folders/'), '&&', req.method === 'PUT');
    if (url.startsWith('/api/folders/') && req.method === 'PUT') {
        console.log('>>> Generic PUT route matched!');
        const folderId = url.split('/').pop();
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!folders[folderId]) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '文件夹不存在' }));
                    return;
                }
                if (data.name) {
                    folders[folderId].name = escapeHtml(data.name);
                }
                saveFolders();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, folder: folders[folderId] }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    console.log('Checking generic DELETE route match:', url.startsWith('/api/folders/'), '&&', req.method === 'DELETE');
    if (url.startsWith('/api/folders/') && req.method === 'DELETE') {
        console.log('>>> Generic DELETE route matched!');
        const folderId = url.split('/').pop();
        if (folders[folderId]) {
            deleteFolderRecursive(folderId);
            saveFolders();
            saveMetadata();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '文件夹不存在' }));
        }
        return;
    }

    if (url.startsWith('/api/files/') && url.endsWith('/move') && req.method === 'PUT') {
        const parts = url.split('/');
        const fileId = parts[3];
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!fileMetadata[fileId]) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '文件不存在' }));
                    return;
                }
                const oldFolderId = fileMetadata[fileId].folderId;
                fileMetadata[fileId].folderId = data.folderId || null;
                if (oldFolderId && folders[oldFolderId]) {
                    folders[oldFolderId].fileCount = Math.max(0, (folders[oldFolderId].fileCount || 0) - 1);
                }
                if (data.folderId && folders[data.folderId]) {
                    folders[data.folderId].fileCount = (folders[data.folderId].fileCount || 0) + 1;
                }
                saveMetadata();
                saveFolders();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (url === '/api/ip' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ip: localIP }));
        return;
    }

    if (url === '/api/port' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ port: CONFIG.PORT }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}

const localIP = getLocalIP();

const server = http.createServer((req, res) => {
    console.log('Request:', req.method, req.url);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Id, X-File-Name, X-File-Size, X-File-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url.startsWith('/api/')) {
        handleApi(req, res);
        return;
    }

    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error('File read error:', err);
            res.writeHead(500);
            res.end('Server Error');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log('================================');
    console.log('FileVault Server Running');
    console.log('Local:   http://localhost:' + CONFIG.PORT);
    console.log('LAN:     http://' + localIP + ':' + CONFIG.PORT);
    console.log('Max File Size: 1GB');
    console.log('================================');
    console.log('Press Ctrl+C to stop the server');
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Server setup complete, waiting for connections...');
