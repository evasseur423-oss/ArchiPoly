const fs = require('fs');

const pbrServer = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
const content = fs.readFileSync(pbrServer, 'utf8');

const upIdx = content.indexOf("app.post('/api/upload-material'");
console.log(content.slice(upIdx, upIdx + 3000));
