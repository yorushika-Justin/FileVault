# FileVault 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FileVault 从单体架构重构为模块化架构，引入 SQLite，添加搜索/重命名等功能

**Architecture:** 后端拆分为 routes/services/middleware，数据层通过 SQLite；前端拆分为 app.js/search.js/upload.js；保持 Vanilla JS 无框架依赖

**Tech Stack:** Node.js, better-sqlite3, ws (WebSocket)

---

## 文件结构

```
filevault/
├── src/
│   ├── server.js           # 入口文件
│   ├── routes/
│   │   ├── files.js        # 文件 API 路由
│   │   ├── folders.js      # 文件夹 API 路由
│   │   └── share.js       # 分享 API 路由
│   ├── services/
│   │   ├── fileService.js  # 文件操作服务
│   │   ├── folderService.js # 文件夹操作服务
│   │   └── dbService.js    # SQLite 数据库服务
│   ├── middleware/
│   │   ├── security.js     # 安全中间件
│   │   └── cors.js        # CORS 配置
│   └── websocket.js        # WebSocket 服务
├── database/
│   └── filevault.db        # SQLite 数据库 (自动创建)
├── data/                   # 文件存储目录
├── public/
│   ├── index.html
│   ├── share.html
│   ├── css/
│   └── js/
│       ├── app.js          # 主应用
│       ├── search.js       # 搜索模块
│       └── upload.js       # 上传模块
├── package.json
└── server.js               # 启动脚本 (链接到 src/server.js)
```

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `server.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "filevault",
  "version": "5.0.0",
  "description": "FileVault - 局域网文件同步系统",
  "main": "src/server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "ws": "^8.20.0"
  },
  "author": "FileVault Team",
  "license": "MIT"
}
```

- [ ] **Step 2: 创建 server.js 入口脚本**

```javascript
#!/usr/bin/env node
const path = require('path');
// 启动 src/server.js
require(path.join(__dirname, 'src', 'server.js'));
```

- [ ] **Step 3: 提交**

```bash
git add package.json server.js
git commit -m "feat: 初始化项目 v5.0"
```

---

## Task 2: 数据库服务 (dbService.js)

**Files:**
- Create: `src/services/dbService.js`
- Create: `database/` 目录

- [ ] **Step 1: 创建 dbService.js**

```javascript
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'database', 'filevault.db');

let db = null;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function initDatabase() {
    const database = getDb();
    
    database.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            type TEXT DEFAULT '',
            category TEXT DEFAULT 'other',
            folder_id TEXT,
            upload_time INTEGER,
            time_category TEXT DEFAULT 'older',
            created_at INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at INTEGER,
            file_count INTEGER DEFAULT 0
        );
        
        CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
        CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
        CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
    `);
}

// File operations
const fileStatements = {
    getAll: null,
    getById: null,
    search: null,
    create: null,
    update: null,
    delete: null,
    getByFolder: null
};

