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
        if (client.readyState === 1) {
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
