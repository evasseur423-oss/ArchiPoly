const fs = require('fs');
const path = require('path');

const targetServerJs = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
let content = fs.readFileSync(targetServerJs, 'utf8');

// 1. Ensure /vendor/three is served offline
if (!content.includes('/vendor/three')) {
  const vendorMount = `
// Serve Three.js offline from ArchiPoly node_modules
const archipolyThree = path.resolve(__dirname, '..', 'ArchiPoly', 'node_modules', 'three');
if (fs.existsSync(archipolyThree)) {
    app.use('/vendor/three', express.static(archipolyThree));
}
`;
  content = content.replace("app.use(express.static(publicDir));", "app.use(express.static(publicDir));\n" + vendorMount);
  console.log('[PBR Server] Added /vendor/three static route');
}

// 2. Ensure materialsDir resolves Workspace_Materials with fallbacks
const matDirBlock = `// Distribution des fichiers statiques depuis public/ et liaison directe avec Workspace_Materials
const possibleMaterialsDirs = [
    path.resolve(__dirname, '..', 'ArchiPoly', 'Workspace_Materials'),
    path.join(__dirname, 'Workspace_Materials'),
    path.join(__dirname, 'public', 'materials')
];
let materialsDir = possibleMaterialsDirs.find(d => fs.existsSync(d) && fs.readdirSync(d).length > 0) || possibleMaterialsDirs[0];
if (!fs.existsSync(materialsDir)) {
    try { fs.mkdirSync(materialsDir, { recursive: true }); } catch (_) {}
}
console.log('[PBR Visualizer Server] Stockage des materiaux lie a: ' + materialsDir);`;

content = content.replace(/\/\/ Distribution des fichiers statiques depuis public\/ et liaison directe avec Workspace_Materials[\s\S]*?console\.log\('\[PBR Visualizer Server\] Stockage des materiaux lie a: ' \+ materialsDir\);/, matDirBlock);

// 3. Add /api/import-local-path and /api/import-local-files if not present
if (!content.includes('/api/import-local-path')) {
  const importEndpoints = `
/**
 * POST /api/import-local-path
 */
app.post('/api/import-local-path', (req, res) => {
  try {
    const { sourcePath, category = 'Others', materialName } = req.body || {};
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ success: false, error: 'Chemin de dossier source introuvable' });
    }

    const stat = fs.statSync(sourcePath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Le chemin source doit être un dossier' });
    }

    const cleanCat = normalizeCategory(category);
    const folderBase = path.basename(sourcePath);
    const finalMatName = materialName ? sanitizeName(materialName) : (sanitizeName(folderBase) || ('mat_' + Date.now()));
    const targetMatDir = path.join(materialsDir, cleanCat, finalMatName);

    if (!fs.existsSync(targetMatDir)) {
      fs.mkdirSync(targetMatDir, { recursive: true });
    }

    const files = fs.readdirSync(sourcePath);
    const processedFiles = [];
    const usedNames = new Set();

    for (const file of files) {
      const fullSrc = path.join(sourcePath, file);
      if (!fs.statSync(fullSrc).isFile()) continue;

      const ext = path.extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp', '.exr'].includes(ext)) continue;

      const pbrType = detectPbrSuffix(file);
      let targetName = pbrType ? \`\${finalMatName}_\${pbrType}\${ext}\` : \`\${finalMatName}_\${sanitizeName(path.parse(file).name)}\${ext}\`;

      if (usedNames.has(targetName)) {
        const parsed = path.parse(targetName);
        let counter = 1;
        while (usedNames.has(\`\${parsed.name}_\${counter}\${parsed.ext}\`)) {
          counter++;
        }
        targetName = \`\${parsed.name}_\${counter}\${parsed.ext}\`;
      }
      usedNames.add(targetName);

      fs.copyFileSync(fullSrc, path.join(targetMatDir, targetName));
      processedFiles.push({ original: file, normalized: targetName, type: pbrType || 'custom' });
    }

    return res.json({
      success: true,
      message: \`Dossier '\${finalMatName}' importé avec succès dans '\${cleanCat}' (\${processedFiles.length} texture\${processedFiles.length > 1 ? 's' : ''})\`,
      category: cleanCat,
      materialName: finalMatName,
      files: processedFiles
    });
  } catch (err) {
    console.error('[Import Local Path Error]:', err);
    return res.status(500).json({ success: false, error: 'Échec import dossier: ' + err.message });
  }
});

/**
 * POST /api/import-local-files
 */
app.post('/api/import-local-files', (req, res) => {
  try {
    const { filePaths, category = 'Others', materialName } = req.body || {};
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun fichier transmis' });
    }

    const cleanCat = normalizeCategory(category);
    let finalMatName = materialName ? sanitizeName(materialName) : '';

    if (!finalMatName) {
      const firstFile = filePaths[0];
      const firstName = path.parse(firstFile).name;
      const stripped = firstName
        .replace(/(?:[_\\-\\s]?(?:base[_\\-\\s]?color|albedo|diffuse|diff|color|normal|norm|roughness|rough|metallic|metalness|metal|height|displacement|disp|ambient[_\\-\\s]?occlusion|ao)(?:[_\\-\\s]?(?:gl|dx))?)/gi, '')
        .replace(/(?:[_\\-\\s]?(?:4k|2k|1k|8k|512|1024|2048|4096))/gi, '');
      finalMatName = sanitizeName(stripped) || sanitizeName(firstName) || ('mat_' + Date.now());
    }

    const targetMatDir = path.join(materialsDir, cleanCat, finalMatName);
    if (!fs.existsSync(targetMatDir)) {
      fs.mkdirSync(targetMatDir, { recursive: true });
    }

    const processedFiles = [];
    const usedNames = new Set();

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;

      const baseOriginal = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp', '.exr'].includes(ext)) continue;

      const pbrType = detectPbrSuffix(baseOriginal);
      let targetName = pbrType ? \`\${finalMatName}_\${pbrType}\${ext}\` : \`\${finalMatName}_\${sanitizeName(path.parse(baseOriginal).name)}\${ext}\`;

      if (usedNames.has(targetName)) {
        const parsed = path.parse(targetName);
        let counter = 1;
        while (usedNames.has(\`\${parsed.name}_\${counter}\${parsed.ext}\`)) {
          counter++;
        }
        targetName = \`\${parsed.name}_\${counter}\${parsed.ext}\`;
      }
      usedNames.add(targetName);

      fs.copyFileSync(filePath, path.join(targetMatDir, targetName));
      processedFiles.push({ original: baseOriginal, normalized: targetName, type: pbrType || 'custom' });
    }

    return res.json({
      success: true,
      message: \`Textures importées avec succès dans '\${cleanCat}/\${finalMatName}' (\${processedFiles.length} fichier\${processedFiles.length > 1 ? 's' : ''})\`,
      category: cleanCat,
      materialName: finalMatName,
      files: processedFiles
    });
  } catch (err) {
    console.error('[Import Local Files Error]:', err);
    return res.status(500).json({ success: false, error: 'Échec import textures: ' + err.message });
  }
});
`;
  content += '\n' + importEndpoints;
  console.log('[PBR Server] Added local import endpoints');
}

fs.writeFileSync(targetServerJs, content, 'utf8');
console.log('Successfully updated C:\\Users\\User\\Desktop\\PBR visualizer\\server.js');
