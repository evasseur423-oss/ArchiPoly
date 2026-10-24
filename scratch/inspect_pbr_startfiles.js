const fs = require('fs');

const bat = 'C:\\Users\\User\\Desktop\\PBR visualizer\\Lancer-Visualiseur.bat';
if (fs.existsSync(bat)) console.log('BAT content:\n', fs.readFileSync(bat, 'utf8'));

const main = 'C:\\Users\\User\\Desktop\\PBR visualizer\\main.js';
if (fs.existsSync(main)) console.log('MAIN content:\n', fs.readFileSync(main, 'utf8'));

const pkg = 'C:\\Users\\User\\Desktop\\PBR visualizer\\package.json';
if (fs.existsSync(pkg)) console.log('PKG content:\n', fs.readFileSync(pkg, 'utf8'));
