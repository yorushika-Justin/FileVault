const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG = require('./config');
const dbService = require('./services/dbService');
const { setupCors } = require('./middleware/cors');
const { initWSS } = require('./websocket');
const filesRoute = require('./routes/files');
const foldersRoute = require('./routes/folders');
const shareRoute = require('./routes/share');

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
    '.txt': 'text/plain; charset=utf-8',
    '.zip': 'application/zip'
};

function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

async function startServer() {
    await dbService.initDatabase();

    const server = http.createServer((req, res) => {
        console.log('Request:', req.method, req.url);

        if (setupCors(req, res)) return;

        if (req.url.startsWith('/api/')) {
            // 文件路由
            if (filesRoute.handleFilesRoute(req, res)) return;
            if (filesRoute.handleFileById(req, res)) return;
            if (filesRoute.handleUpload(req, res)) return;
            if (filesRoute.handleDownload(req, res)) return;
            if (filesRoute.handleMove(req, res)) return;

            // 文件夹路由
            if (foldersRoute.handleFoldersRoute(req, res)) return;
            if (foldersRoute.handleFolderById(req, res)) return;

            // 分享路由
            if (shareRoute.handleShareRoute(req, res)) return;

            // IP 和 Port API
            if (req.url === '/api/ip' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ip: localIP }));
                return;
            }

            if (req.url === '/api/port' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ port: CONFIG.PORT }));
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }

        // 静态文件服务
        let filePath = path.join(__dirname, '..', 'public', req.url === '/' ? 'index.html' : req.url);

        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, '..', 'public', 'index.html');
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

    initWSS(server);

    const localIP = getLocalIP();

    server.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log('================================');
        console.log('FileVault Server Running');
        console.log('Local:   http://localhost:' + CONFIG.PORT);
        console.log('LAN:     http://' + localIP + ':' + CONFIG.PORT);
        console.log('Max File Size: 1GB');
        console.log('WebSocket: Enabled');
        console.log('Database: SQLite');
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

    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        dbService.closeDatabase();
        process.exit(0);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
