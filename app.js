let files = [];
let folders = [];
let currentFolder = null;
let previousFilesJSON = '';
let previousFoldersJSON = '';
let currentCategory = 'all';
let currentTimeFilter = 'all';
let currentSort = 'newest';
let currentViewMode = 'grid';
let detectedLocalIP = null;
let detectedPort = null;
let selectMode = false;
let selectedFiles = new Set();
let draggedFileId = null;
const LIST_VIEW_THRESHOLD = 10;
const imageCache = new Map();
let contextMenuTarget = null;
let contextMenuType = null;

async function fetchLocalIP() {
    try {
        const response = await fetch('/api/ip');
        if (response.ok) {
            const data = await response.json();
            detectedLocalIP = data.ip;
        }
    } catch (e) {
        console.log('Could not fetch local IP');
    }
}

async function fetchPort() {
    try {
        const response = await fetch('/api/port');
        if (response.ok) {
            const data = await response.json();
            detectedPort = data.port;
        }
    } catch (e) {
        detectedPort = window.location.port || '8888';
    }
}

function getLocalIP() {
    if (detectedLocalIP) return detectedLocalIP;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return '192.168.31.61';
    return host;
}

function updateConnectionStatus(connected) {
    const syncStatus = document.getElementById('syncStatus');
    const syncStatusText = document.getElementById('syncStatusText');
    
    if (connected) {
        syncStatus.classList.remove('disconnected');
        syncStatus.classList.add('connected');
        syncStatusText.innerHTML = '🟢 已连接服务器';
    } else {
        syncStatus.classList.remove('connected');
        syncStatus.classList.add('disconnected');
        syncStatusText.innerHTML = '🔴 未连接服务器';
    }
}

async function fetchFilesFromServer() {
    try {
        const response = await fetch('/api/files');
        if (response.ok) {
            const newFiles = await response.json();
            const newFilesJSON = JSON.stringify(newFiles);
            
            if (newFilesJSON !== previousFilesJSON) {
                files = newFiles;
                previousFilesJSON = newFilesJSON;
                updateCounts();
                renderFiles();
                autoSwitchViewMode();
            }
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(false);
        }
    } catch (e) {
        console.error('Failed to fetch files from server:', e);
        updateConnectionStatus(false);
    }
}

async function fetchFoldersFromServer() {
    try {
        const response = await fetch('/api/folders');
        if (response.ok) {
            const newFolders = await response.json();
            const newFoldersJSON = JSON.stringify(newFolders);
            
            if (newFoldersJSON !== previousFoldersJSON) {
                folders = newFolders;
                previousFoldersJSON = newFoldersJSON;
                renderFiles();
            }
        }
    } catch (e) {
        console.error('Failed to fetch folders from server:', e);
    }
}

async function init() {
    try {
        await fetchLocalIP();
        await fetchPort();
        updateConnectionStatus(true);
        setInterval(async () => {
            await fetchFilesFromServer();
            await fetchFoldersFromServer();
        }, 5000);
        await fetchFoldersFromServer();
        await fetchFilesFromServer();
        setupDragAndDrop();
    } catch (error) {
        console.error('Initialization error:', error);
        updateConnectionStatus(false);
    }
}

function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    uploadArea.addEventListener('dragover', () => {
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        uploadArea.classList.remove('dragover');
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length > 0) {
            processFiles(droppedFiles);
        }
    });
}

function generateShortId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function handleFolderSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        await processFolderFiles(files);
    }
    event.target.value = '';
}

async function processFolderFiles(fileList) {
    const progress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    
    progress.style.display = 'block';
    let processed = 0;
    const total = fileList.length;
    
    const folderMap = new Map();
    
    for (const file of fileList) {
        try {
            await processFileWithPath(file, folderMap);
            processed++;
            const percent = Math.round((processed / total) * 100);
            progressFill.style.width = percent + '%';
        } catch (error) {
            console.error('Failed to process file:', file.webkitRelativePath || file.name, error);
            showToast(`上传失败：${file.webkitRelativePath || file.name} - ${error.message}`, 'error');
        }
    }
    
    setTimeout(async () => {
        progress.style.display = 'none';
        progressFill.style.width = '0%';
        previousFilesJSON = '';
        previousFoldersJSON = '';
        await fetchFoldersFromServer();
        await fetchFilesFromServer();
        if (processed > 0) {
            showToast(`${processed} 个文件上传成功`, 'success');
        }
    }, 500);
}

