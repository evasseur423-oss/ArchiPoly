const fs = require('fs');

const pbrServer = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
const content = fs.readFileSync(pbrServer, 'utf8');

const matApiIdx = content.indexOf("app.get('/api/materials'");
if (matApiIdx !== -1) {
  console.log('=== PBR visualizer /api/materials ===');
  console.log(content.slice(matApiIdx, matApiIdx + 1500));
}

const upApiIdx = content.indexOf("app.post('/api/upload-material'");
if (upApiIdx !== -1) {
  console.log('=== PBR visualizer /api/upload-material ===');
  console.log(content.slice(upApiIdx, upApiIdx + 1500));
}
