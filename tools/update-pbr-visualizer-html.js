const fs = require('fs');

const targetIndexHtml = 'C:\\Users\\User\\Desktop\\PBR visualizer\\public\\index.html';
if (fs.existsSync(targetIndexHtml)) {
  let content = fs.readFileSync(targetIndexHtml, 'utf8');

  // Add CSS style if not already present
  if (!content.includes('.header-materials-btn')) {
    const cssToAdd = `
        .header-materials-btn {
            background: #1e212b;
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #e2e8f0;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 9px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
        }
        .header-materials-btn:hover {
            background: #2b3040;
            border-color: #3b82f6;
            color: #ffffff;
        }
    </style>`;
    content = content.replace('</style>', cssToAdd);
  }

  // Update button text to remove 10 Go
  content = content.replace(
    /<button id="btnHeaderOpenFolder"[\s\S]*?<\/button>/,
    '<button id="btnHeaderOpenFolder" class="header-materials-btn" title="Ouvrir le dossier des matériaux dans l\'explorateur Windows" onclick="fetch(\'/api/open-folder\').catch(e => console.error(e))">📁 Dossier</button>'
  );

  fs.writeFileSync(targetIndexHtml, content, 'utf8');
  console.log('Successfully updated PBR visualizer public/index.html with clean button');
}