async function getOrCreateFolder(path, folderMap) {
    if (!path || path === '') {
        return currentFolder;
    }
    
    if (folderMap.has(path)) {
        return folderMap.get(path);
    }
    
    const parts = path.split('/');
    let parentFolderId = currentFolder;
    
    for (let i = 0; i < parts.length; i++) {
        const folderName = parts[i];
        if (!folderName) continue;
        
        const currentPath = parts.slice(0, i + 1).join('/');
        
        if (folderMap.has(currentPath)) {
            parentFolderId = folderMap.get(currentPath);
            continue;
        }
        
        const existingFolder = folders.find(f => 
            f.name === folderName && 
            ((parentFolderId === null && !f.parentId) || f.parentId === parentFolderId)
        );
        
        if (existingFolder) {
            folderMap.set(currentPath, existingFolder.id);
            parentFolderId = existingFolder.id;
        } else {
            try {
                const response = await fetch('/api/folders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: folderName, parentId: parentFolderId })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    folderMap.set(currentPath, data.folder.id);
                    parentFolderId = data.folder.id;
                }
            } catch (e) {
                console.error('Failed to create folder:', folderName, e);
            }
        }
    }
    
    return parentFolderId;
}

async function processFileWithPath(file, folderMap) {
    let filePath = file.webkitRelativePath || file.name;
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop();
    const folderPath = pathParts.join('/');
    
    const folderId = await getOrCreateFolder(folderPath, folderMap);
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            const fileId = generateShortId();
            const fileData = {
                id: fileId,
                name: fileName,
                size: file.size,
                type: file.type,
                category: getFileCategory(fileName),
                uploadTime: Date.now(),
                timeCategory: getTimeCategory(Date.now()),
                folderId: folderId
            };
            
            try {
                await fetch('/api/files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fileData)
                });
                
                const base64Data = e.target.result.split(',')[1];
                const binaryData = atob(base64Data);
                const uint8Array = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    uint8Array[i] = binaryData.charCodeAt(i);
                }
                
                await fetch('/api/upload/' + fileId, {
                    method: 'POST',
                    body: uint8Array
                });
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

async function processFiles(fileList) {
    const progress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    
    progress.style.display = 'block';
    let processed = 0;
    const total = fileList.length;
    
    for (const file of fileList) {
        try {
            await processSingleFile(file, currentFolder);
            processed++;
            const percent = Math.round((processed / total) * 100);
            progressFill.style.width = percent + '%';
        } catch (error) {
            console.error('Failed to process file:', file.name, error);
            showToast(`上传失败：${file.name} - ${error.message}`, 'error');
        }
    }
    
    setTimeout(async () => {
        progress.style.display = 'none';
        progressFill.style.width = '0%';
        previousFilesJSON = '';
        await fetchFilesFromServer();
        if (processed > 0) {
            showToast(`${processed} 个文件上传成功`, 'success');
        }
    }, 500);
}

async function processSingleFile(file, folderId = null) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            const fileId = generateShortId();
            const fileData = {
                id: fileId,
                name: file.name,
                size: file.size,
                type: file.type,
                category: getFileCategory(file.name),
                uploadTime: Date.now(),
                timeCategory: getTimeCategory(Date.now()),
                folderId: folderId
            };
            
            try {
                await fetch('/api/files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fileData)
                });
                
                const base64Data = e.target.result.split(',')[1];
                const binaryData = atob(base64Data);
                const uint8Array = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    uint8Array[i] = binaryData.charCodeAt(i);
                }
                
                await fetch('/api/upload/' + fileId, {
                    method: 'POST',
                    body: uint8Array
                });
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

