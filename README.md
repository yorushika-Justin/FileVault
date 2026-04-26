# FileVault v5.0 - 多端文件同步系统

一个基于 Node.js 的局域网文件同步与分享系统，支持 Windows、安卓等设备。

## 功能特点

- 📁 **文件管理** - 上传、下载、删除、重命名
- 📂 **文件夹管理** - 支持嵌套文件夹、拖拽归类
- 🔍 **实时搜索** - 按文件名快速搜索
- 🔄 **实时同步** - WebSocket 推送更新
- 📱 **二维码分享** - 扫码即下载
- 🖼️ **图片预览** - 支持图片在线预览
- 📊 **分类筛选** - 按类型/时间筛选
- 📋 **多视图** - 网格/列表视图切换
- 🌐 **跨网络访问** - 支持 Tailscale 组网

## 快速开始

### 方式一：无黑窗口启动（推荐）

1. 双击 `启动FileVault无窗口.vbs`
2. 弹出提示表示启动成功

### 方式二：创建桌面快捷方式

1. 双击 `创建桌面快捷方式.vbs`
2. 以后双击桌面 `FileVault` 图标即可

### 方式三：命令行启动

```bash
npm start
```

然后浏览器打开 http://localhost:8888

## 访问地址

- 本机：`http://localhost:8888`
- 局域网：`http://<你的IP>:8888`
- Tailscale：`http://<Tailscale IP>:8888`

## 项目结构

```
filevault/
├── src/
│   ├── server.js           # 主服务器
│   ├── config.js           # 配置
│   ├── websocket.js       # WebSocket
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑
│   └── middleware/        # 中间件
├── public/                 # 前端页面
├── database/              # SQLite 数据库
├── data/                  # 文件存储
├── package.json
└── server.js             # 入口
```

## 技术栈

- **后端**：Node.js + sql.js (SQLite)
- **前端**：Vanilla JS (无框架)
- **实时通信**：WebSocket

## 关闭服务

打开任务管理器，结束 `node.exe` 进程。

## 许可证

MIT License
