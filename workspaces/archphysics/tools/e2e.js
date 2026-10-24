'use strict';
/**
 * Test de bout en bout (développement) : lance l'application dans Electron, enchaîne des actions
 * d'interface, capture des images et affiche les erreurs console.
 * Usage : electron tools/e2e.js <dossier-de-sortie>
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = process.argv[2] || path.join(__dirname, '_shots');
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1650, height: 980, show: true, x: 0, y: 0, backgroundColor: '#0e0f11',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  win.webContents.on('console-message', (_e, level, message, line, src) => {
    console.log(`[console:${level}] ${message} (${path.basename(src || '')}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[RENDER GONE]', d.reason));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => {
    await sleep(700);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, name + '.png'), img.toPNG());
    console.log('shot', name);
  };

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await sleep(1500);
  await shot('01-empty');

  const steps = (process.argv[3] || 'default').split(',');
  try {
    await js(`document.getElementById('btn-test-model').click()`);
    await sleep(1500);
    await shot('02-test-model-thermal');

    console.log('thermal panel:', await js(`JSON.stringify({U: document.getElementById('r-U').textContent, R: document.getElementById('r-R').textContent, phase: document.getElementById('r-phase').textContent, HT: document.getElementById('o-HT').textContent, HV: document.getElementById('o-HV').textContent, phi: document.getElementById('o-phi').textContent, wm2: document.getElementById('o-wm2').textContent, V: document.getElementById('room-V').value})`));

    await js(`document.getElementById('tb-heatmap').click()`);
    await shot('03-heatmap');

    await js(`document.getElementById('tb-roof').click()`);
    await js(`document.getElementById('mode-structure').click()`);
    await sleep(500);
    await shot('04-structure');
    console.log('rdm panel:', await js(`JSON.stringify({verdict: document.getElementById('verdict-badge').textContent, eta: document.getElementById('g-eta').textContent, f: document.getElementById('t-f').textContent, Iz: document.getElementById('t-Iz').textContent, Mu: document.getElementById('t-M-elu').textContent})`));

    // Sélection du linteau et d'une poutre via la liste
    await js(`[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('Poutre porteuse 1')).click()`);
    await sleep(500);
    await shot('05-beam1');
    console.log('beam1:', await js(`JSON.stringify({verdict: document.getElementById('verdict-badge').textContent, eta: document.getElementById('g-eta').textContent, f: document.getElementById('t-f').textContent})`));

    // Console + changement de schéma
    await js(`(()=>{const s=document.getElementById('beam-scheme'); s.value='cant'; s.dispatchEvent(new Event('change')); })()`);
    await sleep(400);
    console.log('cant:', await js(`JSON.stringify({verdict: document.getElementById('verdict-badge').textContent, f: document.getElementById('t-f').textContent})`));
    await shot('06-beam1-cantilever');

    // Rapport
    const len = await js(`(()=>{const h=window.__arch.buildReport(window.__arch.collectReportData()); return h.length})()`);
    console.log('report length', len);
    const html = await js(`window.__arch.buildReport(window.__arch.collectReportData())`);
    fs.writeFileSync(path.join(out, 'rapport.html'), html);
    const rep = new BrowserWindow({ width: 1000, height: 1300, show: true, webPreferences: { sandbox: true } });
    await rep.loadFile(path.join(out, 'rapport.html'));
    await sleep(800);
    fs.writeFileSync(path.join(out, '07-report.png'), (await rep.webContents.capturePage()).toPNG());
    const pdf = await rep.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    fs.writeFileSync(path.join(out, 'rapport.pdf'), pdf);
    console.log('pdf bytes', pdf.length);
    rep.destroy();

    // Matériaux
    await js(`document.getElementById('mode-thermal').click(); document.getElementById('btn-materials').click()`);
    await shot('08-materials');
  } catch (e) {
    console.log('E2E ERROR', e);
  }
  app.quit();
});