function getFileCategory(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
        return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function getFileIcon(category) {
    const icons = { pdf: '📄', word: '📝', image: '🖼️', other: '📁' };
    return icons[category] || icons.other;
}

function getTypeLabel(category) {
    const labels = { pdf: 'PDF', word: 'Word', image: '图片', other: '文件' };
    return labels[category] || labels.other;
}

function updateCounts() {
    const rootFolders = folders.filter(f => !f.parentId);
    const rootFiles = files.filter(f => !f.folderId);
    const totalItems = rootFiles.length + rootFolders.length;
    
    const counts = { all: totalItems, pdf: 0, word: 0, image: 0, other: 0 };
    const timeCounts = { all: totalItems, today: 0, week: 0, older: 0 };
    
    rootFiles.forEach(f => {
        counts[f.category]++;
        timeCounts[f.timeCategory]++;
    });
    
    ['all', 'pdf', 'word', 'image', 'other'].forEach(key => {
        const el = document.getElementById('count-' + key);
        if (el) el.textContent = counts[key];
    });
    
    ['all', 'today', 'week', 'older'].forEach(key => {
        const el = document.getElementById('time-count-' + key);
        if (el) el.textContent = timeCounts[key];
    });
    
    document.getElementById('total-files').textContent = totalItems;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    document.getElementById('total-size').textContent = formatFileSize(totalSize);
}

function autoSwitchViewMode() {
    if (files.length >= LIST_VIEW_THRESHOLD && currentViewMode === 'grid') {
        setViewMode('list');
    }
}

function setViewMode(mode) {
    currentViewMode = mode;
    document.getElementById('gridViewBtn').classList.toggle('active', mode === 'grid');
    document.getElementById('listViewBtn').classList.toggle('active', mode === 'list');
    renderFiles();
}

function renderFiles() {
    const container = document.getElementById('fileContainer');
    
    let filtered = files.filter(f => {
        if (currentFolder !== null && f.folderId !== currentFolder) return false;
        if (currentFolder === null && f.folderId) return false;
        if (currentCategory !== 'all' && f.category !== currentCategory) return false;
        if (currentTimeFilter !== 'all' && f.timeCategory !== currentTimeFilter) return false;
        return true;
    });
    
    if (currentSort === 'newest') filtered.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
    else if (currentSort === 'oldest') filtered.sort((a, b) => (a.uploadTime || 0) - (b.uploadTime || 0));
    else if (currentSort === 'name') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    const currentFolderData = currentFolder ? folders.find(f => f.id === currentFolder) : null;
    const showFolders = currentCategory === 'all' && currentTimeFilter === 'all';
    
    if (filtered.length === 0 && !showFolders && folders.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>暂无文件</h3><p>上传文件开始使用</p></div>';
        return;
    }
    
    if (currentViewMode === 'grid') {
        renderGridView(container, filtered, showFolders);
    } else {
        renderListView(container, filtered, showFolders);
    }
}

function renderGridView(container, filtered, showFolders) {
    const selectModeClass = selectMode ? 'select-mode' : '';
    let html = '<div class="file-grid ' + selectModeClass + '">';
    
    if (currentFolder !== null) {
        html += `
            <div class="folder-card" onclick="exitFolder()">
                <div class="folder-preview">
                    <span class="folder-icon">⬅️</span>
                </div>
                <div class="folder-info">
                    <div class="folder-name">返回上级</div>
                    <div class="folder-meta">返回文件列表</div>
                </div>
            </div>
        `;
    }
    
    if (showFolders) {
        const childFolders = folders.filter(f => f.parentId === currentFolder);
        childFolders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        childFolders.forEach(folder => {
            const fileCount = files.filter(f => f.folderId === folder.id).length;
            const subFolderCount = folders.filter(f => f.parentId === folder.id).length;
            html += `
                <div class="folder-card" data-folder-id="${folder.id}"
                     ondragover="event.preventDefault(); this.classList.add('dragover');"
                     ondragleave="this.classList.remove('dragover');"
                     ondrop="handleFolderDrop(event, '${folder.id}')"
                     onclick="enterFolder('${folder.id}')"
                     oncontextmenu="showContextMenu(event, 'folder', '${folder.id}')">
                    <div class="folder-preview">
                        <span class="folder-icon">📁</span>
                    </div>
                    <div class="folder-info">
                        <div class="folder-name" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</div>
                        <div class="folder-meta">${fileCount} 个文件${subFolderCount > 0 ? ` · ${subFolderCount} 个子文件夹` : ''}</div>
                        <div class="folder-actions">
                            <button class="file-action-btn" onclick="event.stopPropagation(); downloadFolder('${folder.id}')">下载</button>
                            <button class="file-action-btn delete" onclick="event.stopPropagation(); deleteFolder('${folder.id}')">删除</button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    filtered.forEach(f => {
        const isSelected = selectedFiles.has(f.id);
        html += `
            <div class="file-card ${isSelected ? 'selected' : ''}" data-id="${f.id}" draggable="true"
                 ondragstart="handleFileDragStart(event, '${f.id}')"
                 ondragend="handleFileDragEnd(event)"
                 oncontextmenu="showContextMenu(event, 'file', '${f.id}')">
                <div class="file-checkbox ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation(); toggleFileSelection('${f.id}')">${isSelected ? '✓' : ''}</div>
                <div class="file-preview" onclick="${selectMode ? `toggleFileSelection('${f.id}')` : `previewFile('${f.id}', '${f.category}')`}">
                    ${renderPreviewContent(f)}
                    <span class="file-type-badge ${f.category}">${getTypeLabel(f.category)}</span>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                    <div class="file-meta">${formatFileSize(f.size || 0)} · ${formatDate(f.uploadTime || 0)}</div>
                    <div class="file-actions">
                        <button class="file-action-btn" onclick="event.stopPropagation(); downloadFile('${f.id}')">下载</button>
                        <button class="file-action-btn delete" onclick="event.stopPropagation(); deleteFile('${f.id}')">删除</button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderListView(container, filtered, showFolders) {
    let html = `
        <table class="file-table">
            <thead>
                <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (currentFolder !== null) {
        html += `
            <tr class="folder-row" onclick="exitFolder()" style="cursor: pointer;">
                <td>
                    <div class="file-name-cell">
                        <span class="file-icon">⬅️</span>
                        <span>返回上级</span>
                    </div>
                </td>
                <td><span class="file-type-badge" style="position:static; background: #9e9e9e;">文件夹</span></td>
                <td>-</td>
                <td>-</td>
                <td></td>
            </tr>
        `;
    }
    
    if (showFolders) {
        const childFolders = folders.filter(f => f.parentId === currentFolder);
        childFolders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        childFolders.forEach(folder => {
            const fileCount = files.filter(f => f.folderId === folder.id).length;
            const subFolderCount = folders.filter(f => f.parentId === folder.id).length;
            html += `
                <tr class="folder-row" data-folder-id="${folder.id}"
                    ondragover="event.preventDefault(); this.classList.add('dragover');"
                    ondragleave="this.classList.remove('dragover');"
                    ondrop="handleFolderDrop(event, '${folder.id}')"
                    onclick="enterFolder('${folder.id}')" 
                    oncontextmenu="showContextMenu(event, 'folder', '${folder.id}')"
                    style="cursor: pointer;">
                    <td>
                        <div class="file-name-cell">
                            <span class="file-icon">📁</span>
                            <span>${escapeHtml(folder.name)}</span>
                        </div>
                    </td>
                    <td><span class="file-type-badge" style="position:static; background: #ffc107;">文件夹</span></td>
                    <td>${fileCount} 个文件${subFolderCount > 0 ? ` · ${subFolderCount} 个子文件夹` : ''}</td>
                    <td>${formatDate(folder.createdAt || 0)}</td>
                    <td>
                        <div class="file-actions-cell">
                            <button class="file-action-btn" onclick="event.stopPropagation(); downloadFolder('${folder.id}')">下载</button>
                            <button class="file-action-btn delete" onclick="event.stopPropagation(); deleteFolder('${folder.id}')">删除</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
    
    filtered.forEach(f => {
        const isSelected = selectedFiles.has(f.id);
        html += `
            <tr class="${isSelected ? 'selected' : ''}" data-id="${f.id}" draggable="true"
                ondragstart="handleFileDragStart(event, '${f.id}')"
                ondragend="handleFileDragEnd(event)"
                oncontextmenu="showContextMenu(event, 'file', '${f.id}')">
                <td>
                    <div class="file-name-cell">
                        ${selectMode ? `<div class="file-checkbox ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation(); toggleFileSelection('${f.id}')">${isSelected ? '✓' : ''}</div>` : ''}
                        ${f.category === 'image' 
                            ? `<img src="/api/download/${f.id}" alt="" loading="lazy" onerror="this.style.display='none'" />` 
                            : `<span class="file-icon">${getFileIcon(f.category)}</span>`
                        }
                        <span>${escapeHtml(f.name)}</span>
                    </div>
                </td>
                <td><span class="file-type-badge ${f.category}" style="position:static;">${getTypeLabel(f.category)}</span></td>
                <td>${formatFileSize(f.size || 0)}</td>
                <td>${formatDate(f.uploadTime || 0)}</td>
                <td>
                    <div class="file-actions-cell">
                        <button class="file-action-btn" onclick="downloadFile('${f.id}')">下载</button>
                        <button class="file-action-btn delete" onclick="deleteFile('${f.id}')">删除</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderPreviewContent(file) {
    if (file.category === 'image') {
        return `
            <span class="img-placeholder" id="ph-${file.id}">${getFileIcon(file.category)}</span>
            <img src="/api/download/${file.id}" alt="" loading="lazy"
                 onload="this.classList.add('loaded'); document.getElementById('ph-${file.id}').style.display='none';"
                 onerror="this.style.display='none';" />
        `;
    }
    return `<span class="img-placeholder">${getFileIcon(file.category)}</span>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('[data-filter]').forEach(el => {
        el.classList.toggle('active', el.dataset.filter === cat);
    });
    renderFiles();
}

function setTimeFilter(time) {
    currentTimeFilter = time;
    document.querySelectorAll('[data-time]').forEach(el => {
        el.classList.toggle('active', el.dataset.time === time);
    });
    renderFiles();
}

function previewFile(fileId, category) {
    if (category === 'image') {
        const modal = document.getElementById('previewModal');
        const img = document.getElementById('previewImage');
        const loading = document.getElementById('previewLoading');
        
        img.style.display = 'none';
        loading.style.display = 'block';
        loading.textContent = '加载中...';
        
        img.onload = function() {
            loading.style.display = 'none';
            img.style.display = 'block';
        };
        
        img.onerror = function() {
            loading.textContent = '图片加载失败';
        };
        
        img.src = '/api/download/' + fileId + '?t=' + Date.now();
        modal.classList.add('active');
    } else {
        showToast('仅支持图片预览', 'info');
    }
}

function closePreview() {
    const modal = document.getElementById('previewModal');
    const img = document.getElementById('previewImage');
    const loading = document.getElementById('previewLoading');
    
    modal.classList.remove('active');
    img.src = '';
    img.style.display = 'none';
    loading.style.display = 'block';
    loading.textContent = '加载中...';
}

function showFileQR(fileId) {
    const file = files.find(f => f.id === fileId);
    if (!file) {
        showToast('文件不存在', 'error');
        return;
    }
    
    const localIP = getLocalIP();
    const port = detectedPort || window.location.port || '8888';
    const shareUrl = 'http://' + localIP + ':' + port + '/share.html?f=' + fileId;
    
    document.getElementById('shareFileName').textContent = file.name;
    document.getElementById('shareLinkInput').value = shareUrl;
    
    generateQRCode(shareUrl, 'qrCodeContainer');
    
    document.getElementById('shareModal').classList.add('active');
}

function showFolderQR(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) {
        showToast('文件夹不存在', 'error');
        return;
    }
    
    const localIP = getLocalIP();
    const port = detectedPort || window.location.port || '8888';
    const shareUrl = 'http://' + localIP + ':' + port + '/share.html?folder=' + folderId;
    
    document.getElementById('shareFileName').textContent = folder.name + ' (文件夹)';
    document.getElementById('shareLinkInput').value = shareUrl;
    
    generateQRCode(shareUrl, 'qrCodeContainer');
    
    document.getElementById('shareModal').classList.add('active');
}

function openSelectShareModal() {
    const shareList = document.getElementById('shareList');
    
    const rootFolders = folders.filter(f => !f.parentId);
    const rootFiles = files.filter(f => !f.folderId);
    
    if (rootFolders.length === 0 && rootFiles.length === 0) {
        shareList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">暂无文件或文件夹</div>';
    } else {
        let html = '';
        
        if (rootFolders.length > 0) {
            html += '<div style="font-size: 12px; font-weight: 700; color: #667eea; margin-bottom: 8px; padding: 0 8px;">文件夹</div>';
            html += rootFolders.map(f => {
                const childCount = Object.values(folders).filter(child => child.parentId === f.id).length;
                const fileCount = files.filter(file => file.folderId === f.id).length;
                return `
                    <div class="file-share-item" onclick="showFolderQR('${f.id}'); closeSelectShareModal();">
                        <span style="font-size: 20px; margin-right: 10px;">📁</span>
                        <div>
                            <div style="font-weight: 600; font-size: 13px;">${escapeHtml(f.name)}</div>
                            <div style="font-size: 11px; color: #999;">${fileCount} 个文件 · ${childCount} 个子文件夹</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        if (rootFiles.length > 0) {
            html += '<div style="font-size: 12px; font-weight: 700; color: #667eea; margin-bottom: 8px; padding: 0 8px; margin-top: 16px;">文件</div>';
            html += rootFiles.map(f => `
                <div class="file-share-item" onclick="showFileQR('${f.id}'); closeSelectShareModal();">
                    <span style="font-size: 20px; margin-right: 10px;">${getFileIcon(f.category)}</span>
                    <div>
                        <div style="font-weight: 600; font-size: 13px;">${escapeHtml(f.name)}</div>
                        <div style="font-size: 11px; color: #999;">${formatFileSize(f.size || 0)}</div>
                    </div>
                </div>
            `).join('');
        }
        
        shareList.innerHTML = html;
    }
    
    document.getElementById('selectShareModal').classList.add('active');
}

function closeSelectShareModal() {
    document.getElementById('selectShareModal').classList.remove('active');
}

async function downloadFile(fileId) {
    const file = files.find(f => f.id === fileId);
    if (!file) {
        showToast('文件不存在', 'error');
        return;
    }
    
    try {
        showToast('开始下载：' + file.name, 'success');
        
        const response = await fetch('/api/download/' + fileId);
        if (!response.ok) throw new Error('下载失败');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast('下载失败：' + e.message, 'error');
    }
}

async function downloadFolder(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) {
        showToast('文件夹不存在', 'error');
        return;
    }
    
    try {
        showToast('开始下载文件夹：' + folder.name, 'success');
        
        const infoResponse = await fetch('/api/folders/' + folderId + '/info');
        if (!infoResponse.ok) {
            throw new Error('获取文件夹信息失败');
        }
        
        const folderInfo = await infoResponse.json();
        const contents = folderInfo.contents;
        const files = contents.filter(c => c.type === 'file');
        
        const zip = new JSZip();
        let processed = 0;
        const total = files.length;
        
        for (const file of files) {
            try {
                showToast(`正在下载文件... (${processed + 1}/${total})`, 'info');
                
                const fileResponse = await fetch('/api/download/' + file.id);
                if (!fileResponse.ok) {
                    console.warn('Failed to download file:', file.name);
                    continue;
                }
                
                const blob = await fileResponse.blob();
                zip.file(file.path, blob);
                
                processed++;
            } catch (e) {
                console.warn('Error processing file:', file.name, e);
            }
        }
        
        showToast('正在生成 ZIP 文件...', 'info');
        
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        
        const url = URL.createObjectURL(zipBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = folder.name + '.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        showToast('文件夹下载完成！', 'success');
    } catch (e) {
        showToast('下载失败：' + e.message, 'error');
    }
}

async function deleteFile(fileId) {
    if (!confirm('确定要删除这个文件吗？')) return;
    
    try {
        await fetch('/api/files/' + fileId, { method: 'DELETE' });
        showToast('文件已删除', 'success');
        previousFilesJSON = '';
        await fetchFilesFromServer();
    } catch (e) {
        showToast('删除失败：' + e.message, 'error');
    }
}

function generateQRCode(text, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (typeof qrcode === 'undefined') {
        container.innerHTML = '<div style="color: #999; padding: 20px; font-size: 13px;">二维码加载中...</div>';
        const checkQR = setInterval(() => {
            if (typeof qrcode !== 'undefined') {
                clearInterval(checkQR);
                generateQRCode(text, containerId);
            }
        }, 200);
        setTimeout(() => {
            clearInterval(checkQR);
            if (typeof qrcode === 'undefined') {
                container.innerHTML = '<div style="color: #999; padding: 20px; font-size: 13px;">请复制上方链接分享</div>';
            }
        }, 3000);
        return;
    }
    
    try {
        const qr = qrcode(0, 'L');
        qr.addData(text);
        qr.make();
        
        const moduleCount = qr.getModuleCount();
        const size = 180;
        const margin = 10;
        const moduleSize = Math.max(2, (size - 2 * margin) / moduleCount);
        const actualSize = moduleSize * moduleCount + 2 * margin;
        
        const canvas = document.createElement('canvas');
        canvas.width = actualSize;
        canvas.height = actualSize;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, actualSize, actualSize);
        ctx.fillStyle = '#000000';
        
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(margin + col * moduleSize, margin + row * moduleSize, moduleSize, moduleSize);
                }
            }
        }
        
        container.appendChild(canvas);
    } catch (e) {
        container.innerHTML = '<div style="color: #999; padding: 20px; font-size: 13px;">请复制上方链接分享</div>';
    }
}

function setSortOption() {
    currentSort = document.getElementById('sortSelect').value;
    renderFiles();
}

function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
        processFiles(selectedFiles);
    }
    e.target.value = '';
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
}

function copyShareLink() {
    const input = document.getElementById('shareLinkInput');
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(() => {
            showToast('链接已复制', 'success');
        }).catch(() => {
            fallbackCopy(input);
        });
    } else {
        fallbackCopy(input);
    }
}

function fallbackCopy(input) {
    input.select();
    input.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        showToast('链接已复制', 'success');
    } catch (e) {
        showToast('复制失败，请手动复制', 'error');
    }
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function exportData() {
    if (files.length === 0) {
        showToast('没有文件可导出', 'error');
        return;
    }
    
    const exportData = {
        version: '4.0',
        exportTime: new Date().toISOString(),
        files: files
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'filevault_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('已导出 ' + files.length + ' 个文件', 'success');
}

function toggleSelectMode() {
    selectMode = !selectMode;
    selectedFiles.clear();
    
    const selectModeBtn = document.getElementById('selectModeBtn');
    const selectModeBar = document.getElementById('selectModeBar');
    
    if (selectMode) {
        selectModeBtn.textContent = '取消选择';
        selectModeBtn.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%)';
        selectModeBar.classList.add('active');
    } else {
        selectModeBtn.textContent = '选择';
        selectModeBtn.style.background = '';
        selectModeBar.classList.remove('active');
    }
    
    updateSelectedCount();
    renderFiles();
}

function toggleFileSelection(fileId) {
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    
    updateSelectedCount();
    
    const card = document.querySelector(`.file-card[data-id="${fileId}"]`);
    const row = document.querySelector(`tr[data-id="${fileId}"]`);
    const checkbox = document.querySelector(`.file-card[data-id="${fileId}"] .file-checkbox, tr[data-id="${fileId}"] .file-checkbox`);
    
    if (card) {
        card.classList.toggle('selected', selectedFiles.has(fileId));
    }
    if (row) {
        row.classList.toggle('selected', selectedFiles.has(fileId));
    }
    if (checkbox) {
        checkbox.classList.toggle('checked', selectedFiles.has(fileId));
        checkbox.textContent = selectedFiles.has(fileId) ? '✓' : '';
    }
}

function selectAllFiles() {
    const filtered = files.filter(f => {
        if (currentCategory !== 'all' && f.category !== currentCategory) return false;
        if (currentTimeFilter !== 'all' && f.timeCategory !== currentTimeFilter) return false;
        return true;
    });
    
    const allSelected = filtered.every(f => selectedFiles.has(f.id));
    
    if (allSelected) {
        filtered.forEach(f => selectedFiles.delete(f.id));
    } else {
        filtered.forEach(f => selectedFiles.add(f.id));
    }
    
    updateSelectedCount();
    renderFiles();
}

function updateSelectedCount() {
    const countEl = document.getElementById('selectedCount');
    countEl.textContent = `已选择 ${selectedFiles.size} 个文件`;
}

async function deleteSelectedFiles() {
    if (selectedFiles.size === 0) {
        showToast('请先选择要删除的文件', 'error');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${selectedFiles.size} 个文件吗？`)) return;
    
    const fileIds = Array.from(selectedFiles);
    let deletedCount = 0;
    
    for (const fileId of fileIds) {
        try {
            await fetch('/api/files/' + fileId, { method: 'DELETE' });
            deletedCount++;
        } catch (e) {
            console.error('Failed to delete file:', fileId, e);
        }
    }
    
    showToast(`已删除 ${deletedCount} 个文件`, 'success');
    selectedFiles.clear();
    previousFilesJSON = '';
    await fetchFilesFromServer();
    updateSelectedCount();
}

async function createFolder() {
    const name = prompt('请输入文件夹名称：');
    if (!name || !name.trim()) return;
    
    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), parentId: currentFolder })
        });
        
        if (response.ok) {
            showToast('文件夹创建成功', 'success');
            previousFoldersJSON = '';
            await fetchFoldersFromServer();
        } else {
            const data = await response.json();
            showToast(data.error || '创建失败', 'error');
        }
    } catch (e) {
        showToast('创建失败：' + e.message, 'error');
    }
}

function enterFolder(folderId) {
    currentFolder = folderId;
    const folder = folders.find(f => f.id === folderId);
    document.getElementById('currentFolderName').textContent = folder ? folder.name : '';
    document.getElementById('folderBreadcrumb').style.display = 'flex';
    renderFiles();
}

function exitFolder() {
    if (currentFolder) {
        const currentFolderData = folders.find(f => f.id === currentFolder);
        if (currentFolderData && currentFolderData.parentId) {
            currentFolder = currentFolderData.parentId;
            const parentFolder = folders.find(f => f.id === currentFolder);
            document.getElementById('currentFolderName').textContent = parentFolder ? parentFolder.name : '';
        } else {
            currentFolder = null;
            document.getElementById('folderBreadcrumb').style.display = 'none';
        }
    } else {
        currentFolder = null;
        document.getElementById('folderBreadcrumb').style.display = 'none';
    }
    renderFiles();
}

async function renameFolder(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    
    const newName = prompt('请输入新的文件夹名称：', folder.name);
    if (!newName || !newName.trim() || newName === folder.name) return;
    
    try {
        const response = await fetch('/api/folders/' + folderId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
        });
        
        if (response.ok) {
            showToast('文件夹重命名成功', 'success');
            previousFoldersJSON = '';
            await fetchFoldersFromServer();
        } else {
            const data = await response.json();
            showToast(data.error || '重命名失败', 'error');
        }
    } catch (e) {
        showToast('重命名失败：' + e.message, 'error');
    }
}

async function deleteFolder(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    
    const fileCount = files.filter(f => f.folderId === folderId).length;
    const message = fileCount > 0 
        ? `文件夹内有 ${fileCount} 个文件，确定要删除文件夹及其所有文件吗？`
        : '确定要删除这个空文件夹吗？';
    
    if (!confirm(message)) return;
    
    try {
        const response = await fetch('/api/folders/' + folderId, { method: 'DELETE' });
        
        if (response.ok) {
            showToast('文件夹已删除', 'success');
            previousFoldersJSON = '';
            previousFilesJSON = '';
            await fetchFoldersFromServer();
            await fetchFilesFromServer();
        } else {
            const data = await response.json();
            showToast(data.error || '删除失败', 'error');
        }
    } catch (e) {
        showToast('删除失败：' + e.message, 'error');
    }
}

function handleFileDragStart(event, fileId) {
    draggedFileId = fileId;
    event.dataTransfer.effectAllowed = 'move';
    event.target.style.opacity = '0.5';
}

function handleFileDragEnd(event) {
    draggedFileId = null;
    event.target.style.opacity = '1';
    document.querySelectorAll('.folder-card, .folder-row').forEach(el => {
        el.classList.remove('dragover');
    });
}

async function handleFolderDrop(event, folderId) {
    event.preventDefault();
    event.stopPropagation();
    
    document.querySelectorAll('.folder-card, .folder-row').forEach(el => {
        el.classList.remove('dragover');
    });
    
    if (!draggedFileId) return;
    
    const file = files.find(f => f.id === draggedFileId);
    if (!file) return;
    
    if (file.folderId === folderId) {
        showToast('文件已在此文件夹中', 'info');
        return;
    }
    
    try {
        const response = await fetch('/api/files/' + draggedFileId + '/move', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: folderId })
        });
        
        if (response.ok) {
            showToast('文件已移动到文件夹', 'success');
            previousFilesJSON = '';
            previousFoldersJSON = '';
            await fetchFilesFromServer();
            await fetchFoldersFromServer();
        } else {
            const data = await response.json();
            showToast(data.error || '移动失败', 'error');
        }
    } catch (e) {
        showToast('移动失败：' + e.message, 'error');
    }
    
    draggedFileId = null;
}

