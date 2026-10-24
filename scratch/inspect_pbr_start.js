const fs = require('fs');

const pbrServer = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
const content = fs.readFileSync(pbrServer, 'utf8');
console.log(content.split('\n').slice(0, 45).join('\n'));
