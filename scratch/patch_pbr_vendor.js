const fs = require('fs');
const path = require('path');

const target = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');

  const oldPattern = /\/\/ Serve Three\.js offline from ArchiPoly node_modules[\s\S]*?if\s*\(fs\.existsSync\(archipolyThree\)\)\s*\{\s*app\.use\('\/vendor\/three',\s*express\.static\(archipolyThree\)\);\s*\}/;

  const newBlock = `// Serve Three.js offline from local node_modules/three
const possibleThree = [
    path.join(__dirname, 'node_modules', 'three'),
    path.resolve(__dirname, '..', 'ArchiPoly', 'node_modules', 'three')
];
const threePath = possibleThree.find(p => fs.existsSync(p) && fs.existsSync(path.join(p, 'build', 'three.module.js'))) || possibleThree.find(p => fs.existsSync(p)) || possibleThree[0];
console.log('[PBR Visualizer Server] Three.js offline vendor path: ' + threePath);

const staticThreeOpts = {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        }
    }
};
app.use('/vendor/three', express.static(threePath, staticThreeOpts));
app.use('/vendor/three', (req, res, next) => {
    const cleanPath = req.path.replace(/^\\//, '');
    const targetFile = path.join(threePath, cleanPath);
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
        if (targetFile.endsWith('.js') || targetFile.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        }
        return res.sendFile(targetFile);
    }
    next();
});`;

  if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newBlock);
  } else if (content.includes("app.use('/vendor/three'")) {
    content = content.replace(/app\.use\('\/vendor\/three'[\s\S]*?\);/, newBlock);
  } else {
    content = content.replace('app.use(express.static(publicDir));', newBlock + '\napp.use(express.static(publicDir));');
  }

  fs.writeFileSync(target, content, 'utf8');
  console.log('Successfully updated PBR visualizer server.js');
} else {
  console.log('PBR visualizer server.js not found');
}