function showContextMenu(event, type, id) {
    event.preventDefault();
    event.stopPropagation();
    
    contextMenuTarget = id;
    contextMenuType = type;
    
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    
    let x = event.clientX;
    let y = event.clientY;
    
    const menuRect = contextMenu.getBoundingClientRect();
    if (x + menuRect.width > window.innerWidth) {
        x = x - menuRect.width;
    }
    if (y + menuRect.height > window.innerHeight) {
        y = y - menuRect.height;
    }
    
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'none';
    contextMenuTarget = null;
    contextMenuType = null;
}

async function handleContextAction(action) {
    hideContextMenu();
    
    if (!contextMenuTarget || !contextMenuType) return;
    
    try {
        if (contextMenuType === 'folder') {
            const folder = folders.find(f => f.id === contextMenuTarget);
            if (!folder) {
                showToast('文件夹不存在', 'error');
                return;
            }
            
            switch (action) {
                case 'rename':
                    await renameFolder(contextMenuTarget);
                    break;
                case 'download':
                    await downloadFolder(contextMenuTarget);
                    break;
                case 'delete':
                    await deleteFolder(contextMenuTarget);
                    break;
                case 'share':
                    showFolderQR(contextMenuTarget);
                    break;
            }
        } else if (contextMenuType === 'file') {
            const file = files.find(f => f.id === contextMenuTarget);
            if (!file) {
                showToast('文件不存在', 'error');
                return;
            }
            
            switch (action) {
                case 'rename':
                    const newName = prompt('请输入新的文件名：', file.name);
                    if (!newName || !newName.trim() || newName === file.name) return;
                    
                    try {
                        const response = await fetch('/api/files/' + contextMenuTarget, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName.trim() })
                        });
                        
                        if (response.ok) {
                            showToast('文件重命名成功', 'success');
                            previousFilesJSON = '';
                            await fetchFilesFromServer();
                        } else {
                            const data = await response.json();
                            showToast(data.error || '重命名失败', 'error');
                        }
                    } catch (e) {
                        showToast('重命名失败：' + e.message, 'error');
                    }
                    break;
                case 'download':
                    await downloadFile(contextMenuTarget);
                    break;
                case 'delete':
                    await deleteFile(contextMenuTarget);
                    break;
                case 'share':
                    showFileQR(contextMenuTarget);
                    break;
            }
        }
    } catch (e) {
        console.error('Context menu action error:', e);
        showToast('操作失败：' + e.message, 'error');
    }
}

document.addEventListener('click', function(event) {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu.style.display === 'block' && !contextMenu.contains(event.target)) {
        hideContextMenu();
    }
});

document.addEventListener('contextmenu', function(event) {
    if (!event.target.closest('.file-card') && !event.target.closest('.folder-card') && !event.target.closest('.folder-row') && !event.target.closest('tr[data-id]')) {
        hideContextMenu();
    }
});

window.addEventListener('load', init);
