const fs = require('fs');
const path = require('path');

const targetServerJs = 'C:\\Users\\User\\Desktop\\PBR visualizer\\server.js';
if (!fs.existsSync(targetServerJs)) {
  console.error('Target server.js not found at:', targetServerJs);
  process.exit(1);
}

let content = fs.readFileSync(targetServerJs, 'utf8');

// 1. Replace materialsDir declaration
const oldDeclaration = "const materialsDir = path.join(publicDir, 'materials');";
const newDeclaration = `// Distribution des fichiers statiques depuis public/ et liaison directe avec Workspace_Materials (10 Go)
const archipolyMaterialsDir = path.resolve(__dirname, '..', 'ArchiPoly', 'Workspace_Materials');
const localMaterialsDir = path.join(publicDir, 'materials');
const materialsDir = fs.existsSync(archipolyMaterialsDir) ? archipolyMaterialsDir : localMaterialsDir;

console.log('[PBR Visualizer Server] Stockage des materiaux lie a: ' + materialsDir);

app.use('/materials', (req, res, next) => {
    express.static(materialsDir)(req, res, next);
});`;

if (content.includes(oldDeclaration)) {
  content = content.replace(oldDeclaration, newDeclaration);
  console.log('[1/2] Replaced materialsDir declaration');
}

// 2. Update /api/open-folder
const openFolderRegex = /app\.get\('\/api\/open-folder',\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*?res\.json\(\{\s*success:\s*true,\s*path:\s*targetDir\s*\}\);\s*\}\s*catch/;

const replacementOpen = `app.get('/api/open-folder', (req, res) => {
    try {
        const { category, folder } = req.query;
        let targetDir = materialsDir;

        if (category && folder) {
            targetDir = path.resolve(materialsDir, category, folder);
        } else if (category) {
            targetDir = path.resolve(materialsDir, category);
        }

        if (!fs.existsSync(targetDir)) {
            targetDir = materialsDir;
        }

        const windowsPath = targetDir.replace(/\\//g, '\\\\');
        console.log('[PBR Visualizer Explorer Reveal]: ' + windowsPath);

        if (process.platform === 'win32') {
            exec('explorer.exe "' + windowsPath + '"', (err) => {
                if (err) console.error('Erreur explorer.exe:', err);
            });
        } else {
            const cmd = process.platform === 'darwin' ? 'open "' + targetDir + '"' : 'xdg-open "' + targetDir + '"';
            exec(cmd);
        }

        res.json({ success: true, path: targetDir });
    } catch`;

if (openFolderRegex.test(content)) {
  content = content.replace(openFolderRegex, replacementOpen);
  console.log('[2/2] Replaced /api/open-folder endpoint');
}

// 3. Add normalizeCategory if not present
if (!content.includes('function normalizeCategory')) {
  const normCatCode = `
/**
 * Normalizes user or localized category inputs to standard PBR categories
 */
function normalizeCategory(rawCat) {
  if (!rawCat || typeof rawCat !== 'string') return 'Others';
  const trimmed = rawCat.trim();
  const lower = trimmed.toLowerCase();

  const map = {
    'beton': 'Concrete',
    'béton': 'Concrete',
    'concrete': 'Concrete',
    'bois': 'Wood',
    'wood': 'Wood',
    'pierre': 'Stone',
    'pierres': 'Stone',
    'marbre': 'Stone',
    'stone': 'Stone',
    'brique': 'Brick',
    'briques': 'Brick',
    'brick': 'Brick',
    'ceramique': 'Ceramic',
    'céramique': 'Ceramic',
    'carrelage': 'Ceramic',
    'ceramic': 'Ceramic',
    'tissu': 'Fabric',
    'tissus': 'Fabric',
    'fabric': 'Fabric',
    'cuir': 'Leather',
    'leather': 'Leather',
    'metal': 'Metal',
    'métal': 'Metal',
    'nature': 'Nature',
    'vegetation': 'Nature',
    'végétation': 'Nature',
    'peinture': 'Paint',
    'paint': 'Paint',
    'platre': 'Plaster',
    'plâtre': 'Plaster',
    'plaster': 'Plaster',
    'plastique': 'Plastic',
    'plastic': 'Plastic',
    'autre': 'Others',
    'autres': 'Others',
    'others': 'Others',
    'general': 'Others',
    'divers': 'Others'
  };

  if (map[lower]) return map[lower];

  const stdList = ['Brick', 'Ceramic', 'Concrete', 'Fabric', 'Leather', 'Metal', 'Nature', 'Others', 'Paint', 'Plaster', 'Plastic', 'Stone', 'Wood'];
  for (const std of stdList) {
    if (lower === std.toLowerCase() || lower.startsWith(std.toLowerCase())) {
      return std;
    }
  }

  for (const [key, std] of Object.entries(map)) {
    if (lower.startsWith(key)) {
      return std;
    }
  }

  const clean = trimmed.replace(/[^a-zA-Z0-9_\\-\\s]/g, '').trim();
  return clean || 'Others';
}
`;
  content = content.replace('function sanitizeName', normCatCode + '\nfunction sanitizeName');
  content = content.replace(
    /let category = \(req\.body\.category \|\| 'Others'\)\.trim\(\);[\r\n\s]+category = category\.replace\(\/\[\^a-zA-Z0-9_\\-\\s\]\/g, ''\)\.trim\(\) \|\| 'Others';/,
    'let category = normalizeCategory(req.body.category);'
  );
  console.log('[3/3] Injected normalizeCategory into PBR visualizer server.js');
}

fs.writeFileSync(targetServerJs, content, 'utf8');
console.log('Successfully updated PBR visualizer server.js');

