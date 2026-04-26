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
    getByFolder: null,
    getByFolderNull: null
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
    fileStatements.getByFolderNull = database.prepare('SELECT * FROM files WHERE folder_id IS NULL ORDER BY upload_time DESC');
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
        return fileStatements.getByFolderNull.all();
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
    getByParentNull: null,
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
