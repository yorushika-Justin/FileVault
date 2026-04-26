const fs = require('fs');
const path = require('path');
const dbService = require('./dbService');
const { escapeHtml, generateFolderId } = require('../middleware/security');
const CONFIG = require('../config');

const TYPE = { FILE: 'file', FOLDER: 'folder' };

function deleteFolderRecursive(folderId) {
    const childFolders = dbService.getFoldersByParent(folderId);
    childFolders.forEach(child => deleteFolderRecursive(child.id));

    const files = dbService.getFilesByFolder(folderId);
    files.forEach(file => {
        const filePath = path.join(CONFIG.DATA_DIR, file.id);
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            // File may not exist
        }
        dbService.deleteFile(file.id);
    });

    dbService.deleteFolder(folderId);
}

function makeEntry(type, id, name, filePath) {
    return { type, id, name, path: filePath };
}

function collectFolderContents(folderId, basePath = '') {
    const contents = [];
    const childFolders = dbService.getFoldersByParent(folderId);
    const folderFiles = dbService.getFilesByFolder(folderId);

    folderFiles.forEach(file => {
        const filePath = basePath ? basePath + '/' + file.name : file.name;
        contents.push(makeEntry(TYPE.FILE, file.id, file.name, filePath));
    });

    childFolders.forEach(folder => {
        const folderPath = basePath ? basePath + '/' + folder.name : folder.name;
        contents.push(makeEntry(TYPE.FOLDER, folder.id, folder.name, folderPath));
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
    const parentPath = getFolderPath(folder.parent_id);
    parentPath.push({ id: folder.id, name: folder.name });
    return parentPath;
}

module.exports = {
    deleteFolderRecursive,
    collectFolderContents,
    createFolder,
    updateFolderName,
    getFolderPath
};
