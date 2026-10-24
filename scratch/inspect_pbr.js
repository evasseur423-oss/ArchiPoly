const fs = require('fs');
const path = require('path');

const pbrServer = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
if (fs.existsSync(pbrServer)) {
  const content = fs.readFileSync(pbrServer, 'utf8');
  console.log('=== PBR Visualizer server.js info ===');
  console.log('Length:', content.length, 'Lines:', content.split('\n').length);
  const routes = content.match(/app\.(get|post|put|delete)\([^,]+/g);
  console.log('Routes:', routes);
  
  // Check materialsDir definition in PBR visualizer server.js
  const matMatch = content.match(/.*materialsDir.*/g);
  console.log('materialsDir matches:', matMatch);
} else {
  console.log('PBR visualizer server.js does not exist');
}
