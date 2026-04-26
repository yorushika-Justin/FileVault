# FileVault 重构设计方案

**日期**: 2026-04-26
**版本**: v1.0

## 概述

对 FileVault 进行大规模重构，从单体架构改为模块化架构，引入 SQLite 数据库，添加搜索、重命名等缺失功能，支持 Tailscale 跨网络访问。

## 技术栈

- **后端**: Node.js (保持)
- **数据库**: SQLite (better-sqlite3)
- **前端**: Vanilla JS (保持，模块化重构)
- **网络**: Tailscale (P2P 跨网络连接)

## 目标

1. 架构模块化 - 拆分为路由/服务/数据层
2. 性能优化 - 流式文件处理，大文件不占内存
3. 功能完善 - 搜索、重命名、文件详情、嵌套文件夹
4. 跨网络访问 - 通过 Tailscale 实现

---

## 目录结构

```
filevault/
├── src/
│   ├── server.js           # 入口文件
│   ├── routes/
│   │   ├── files.js        # 文件 API
│   │   ├── folders.js      # 文件夹 API
│   │   └── share.js       # 分享 API
│   ├── services/
│   │   ├── fileService.js  # 文件操作服务
│   │   ├── folderService.js # 文件夹操作服务
│   │   └── dbService.js    # SQLite 数据库服务
│   ├── middleware/
│   │   ├── security.js     # 安全中间件
│   │   └── cors.js         # CORS 配置
│   └── websocket.js        # WebSocket 服务
├── database/
│   └── filevault.db        # SQLite 数据库
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
└── server.js               # 启动脚本
```

---

## 数据库设计

### 表结构

