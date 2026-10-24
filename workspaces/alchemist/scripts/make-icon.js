const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  const svgPath = path.join(__dirname, '..', 'icon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0; padding:0; overflow:hidden; background:transparent;">
        ${svgContent}
      </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  // Wait for rendering
  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage();
  const pngBuffer = image.toPNG();
  const outPath = path.join(__dirname, '..', 'icon.png');
  fs.writeFileSync(outPath, pngBuffer);
  console.log('Successfully generated icon.png at ' + outPath + ' (' + pngBuffer.length + ' bytes)');
  app.quit();
});
