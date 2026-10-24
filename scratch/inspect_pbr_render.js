const fs = require('fs');

const pbrHtml = 'C:\\Users\\User\\Desktop\\PBR visualizer\\public\\index.html';
const content = fs.readFileSync(pbrHtml, 'utf8');

const fcIdx = content.indexOf('async function fetchCatalog');
if (fcIdx !== -1) {
  console.log(content.slice(fcIdx, fcIdx + 3000));
}