```sql
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER,
    type TEXT,
    category TEXT,
    folder_id TEXT,
    upload_time INTEGER,
    time_category TEXT,
    created_at INTEGER
);

CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at INTEGER,
    file_count INTEGER DEFAULT 0
);

CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_files_name ON files(name);
CREATE INDEX idx_folders_parent ON folders(parent_id);
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 文件/文件夹唯一标识 |
| name | TEXT | 名称 |
| size | INTEGER | 文件大小(字节) |
| type | TEXT | MIME类型 |
| category | TEXT | 分类：image/document/video/audio/other |
| folder_id | TEXT | 所属文件夹ID，NULL表示根目录 |
| parent_id | TEXT | 父文件夹ID，NULL表示根目录 |
| upload_time | INTEGER | 上传时间戳 |
| time_category | TEXT | 时间分类：today/week/older |
| created_at | INTEGER | 创建时间戳 |
| file_count | INTEGER | 文件夹内文件数量 |

---

## API 设计

### 文件 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/files | 获取所有文件 |
| GET | /api/files/:id | 获取单个文件信息 |
| POST | /api/files | 创建文件元数据 |
| PUT | /api/files/:id | 更新文件（重命名） |
| DELETE | /api/files/:id | 删除文件 |
| POST | /api/upload/:id | 上传文件内容 |
| GET | /api/download/:id | 下载文件 |
| PUT | /api/files/:id/move | 移动文件到文件夹 |

### 文件夹 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/folders | 获取所有文件夹 |
| GET | /api/folders/:id | 获取文件夹信息 |
| POST | /api/folders | 创建文件夹 |
| PUT | /api/folders/:id | 更新文件夹（重命名） |
| DELETE | /api/folders/:id | 删除文件夹（递归删除内容） |
| GET | /api/folders/:id/info | 获取文件夹内容 |
| GET | /api/folders/:id/download | 获取文件夹下载信息 |

### 搜索 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/search?q=keyword | 搜索文件 |

---

## 后端模块

### dbService.js

职责：SQLite 数据库操作

```javascript
// 核心方法
initDatabase()           // 初始化数据库和表
getAllFiles()            // 获取所有文件
getFileById(id)         // 获取单个文件
searchFiles(keyword)    // 搜索文件
createFile(file)        // 创建文件记录
updateFile(id, data)    // 更新文件
deleteFile(id)          // 删除文件
getAllFolders()         // 获取所有文件夹
getFolderById(id)       // 获取单个文件夹
createFolder(folder)    // 创建文件夹
updateFolder(id, data) // 更新文件夹
deleteFolder(id)        // 删除文件夹（递归）
```

### fileService.js

职责：文件业务逻辑

```javascript
// 核心方法
handleUpload(req, res, fileId)  // 流式上传处理
handleDownload(req, res, fileId) // 文件下载
deleteFileWithData(fileId)       // 删除文件和存储
moveFile(fileId, folderId)       // 移动文件
```

### folderService.js

职责：文件夹业务逻辑

```javascript
// 核心方法
createFolderRecursive(name, parentId)  // 递归创建文件夹
deleteFolderRecursive(folderId)        // 递归删除
collectFolderContents(folderId, basePath) // 收集文件夹内容用于打包下载
getFolderPath(folderId)                 // 获取文件夹路径
```

### security.js

职责：安全中间件

```javascript
// 核心方法
validateFileId(fileId)    // 文件ID白名单验证（字母数字下划线连字符点）
sanitizePath(path)         // 路径安全检查
validateFolderId(folderId) // 文件夹ID验证
```

### websocket.js

职责：WebSocket 实时通信

```javascript
// 核心方法
initWSS(server)           // 初始化 WebSocket 服务器
broadcast(type, data)     // 广播消息给所有客户端
notifyFileUpdate(files)    // 通知文件更新
notifyFolderUpdate(folders)// 通知文件夹更新
```

---

## 前端模块

### app.js

职责：核心应用逻辑

```javascript
// 核心函数
init()                    // 初始化应用
fetchFiles()              // 获取文件列表
fetchFolders()            // 获取文件夹列表
renderFiles()             // 渲染文件列表
renderGridView()          // 网格视图
renderListView()          // 列表视图
enterFolder(folderId)     // 进入文件夹
exitFolder()              // 返回上级
deleteFile(fileId)        // 删除文件
deleteFolder(folderId)    // 删除文件夹
renameFile(fileId)        // 重命名文件
renameFolder(folderId)   // 重命名文件夹
downloadFile(fileId)      // 下载文件
downloadFolder(folderId)  // 下载文件夹
showContextMenu()         // 显示右键菜单
handleContextAction()    // 处理右键菜单操作
```

### search.js

职责：搜索功能

```javascript
// 核心函数
initSearch()              // 初始化搜索
performSearch(keyword)    // 执行搜索
renderSearchResults()     // 渲染搜索结果
highlightMatches()        // 高亮匹配文本
clearSearch()             // 清除搜索
```

### upload.js

职责：上传功能

```javascript
// 核心函数
initUpload()              // 初始化上传
handleFileSelect()        // 处理文件选择
handleFolderSelect()      // 处理文件夹选择
processFiles()            // 处理文件上传
uploadFile(file, folderId)// 单文件上传（流式）
showUploadProgress()       // 显示上传进度
cancelUpload()            // 取消上传
```

---

## 新增功能

### 1. 实时搜索

- 输入关键词实时搜索文件名
- 支持按类型筛选：图片/文档/视频/音频/其他
- 搜索结果高亮显示匹配部分
- 点击结果直接定位

### 2. 文件重命名

- 右键菜单选择"重命名"
- 或直接双击文件名进入编辑模式
- 输入新名称后按 Enter 保存
- 防止空名称和特殊字符

### 3. 文件详情

- 右键菜单选择"详情"
- 弹窗显示：文件名、大小、类型、上传时间、所在文件夹
- 图片可预览

### 4. 扩展分类

| 分类 | 扩展名 |
|------|--------|
| image | jpg, jpeg, png, gif, bmp, webp, svg |
| document | pdf, doc, docx, xls, xlsx, ppt, pptx, txt |
| video | mp4, avi, mkv, mov, wmv, flv |
| audio | mp3, wav, flac, aac, ogg, wma |
| other | 其他所有 |

### 5. 嵌套文件夹

- 支持创建多级文件夹
- 面包屑导航显示当前路径
- 点击面包屑任意层级快速跳转
- 文件夹树形结构展示

### 6. 流式上传

- 大文件分块上传，不占用大内存
- 显示真实上传进度百分比
- 支持拖拽上传
- 支持文件夹上传（保留目录结构）

---

## 安全措施

1. **文件 ID 验证** - 只允许字母、数字、下划线、连字符、点
2. **路径安全** - 确保文件路径不超出 data/ 目录
3. **CORS 配置** - 允许跨域访问
4. **输入转义** - HTML 特殊字符转义防 XSS
5. **文件大小限制** - 配置项 MAX_FILE_SIZE

---

## 部署

### Tailscale 网络配置

1. Windows 和安卓都安装 Tailscale
2. 使用同一账号登录
3. 设备自动出现在虚拟网络
4. 通过 Tailscale 分配的 IP 访问

### 启动

```bash
npm install
npm start
```

---

## 实施顺序

1. 初始化项目结构，创建 package.json
2. 实现 dbService.js (SQLite)
3. 实现 security.js (安全中间件)
4. 实现 fileService.js (文件服务)
5. 实现 folderService.js (文件夹服务)
6. 实现 routes/ (API 路由)
7. 实现 websocket.js (实时通信)
8. 实现 server.js (整合)
9. 前端模块化重构 (search.js, upload.js, app.js)
10. 测试和调优
