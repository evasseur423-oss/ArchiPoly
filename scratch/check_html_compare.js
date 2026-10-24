const fs = require('fs');

const pbrHtmlPath = 'C:\\Users\\User\\Desktop\\PBR visualizer\\public\\index.html';
const wsHtmlPath = 'workspaces/material-library/index.html';

console.log('=== Checking PBR visualizer index.html ===');
const pbrContent = fs.readFileSync(pbrHtmlPath, 'utf8');
console.log('pbrContent length:', pbrContent.length);

console.log('=== Checking material-library index.html ===');
const wsContent = fs.readFileSync(wsHtmlPath, 'utf8');
console.log('wsContent length:', wsContent.length);

// Check differences or how catalog and upload are handled
console.log('PBR has vendor/three:', pbrContent.includes('/vendor/three'));
console.log('WS has vendor/three:', wsContent.includes('/vendor/three'));
