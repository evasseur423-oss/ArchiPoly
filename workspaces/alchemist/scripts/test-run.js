const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  console.log('Testing PBR Alchemist Studio headless initialization...');
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  win.webContents.on('console-message', (event) => {
    console.log(`[Renderer Console] ${event.message || event}`);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`[Load Error] ${errorCode}: ${errorDescription}`);
    process.exit(1);
  });

  const indexPath = path.join(__dirname, '..', 'index.html');
  await win.loadFile(indexPath);

  console.log('index.html loaded successfully. Waiting 3 seconds for Three.js and pipeline calculations...');
  await new Promise(r => setTimeout(r, 3000));

  // Check if canvases were rendered
  const result = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.getElementById('inspectorCanvas');
      const threeContainer = document.getElementById('threeViewport');
      const hasThreeCanvas = threeContainer && threeContainer.querySelector('canvas') !== null;
      return {
        inspectorCanvasWidth: canvas ? canvas.width : 0,
        inspectorCanvasHeight: canvas ? canvas.height : 0,
        hasThreeCanvas: hasThreeCanvas
      };
    })()
  `);

  console.log('Verification result:', result);
  if (result.inspectorCanvasWidth > 0 && result.hasThreeCanvas) {
    console.log('✅ ALL TESTS PASSED! Inspector and Three.js viewports rendered successfully.');
    app.quit();
    process.exit(0);
  } else {
    console.error('❌ Verification failed:', result);
    process.exit(1);
  }
});
