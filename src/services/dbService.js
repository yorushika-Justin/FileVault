const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'database', 'filevault.db');

let db = null;
let SQL = null;

async function initSql() {
    if (!SQL) {
        SQL = await initSqlJs();
    }
    return SQL;
}

function getDb() {
    return db;
}

async function initDatabase() {
    await initSql();

    const dbDir = path.dirname(DB_PATH);
    fs.mkdirSync(dbDir, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
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
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at INTEGER,
            file_count INTEGER DEFAULT 0
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)`);

    saveDatabase();
}

function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getAllFiles() {
    const stmt = db.prepare('SELECT * FROM files ORDER BY upload_time DESC');
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function getFileById(id) {
    const stmt = db.prepare('SELECT * FROM files WHERE id = ?');
    stmt.bind([id]);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

function searchFiles(keyword) {
    const stmt = db.prepare('SELECT * FROM files WHERE name LIKE ? ORDER BY upload_time DESC');
    stmt.bind([`%${keyword}%`]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function createFile(file) {
    const now = Date.now();
    db.run(
        'INSERT INTO files (id, name, size, type, category, folder_id, upload_time, time_category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [file.id, file.name, file.size || 0, file.type || '', file.category || 'other', file.folderId || null, file.uploadTime || now, file.timeCategory || 'older', now]
    );
    saveDatabase();
}

function updateFile(id, data) {
    const name = data.name || '';
    const folderId = data.folderId !== undefined ? data.folderId : null;
    db.run('UPDATE files SET name = ?, folder_id = ? WHERE id = ?', [name, folderId, id]);
    saveDatabase();
}

function deleteFile(id) {
    db.run('DELETE FROM files WHERE id = ?', [id]);
    saveDatabase();
}

function getFilesByFolder(folderId) {
    if (folderId === null || folderId === undefined) {
        const stmt = db.prepare('SELECT * FROM files WHERE folder_id IS NULL ORDER BY upload_time DESC');
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    const stmt = db.prepare('SELECT * FROM files WHERE folder_id = ? ORDER BY upload_time DESC');
    stmt.bind([folderId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function getAllFolders() {
    const stmt = db.prepare('SELECT * FROM folders ORDER BY created_at DESC');
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function getFolderById(id) {
    const stmt = db.prepare('SELECT * FROM folders WHERE id = ?');
    stmt.bind([id]);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

function createFolder(folder) {
    const now = Date.now();
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE folder_id = ?');
    countStmt.bind([folder.id]);
    let count = 0;
    if (countStmt.step()) {
        count = countStmt.getAsObject().count || 0;
    }
    countStmt.free();

    db.run(
        'INSERT INTO folders (id, name, parent_id, created_at, file_count) VALUES (?, ?, ?, ?, ?)',
        [folder.id, folder.name, folder.parentId || null, now, count]
    );
    saveDatabase();
}

function updateFolder(id, data) {
    if (data.name) {
        db.run('UPDATE folders SET name = ? WHERE id = ?', [data.name, id]);
        saveDatabase();
    }
}

function deleteFolder(id) {
    db.run('DELETE FROM folders WHERE id = ?', [id]);
    saveDatabase();
}

function getFoldersByParent(parentId) {
    if (parentId === null || parentId === undefined) {
        const stmt = db.prepare('SELECT * FROM folders WHERE parent_id IS NULL ORDER BY created_at DESC');
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    const stmt = db.prepare('SELECT * FROM folders WHERE parent_id = ? ORDER BY created_at DESC');
    stmt.bind([parentId]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
    }
}

module.exports = {
    initDatabase,
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