function initFileStatements() {
    const database = getDb();
    fileStatements.getAll = database.prepare('SELECT * FROM files ORDER BY upload_time DESC');
    fileStatements.getById = database.prepare('SELECT * FROM files WHERE id = ?');
    fileStatements.search = database.prepare('SELECT * FROM files WHERE name LIKE ? ORDER BY upload_time DESC');
    fileStatements.create = database.prepare('INSERT INTO files (id, name, size, type, category, folder_id, upload_time, time_category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    fileStatements.update = database.prepare('UPDATE files SET name = ?, folder_id = ? WHERE id = ?');
    fileStatements.delete = database.prepare('DELETE FROM files WHERE id = ?');
    fileStatements.getByFolder = database.prepare('SELECT * FROM files WHERE folder_id = ? ORDER BY upload_time DESC');
}

function getAllFiles() {
    return fileStatements.getAll.all();
}

function getFileById(id) {
    return fileStatements.getById.get(id);
}

function searchFiles(keyword) {
    return fileStatements.search.all(`%${keyword}%`);
}

function createFile(file) {
    const now = Date.now();
    fileStatements.create.run(
        file.id,
        file.name,
        file.size || 0,
        file.type || '',
        file.category || 'other',
        file.folderId || null,
        file.uploadTime || now,
        file.timeCategory || 'older',
        now
    );
}

function updateFile(id, data) {
    const name = data.name || '';
    const folderId = data.folderId !== undefined ? data.folderId : null;
    fileStatements.update.run(name, folderId, id);
}

function deleteFile(id) {
    fileStatements.delete.run(id);
}

function getFilesByFolder(folderId) {
    if (folderId === null || folderId === undefined) {
        const database = getDb();
        return database.prepare('SELECT * FROM files WHERE folder_id IS NULL ORDER BY upload_time DESC').all();
    }
    return fileStatements.getByFolder.all(folderId);
}

// Folder operations
const folderStatements = {
    getAll: null,
    getById: null,
    create: null,
    update: null,
    delete: null,
    getByParent: null,
    getChildCount: null
};

function initFolderStatements() {
    const database = getDb();
    folderStatements.getAll = database.prepare('SELECT * FROM folders ORDER BY created_at DESC');
    folderStatements.getById = database.prepare('SELECT * FROM folders WHERE id = ?');
    folderStatements.create = database.prepare('INSERT INTO folders (id, name, parent_id, created_at, file_count) VALUES (?, ?, ?, ?, ?)');
    folderStatements.update = database.prepare('UPDATE folders SET name = ? WHERE id = ?');
    folderStatements.delete = database.prepare('DELETE FROM folders WHERE id = ?');
    folderStatements.getByParent = database.prepare('SELECT * FROM folders WHERE parent_id = ? ORDER BY created_at DESC');
    folderStatements.getByParentNull = database.prepare('SELECT * FROM folders WHERE parent_id IS NULL ORDER BY created_at DESC');
    folderStatements.getChildCount = database.prepare('SELECT COUNT(*) as count FROM files WHERE folder_id = ?');
}

function getAllFolders() {
    return folderStatements.getAll.all();
}

function getFolderById(id) {
    return folderStatements.getById.get(id);
}

function createFolder(folder) {
    const now = Date.now();
    const count = folderStatements.getChildCount.get(folder.id)?.count || 0;
    folderStatements.create.run(folder.id, folder.name, folder.parentId || null, now, count);
}

function updateFolder(id, data) {
    if (data.name) {
        folderStatements.update.run(data.name, id);
    }
}

function deleteFolder(id) {
    folderStatements.delete.run(id);
}

function getFoldersByParent(parentId) {
    if (parentId === null || parentId === undefined) {
        return folderStatements.getByParentNull.all();
    }
    return folderStatements.getByParent.all(parentId);
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    initDatabase,
    initFileStatements,
    initFolderStatements,
    getAllFiles,
    getFileById,
    searchFiles,
    createFile,
    updateFile,
    deleteFile,
    getFilesByFolder,
    getAllFolders,
    getFolderById,
    createFolder,
    updateFolder,
    deleteFolder,
    getFoldersByParent,
    closeDatabase,
    getDb
};
```

- [ ] **Step 2: 创建 database 目录**

```bash
mkdir -p database
```

- [ ] **Step 3: 提交**

```bash
git add src/services/dbService.js package.json
git commit -m "feat: 添加 SQLite 数据库服务"
```

---

## Task 3: 安全中间件

**Files:**
- Create: `src/middleware/security.js`

- [ ] **Step 1: 创建 security.js**

```javascript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/middleware/security.js
git commit -m "feat: 添加安全中间件"
```

---

## Task 4: CORS 中间件

**Files:**
- Create: `src/middleware/cors.js`

- [ ] **Step 1: 创建 cors.js**

```javascript
function setupCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Id, X-File-Name, X-File-Size, X-File-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }
    return false;
}

module.exports = { setupCors };
```

- [ ] **Step 2: 提交**

```bash
git add src/middleware/cors.js
git commit -m "feat: 添加 CORS 中间件"
```

---

## Task 5: 配置文件

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: 创建 config.js**

```javascript
const path = require('path');

module.exports = {
    PORT: process.env.PORT || 8888,
    MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB
    DATA_DIR: path.join(__dirname, '..', 'data'),
    DATABASE_DIR: path.join(__dirname, '..', 'database')
};
```

- [ ] **Step 2: 提交**

```bash
git add src/config.js
git commit -m "feat: 添加配置文件"
```

---

## Task 6: 文件服务 (fileService.js)

**Files:**
- Create: `src/services/fileService.js`

- [ ] **Step 1: 创建 fileService.js**

```javascript
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
            fs.unlinkSync(filePath);
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
```

- [ ] **Step 2: 提交**

```bash
git add src/services/fileService.js
git commit -m "feat: 添加文件服务"
```

---

## Task 7: 文件夹服务 (folderService.js)

**Files:**
- Create: `src/services/folderService.js`

- [ ] **Step 1: 创建 folderService.js**

```javascript
const fs = require('fs');
const path = require('path');
const dbService = require('./dbService');
const { escapeHtml, generateFolderId } = require('../middleware/security');
const CONFIG = require('../config');

