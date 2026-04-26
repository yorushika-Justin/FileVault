const path = require('path');

module.exports = {
    PORT: process.env.PORT || 8888,
    MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB
    DATA_DIR: path.join(__dirname, '..', 'data'),
    DATABASE_DIR: path.join(__dirname, '..', 'database')
};
