const fs = require('fs');

const pbrServer = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
const content = fs.readFileSync(pbrServer, 'utf8');
console.log(content.split('\n').slice(35, 75).join('\n'));
