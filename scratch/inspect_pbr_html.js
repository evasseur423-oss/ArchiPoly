const fs = require('fs');

const pbrHtml = 'C:\\Users\\User\\Desktop\\PBR visualizer\\public\\index.html';
if (fs.existsSync(pbrHtml)) {
  const content = fs.readFileSync(pbrHtml, 'utf8');
  console.log('PBR visualizer HTML lines:', content.split('\n').length);
  const matches = content.match(/\/api\/[a-zA-Z0-9_-]+/g);
  console.log('API calls in PBR visualizer index.html:', [...new Set(matches)]);
  
  // Also check how fetchCatalog works
  const fcMatch = content.match(/function fetchCatalog[\s\S]*?renderCatalog\(\);/);
  if (fcMatch) console.log('fetchCatalog snippet:', fcMatch[0].slice(0, 300));

  // Check upload
  const upMatch = content.match(/upload-material[\s\S]*?\}/);
  if (upMatch) console.log('upload match:', upMatch[0].slice(0, 300));
}
