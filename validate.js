const fs = require('fs');

function checkFile(path) {
  const html = fs.readFileSync(path, 'utf-8');
  const matches = [...html.matchAll(/<script(?:\s+type="module")?>([\s\S]*?)<\/script>/gi)];
  console.log(`Checking ${path}: found ${matches.length} script tags`);
  matches.forEach((m, idx) => {
    const code = m[1];
    // remove imports
    const stripped = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '// import')
                         .replace(/import\s*\(['"][^'"]+['"]\)/g, 'Promise.resolve({})');
    try {
      new Function(stripped);
      console.log(`  Script #${idx + 1}: Syntax VALID`);
    } catch (e) {
      console.error(`  Script #${idx + 1}: SYNTAX ERROR: ${e.message}`);
    }
  });
}

checkFile('./workspaces/material-library/index.html');
checkFile('./workspaces/inspector/index.html');
checkFile('./workspaces/slicer/index.html');
checkFile('./workspaces/archphysics/index.html');