function deleteFolderRecursive(folderId) {
    const childFolders = dbService.getFoldersByParent(folderId);
    childFolders.forEach(child => deleteFolderRecursive(child.id));

    const files = dbService.getFilesByFolder(folderId);
    files.forEach(file => {
        const filePath = path.join(CONFIG.DATA_DIR, file.id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        dbService.deleteFile(file.id);
    });

    dbService.deleteFolder(folderId);
}

function collectFolderContents(folderId, basePath = '') {
    const contents = [];
    const childFolders = dbService.getFoldersByParent(folderId);
    const folderFiles = dbService.getFilesByFolder(folderId);

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

function createFolder(name, parentId = null) {
    const folder = {
        id: generateFolderId(),
        name: escapeHtml(name),
        parentId: parentId
    };
    dbService.createFolder(folder);
    return folder;
}

function updateFolderName(folderId, newName) {
    dbService.updateFolder(folderId, { name: escapeHtml(newName) });
    return dbService.getFolderById(folderId);
}

function getFolderPath(folderId) {
    if (!folderId) return [];
    const folder = dbService.getFolderById(folderId);
    if (!folder) return [];
    const path = getFolderPath(folder.parent_id);
    path.push({ id: folder.id, name: folder.name });
    return path;
}

module.exports = {
    deleteFolderRecursive,
    collectFolderContents,
    createFolder,
    updateFolderName,
    getFolderPath
};
```

- [ ] **Step 2: 提交**

```bash
git add src/services/folderService.js
git commit -m "feat: 添加文件夹服务"
```

---

## Task 8: WebSocket 服务

**Files:**
- Create: `src/websocket.js`

- [ ] **Step 1: 创建 websocket.js**

```javascript
let wss = null;

function initWSS(server) {
    const WebSocket = require('ws');
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('WebSocket client connected');
        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
    });

    return wss;
}

function broadcast(type, data) {
    if (!wss) return;
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({ type, data }));
        }
    });
}

function notifyFileUpdate(files) {
    broadcast('file_updated', files);
}

function notifyFolderUpdate(folders) {
    broadcast('folder_updated', folders);
}

function getWss() {
    return wss;
}

module.exports = {
    initWSS,
    broadcast,
    notifyFileUpdate,
    notifyFolderUpdate,
    getWss
};
```

- [ ] **Step 2: 提交**

```bash
git add src/websocket.js
git commit -m "feat: 添加 WebSocket 服务"
```

---

## Task 9: 文件路由 (routes/files.js)

**Files:**
- Create: `src/routes/files.js`

- [ ] **Step 1: 创建 routes/files.js**

```javascript
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

    // parts: ['', 'api', 'files', ':id']
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
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/files.js
git commit -m "feat: 添加文件路由"
```

---

## Task 10: 文件夹路由 (routes/folders.js)

**Files:**
- Create: `src/routes/folders.js`

- [ ] **Step 1: 创建 routes/folders.js**

```javascript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/folders.js
git commit -m "feat: 添加文件夹路由"
```

---

## Task 11: 分享路由 (routes/share.js)

**Files:**
- Create: `src/routes/share.js`

- [ ] **Step 1: 创建 routes/share.js**

```javascript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/share.js
git commit -m "feat: 添加分享路由"
```

---

## Task 12: 主服务器 (src/server.js)

**Files:**
- Create: `src/server.js`

- [ ] **Step 1: 创建 src/server.js**

```javascript
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
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const { networkInterfaces } = os;

if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

dbService.initDatabase();
dbService.initFileStatements();
dbService.initFolderStatements();

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
```

- [ ] **Step 2: 提交**

```bash
git add src/server.js
git commit -m "feat: 添加主服务器"
```

---

## Task 13: 前端公共文件

**Files:**
- Create: `public/index.html`
- Create: `public/share.html`
- Create: `public/css/style.css`
- Create: `public/js/qrcode.min.js`

- [ ] **Step 1: 复制并适配现有前端文件**

现有文件需要适配新的 API：
1. `app.js` 适配新的 API 响应格式
2. 添加搜索功能到 `search.js`
3. 添加上传进度到 `upload.js`
4. 重命名功能集成到 `app.js`

注意：由于前端文件较大且需要适配新 API，这个任务会较复杂。

- [ ] **Step 2: 提交**

```bash
git add public/
git commit -m "feat: 添加前端文件"
```

---

## Task 14: 目录清理

**Files:**
- Modify: 删除旧的 `app.js`, `server.js`, `index.html` 等

- [ ] **Step 1: 清理旧文件**

```bash
# 删除根目录下的旧文件，保留新结构
rm -f app.js index.html share.html
```

- [ ] **Step 2: 提交**

```bash
git commit -m "chore: 清理旧文件"
```

---

## 实施顺序

1. Task 1: 项目初始化
2. Task 2: 数据库服务
3. Task 3: 安全中间件
4. Task 4: CORS 中间件
5. Task 5: 配置文件
6. Task 6: 文件服务
7. Task 7: 文件夹服务
8. Task 8: WebSocket 服务
9. Task 9: 文件路由
10. Task 10: 文件夹路由
11. Task 11: 分享路由
12. Task 12: 主服务器
13. Task 13: 前端文件
14. Task 14: 目录清理

---

## 验证步骤

每个任务完成后，验证：
1. `npm install` 成功
2. `npm start` 能启动
3. 浏览器访问 `http://localhost:8888`
4. 能上传文件
5. 能创建文件夹
6. WebSocket 连接成功
