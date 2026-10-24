const fs = require('fs');

const pbrHtml = 'C:\\Users\\User\\Desktop\\PBR visualizer\\public\\index.html';
const content = fs.readFileSync(pbrHtml, 'utf8');

// Look for file pickers or buttons
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('pickFolder') || line.includes('pickFiles') || line.includes('type="file"') || line.includes('import') || line.includes('dropzone') || line.includes('fetchCatalog')) {
    console.log((i+1) + ': ' + line.trim().slice(0, 120));
  }
});
