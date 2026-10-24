/**
 * ArchPhysics Studio — Tracés 2D (canevas) : déformée amplifiée + diagramme du moment fléchissant.
 */
import { colorForRatio, cssRgb } from './physics.js';

const PALETTES = {
  dark:  { bg: '#121316', grid: '#1f2025', text: '#9ea3b0', strong: '#e6e8ee', beam: '#cfd3dc', ghost: '#5b5f6b', support: '#7d8392', load: '#2e66e6', sag: '#f59e0b', hog: '#2e66e6' },
  light: { bg: '#ffffff', grid: '#eceef2', text: '#4b5160', strong: '#12141a', beam: '#2a2d36', ghost: '#a3a9b6', support: '#6b7280', load: '#1d4fd0', sag: '#d97706', hog: '#1d4fd0' }
};

const fmt = (v, d = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(d));

function arrowDown(ctx, x, y0, y1, color, w = 1.6) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1 - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x - 3.6, y1 - 7); ctx.lineTo(x + 3.6, y1 - 7); ctx.closePath(); ctx.fill();
}

function hatch(ctx, x, y0, y1, dir, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  ctx.lineWidth = 1;
  for (let y = y0; y < y1; y += 6) {
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + dir * 7, y); ctx.stroke();
  }
}

export function drawBeamDiagram(canvas, res, o = {}) {
  const pal = PALETTES[o.theme || 'dark'];
  const dpr = o.dpr || window.devicePixelRatio || 1;
  const W = o.width || canvas.clientWidth || 420;
  const H = o.height || canvas.clientHeight || 320;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';
  ctx.textBaseline = 'middle';

  if (!res || res.error) {
    ctx.fillStyle = pal.text; ctx.textAlign = 'center';
    ctx.fillText(res ? res.error : 'Sélectionnez un élément de structure', W / 2, H / 2);
    return;
  }

  if (res.type === 'column') {
    drawColumnDiagram(ctx, res, W, H, pal);
    return;
  }
  if (res.type === 'slab') {
    drawSlabDiagram(ctx, res, W, H, pal);
    return;
  }
  if (res.type === 'bearingwall') {
    drawWallDiagram(ctx, res, W, H, pal);
    return;
  }
  if (res.type === 'partition') {
    drawPartitionDiagram(ctx, res, W, H, pal);
    return;
  }
  if (res.type === 'corbel') {
    drawCorbelDiagram(ctx, res, W, H, pal);
    return;
  }

  const { L, scheme } = res.input;
  const mx = 34;
  const x0 = mx, x1 = W - mx, Lpx = x1 - x0;
  const topH = H * 0.56;
  const beamY = topH * 0.50;
  const col = cssRgb(colorForRatio(res.eta));

  // titres
  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('DÉFORMÉE AMPLIFIÉE (ELS)', 8, 11);

  // --- amplification
  const N = 90;
  const xs = Array.from({ length: N + 1 }, (_, i) => (i / N) * L);
  const ys = xs.map((x) => res.deflection(x));
  const fmax = Math.max(...ys.map(Math.abs), 1e-12);
  const pxPerM = Lpx / L;
  const target = Math.min(34, topH * 0.30);
  let amp = target / (fmax * pxPerM);
  amp = Math.max(1, Math.min(amp, 20000));
  const dispPx = (y) => y * pxPerM * amp;

  // --- charges
  const hasQ = (res.input.q + res.pp) > 0;
  if (hasQ) {
    const n = 13;
    ctx.fillStyle = pal.load;
    for (let i = 0; i <= n; i++) arrowDown(ctx, x0 + (i / n) * Lpx, beamY - 30, beamY - 4, pal.load, 1.2);
    ctx.strokeStyle = pal.load; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, beamY - 30); ctx.lineTo(x1, beamY - 30); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = pal.load;
    ctx.fillText(`g+q = ${fmt(res.ws)} kN/m`, (x0 + x1) / 2, beamY - 40);
  }
  if (res.input.F > 0) {
    const fx = scheme === 'cant' ? x1 : (x0 + x1) / 2;
    arrowDown(ctx, fx, beamY - 52, beamY - 4, pal.sag, 2.6);
    ctx.fillStyle = pal.sag; ctx.textAlign = scheme === 'cant' ? 'right' : 'center';
    ctx.fillText(`F = ${fmt(res.input.F)} kN`, scheme === 'cant' ? fx - 6 : fx + 0, beamY - 58);
  }

  // --- fibre neutre initiale
  ctx.setLineDash([5, 4]); ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, beamY); ctx.lineTo(x1, beamY); ctx.stroke(); ctx.setLineDash([]);

  // --- appuis
  ctx.fillStyle = pal.support; ctx.strokeStyle = pal.support;
  const sup = (x, type) => {
    if (type === 'pin') {
      ctx.beginPath(); ctx.moveTo(x, beamY); ctx.lineTo(x - 9, beamY + 15); ctx.lineTo(x + 9, beamY + 15); ctx.closePath(); ctx.fill();
    } else if (type === 'roller') {
      ctx.beginPath(); ctx.moveTo(x, beamY); ctx.lineTo(x - 9, beamY + 12); ctx.lineTo(x + 9, beamY + 12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 4, beamY + 15, 2.6, 0, 7); ctx.arc(x + 4, beamY + 15, 2.6, 0, 7); ctx.fill();
    }
  };
  if (scheme === 'ss') { sup(x0, 'pin'); sup(x1, 'roller'); }
  else if (scheme === 'fix') { hatch(ctx, x0, beamY - 22, beamY + 22, -1, pal.support); hatch(ctx, x1, beamY - 22, beamY + 22, 1, pal.support); }
  else { hatch(ctx, x0, beamY - 22, beamY + 22, -1, pal.support); }

  // --- déformée
  ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col;
  ctx.beginPath();
  xs.forEach((x, i) => { const X = x0 + (x / L) * Lpx, Y = beamY + dispPx(ys[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.stroke();

  // --- flèche max
  const iMax = ys.indexOf(Math.max(...ys));
  const fxp = x0 + (xs[iMax] / L) * Lpx, fyp = beamY + dispPx(ys[iMax]);
  ctx.setLineDash([3, 3]); ctx.strokeStyle = pal.strong; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(fxp, beamY); ctx.lineTo(fxp, fyp); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = pal.strong; ctx.textAlign = scheme === 'cant' ? 'right' : 'center';
  ctx.fillText(`f = ${fmt(res.fMm)} mm`, scheme === 'cant' ? fxp - 6 : fxp, Math.min(fyp + 14, topH - 4));
  ctx.textAlign = 'right'; ctx.fillStyle = pal.text;
  ctx.fillText(`×${Math.round(amp)}`, W - 8, 11);

  // --- séparation
  ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, topH + 4); ctx.lineTo(W, topH + 4); ctx.stroke();

  // --- diagramme des moments
  const baseY = topH + (H - topH) * 0.52;
  const mvals = xs.map((x) => res.moment(x));
  const mAbs = Math.max(...mvals.map(Math.abs), 1e-9);
  const mh = (H - topH) * 0.34;
  const my = (m) => baseY + (m / mAbs) * mh;       // M>0 (fibre inf. tendue) tracé vers le bas

  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('DIAGRAMME DU MOMENT M (ELU)', 8, topH + 17);

  // remplissage par signe
  for (let i = 0; i < N; i++) {
    const m0 = mvals[i], m1 = mvals[i + 1];
    ctx.fillStyle = (m0 + m1) / 2 >= 0 ? pal.sag + '55' : pal.hog + '55';
    const xa = x0 + (xs[i] / L) * Lpx, xb = x0 + (xs[i + 1] / L) * Lpx;
    ctx.beginPath(); ctx.moveTo(xa, baseY); ctx.lineTo(xa, my(m0)); ctx.lineTo(xb, my(m1)); ctx.lineTo(xb, baseY); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = pal.strong; ctx.lineWidth = 1.6; ctx.beginPath();
  xs.forEach((x, i) => { const X = x0 + (x / L) * Lpx; i ? ctx.lineTo(X, my(mvals[i])) : ctx.moveTo(X, my(mvals[i])); });
  ctx.stroke();
  ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, baseY); ctx.lineTo(x1, baseY); ctx.stroke();

  // étiquettes extrema
  const label = (i) => {
    const X = x0 + (xs[i] / L) * Lpx, m = mvals[i];
    ctx.fillStyle = pal.strong;
    ctx.textAlign = X < x0 + 60 ? 'left' : X > x1 - 60 ? 'right' : 'center';
    ctx.fillText(`${fmt(m)} kN·m`, X, m >= 0 ? Math.min(my(m) + 11, H - 14) : Math.max(my(m) - 10, topH + 28));
  };
  let iPos = mvals.indexOf(Math.max(...mvals)), iNeg = mvals.indexOf(Math.min(...mvals));
  if (mvals[iPos] > 0.02 * mAbs) label(iPos);
  if (mvals[iNeg] < -0.02 * mAbs) label(iNeg);

  // cote L
  ctx.strokeStyle = pal.ghost; ctx.fillStyle = pal.text; ctx.textAlign = 'center';
  const dy = H - 8;
  ctx.beginPath(); ctx.moveTo(x0, dy); ctx.lineTo(x1, dy); ctx.moveTo(x0, dy - 3); ctx.lineTo(x0, dy + 3); ctx.moveTo(x1, dy - 3); ctx.lineTo(x1, dy + 3); ctx.stroke();
  ctx.fillStyle = pal.bg; const tw = 70; ctx.fillRect((x0 + x1) / 2 - tw / 2, dy - 6, tw, 12);
  ctx.fillStyle = pal.text; ctx.fillText(`L = ${fmt(L)} m`, (x0 + x1) / 2, dy);
}

/**
 * Diagramme technique de flambement pour poteau vertical (Euler & Eurocode)
 */
function drawColumnDiagram(ctx, res, W, H, pal) {
  const { L, b, h, scheme, N } = res.input;
  const col = cssRgb(colorForRatio(res.eta));

  // En-tête
  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('FLAMBEMENT DU POTEAU (EULER · EUROCODE)', 10, 14);

  // Géométrie d'affichage
  const colX = Math.round(W * 0.30);
  const topY = 48;
  const botY = H - 42;
  const colH = botY - topY;

  // Ligne axiale d'origine (non déformée)
  ctx.setLineDash([4, 4]); ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(colX, topY); ctx.lineTo(colX, botY); ctx.stroke();
  ctx.setLineDash([]);

  // Appui inférieur (Base)
  if (scheme === 'fix_fix' || scheme === 'fix_free' || scheme === 'fix_pin') {
    // Encastrement au sol
    ctx.strokeStyle = pal.support; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(colX - 24, botY); ctx.lineTo(colX + 24, botY); ctx.stroke();
    hatch(ctx, colX - 22, botY, botY + 12, 1, pal.support);
    hatch(ctx, colX + 22, botY, botY + 12, -1, pal.support);
  } else {
    // Articulation
    ctx.fillStyle = pal.support;
    ctx.beginPath();
    ctx.moveTo(colX, botY);
    ctx.lineTo(colX - 11, botY + 16);
    ctx.lineTo(colX + 11, botY + 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.support; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(colX - 16, botY + 17); ctx.lineTo(colX + 16, botY + 17); ctx.stroke();
  }

  // Appui supérieur (Tête)
  if (scheme === 'fix_fix') {
    ctx.strokeStyle = pal.support; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(colX - 24, topY); ctx.lineTo(colX + 24, topY); ctx.stroke();
    hatch(ctx, colX - 22, topY - 12, topY, -1, pal.support);
    hatch(ctx, colX + 22, topY - 12, topY, 1, pal.support);
  } else if (scheme === 'pin_pin' || scheme === 'fix_pin') {
    ctx.fillStyle = pal.support;
    ctx.beginPath();
    ctx.moveTo(colX, topY);
    ctx.lineTo(colX - 10, topY - 14);
    ctx.lineTo(colX + 10, topY - 14);
    ctx.closePath();
    ctx.fill();
  } // fix_free = extrémité libre

  // Flèche d'effort axial N en tête
  const loadColor = res.eta > 100 ? pal.bad : pal.sag;
  arrowDown(ctx, colX, topY - 38, topY - 2, loadColor, 2.8);
  ctx.fillStyle = loadColor; ctx.textAlign = 'center';
  ctx.fillText(`N_Ed = ${fmt(res.Nelu)} kN`, colX, topY - 44);

  // Tracé de la déformée de flambement
  const Nsteps = 80;
  const maxAmpPx = Math.min(54, W * 0.16);
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col;
  ctx.beginPath();
  for (let i = 0; i <= Nsteps; i++) {
    const t = i / Nsteps; // 0 en tête, 1 en bas
    const z = (1 - t) * L;
    const yPx = topY + t * colH;
    // Amplitude modale normalisée
    const modalShape = Math.sin(Math.PI * t);
    const xPx = colX + modalShape * maxAmpPx;
    if (i === 0) ctx.moveTo(xPx, yPx);
    else ctx.lineTo(xPx, yPx);
  }
  ctx.stroke();

  // Flèche d'amplitude latérale au milieu
  const midY = topY + colH * 0.5;
  ctx.setLineDash([2, 2]); ctx.strokeStyle = pal.strong; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(colX, midY); ctx.lineTo(colX + maxAmpPx, midY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = pal.strong; ctx.textAlign = 'left';
  ctx.fillText(` e0 = ${(res.e0 * 100).toFixed(1)} cm`, colX + maxAmpPx + 4, midY);

  // Cote de hauteur H
  const dimX = colX - 44;
  ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(dimX, topY); ctx.lineTo(dimX, botY); ctx.moveTo(dimX - 4, topY); ctx.lineTo(dimX + 4, topY); ctx.moveTo(dimX - 4, botY); ctx.lineTo(dimX + 4, botY); ctx.stroke();
  ctx.save();
  ctx.translate(dimX - 8, topY + colH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = pal.text; ctx.textAlign = 'center';
  ctx.fillText(`H = ${fmt(L)} m`, 0, 0);
  ctx.restore();

  // Panneau technique latéral droit
  const cardX = Math.round(W * 0.54);
  const cardW = W - cardX - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(cardX, 36, cardW, H - 48);
  ctx.strokeStyle = pal.grid; ctx.strokeRect(cardX, 36, cardW, H - 48);

  ctx.fillStyle = pal.strong; ctx.textAlign = 'left';
  ctx.font = 'bold 11px var(--sans)';
  ctx.fillText('CRITÈRES EUROCODE', cardX + 10, 52);
  ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';

  const rows = [
    ['Charge critique N_cr', `${fmt(res.Ncr)} kN`],
    ['Capacité axiale N_b,Rd', `${fmt(res.NbRd)} kN`],
    ['Longueur libre L_cr', `${fmt(res.Lcr)} m (k=${res.kScheme})`],
    ['Élancement λ', `${fmt(res.lambda, 1)}`],
    ['Élancement réduit λ̄', `${fmt(res.lambdaBar, 2)}`],
    ['Réduction flamb. χ', `${fmt(res.chi, 3)}`],
    ['Contrainte σ_max', `${fmt(res.sigmaTotal, 1)} MPa`],
    ['Contrainte adm. σ_adm', `${fmt(res.input.sigmaAdm, 1)} MPa`],
    ['Taux global η', `${fmt(res.eta, 1)} %`]
  ];

  let rY = 74;
  rows.forEach(([label, val], idx) => {
    ctx.fillStyle = pal.text; ctx.textAlign = 'left';
    ctx.fillText(label, cardX + 10, rY);
    ctx.fillStyle = idx === rows.length - 1 ? col : pal.strong; ctx.textAlign = 'right';
    ctx.fillText(val, cardX + cardW - 10, rY);
    rY += 21;
  });

  // Section du poteau en bas
  ctx.fillStyle = pal.text; ctx.textAlign = 'left';
  ctx.fillText(`Section : ${(b * 100).toFixed(0)} × ${(h * 100).toFixed(0)} cm`, cardX + 10, H - 24);
}

export function drawSlabDiagram(ctx, res, W, H, pal) {
  const { Lx, Ly, ratio, isOneWay, input } = res;
  const col = cssRgb(colorForRatio(res.eta));
  const cardX = Math.round(W * 0.54);
  const cardW = W - cardX - 10;

  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('COUPE & DÉFORMÉE DE DALLE (ELS)', 8, 14);

  const slabY = H * 0.35;
  const mx = 24, slabW = cardX - mx * 2;
  const x0 = mx, x1 = mx + slabW;

  ctx.fillStyle = pal.support;
  ctx.beginPath(); ctx.moveTo(x0, slabY + 12); ctx.lineTo(x0 - 8, slabY + 26); ctx.lineTo(x0 + 8, slabY + 26); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x1, slabY + 12); ctx.lineTo(x1 - 8, slabY + 26); ctx.lineTo(x1 + 8, slabY + 26); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.strokeRect(x0, slabY - 8, slabW, 16);
  ctx.setLineDash([]);

  const nArrows = 7;
  for (let i = 0; i <= nArrows; i++) {
    const ax = x0 + (i / nArrows) * slabW;
    arrowDown(ctx, ax, slabY - 32, slabY - 10, pal.load, 1.3);
  }
  ctx.fillStyle = pal.load; ctx.textAlign = 'center';
  ctx.fillText(`q_ELS = ${fmt(res.qEls, 2)} kN/m²`, x0 + slabW / 2, slabY - 38);

  const maxAmp = Math.min(28, H * 0.12);
  ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const px = x0 + t * slabW;
    const py = slabY + Math.sin(Math.PI * t) * maxAmp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = col; ctx.textAlign = 'center';
  ctx.fillText(`f_max = ${fmt(res.fMm, 1)} mm`, x0 + slabW / 2, slabY + maxAmp + 16);

  ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1;
  const dimY = slabY + maxAmp + 34;
  ctx.beginPath(); ctx.moveTo(x0, dimY); ctx.lineTo(x1, dimY); ctx.moveTo(x0, dimY - 4); ctx.lineTo(x0, dimY + 4); ctx.moveTo(x1, dimY - 4); ctx.lineTo(x1, dimY + 4); ctx.stroke();
  ctx.fillStyle = pal.text; ctx.textAlign = 'center';
  ctx.fillText(`Portée Lx = ${fmt(Lx)} m (${isOneWay ? '1 sens' : '2 sens'})`, x0 + slabW / 2, dimY + 14);

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(cardX, 36, cardW, H - 48);
  ctx.strokeStyle = pal.grid; ctx.strokeRect(cardX, 36, cardW, H - 48);

  ctx.fillStyle = pal.strong; ctx.textAlign = 'left';
  ctx.font = 'bold 11px var(--sans)';
  ctx.fillText('CRITÈRES PLANCHER / DALLE', cardX + 10, 52);
  ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';

  const rows = [
    ['Dimensions', `${fmt(Lx)} × ${fmt(Ly)} m`],
    ['Épaisseur dalle e', `${(input.h * 100).toFixed(0)} cm`],
    ['Charge q_ELU', `${fmt(res.qElu, 2)} kN/m²`],
    ['Moment M_Ed,x', `${fmt(res.Mmax, 2)} kN·m/m`],
    ['Contrainte σ_max', `${fmt(res.sigmaElu, 1)} MPa`],
    ['Contrainte adm. σ_adm', `${fmt(input.sigmaAdm, 1)} MPa`],
    ['Flèche max ELS', `${fmt(res.fMm, 1)} mm`],
    ['Seuil max L/350', `${fmt(res.lim350, 1)} mm`],
    ['Taux global η', `${fmt(res.eta, 1)} %`]
  ];

  let rY = 74;
  rows.forEach(([label, val], idx) => {
    ctx.fillStyle = pal.text; ctx.textAlign = 'left';
    ctx.fillText(label, cardX + 10, rY);
    ctx.fillStyle = idx === rows.length - 1 ? col : pal.strong; ctx.textAlign = 'right';
    ctx.fillText(val, cardX + cardW - 10, rY);
    rY += 21;
  });
}

export function drawWallDiagram(ctx, res, W, H, pal) {
  const { H: wallH, t: wallT, input } = res;
  const col = cssRgb(colorForRatio(res.eta));
  const cardX = Math.round(W * 0.54);
  const cardW = W - cardX - 10;

  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('ÉLÉVATION MUR PORTEUR (FLAMBEMENT)', 8, 14);

  const colX = Math.round(cardX * 0.44);
  const topY = 56, botY = H - 38;
  const hPx = botY - topY;

  ctx.fillStyle = pal.support;
  ctx.fillRect(colX - 32, botY, 64, 8);
  hatch(ctx, colX - 30, botY + 8, botY + 16, 1, pal.support);
  hatch(ctx, colX + 30, botY + 8, botY + 16, -1, pal.support);

  const wPx = Math.max(14, wallT * 80);
  ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.strokeRect(colX - wPx / 2, topY, wPx, hPx);
  ctx.setLineDash([]);

  const nArr = 5;
  for (let i = 0; i < nArr; i++) {
    const ax = colX - wPx / 2 + (i / (nArr - 1)) * wPx;
    arrowDown(ctx, ax, topY - 26, topY - 2, pal.sag, 1.8);
  }
  ctx.fillStyle = pal.sag; ctx.textAlign = 'center';
  ctx.fillText(`n_Ed = ${fmt(res.nEd, 1)} kN/m`, colX, topY - 32);

  ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  const maxAmp = Math.min(22, wPx * 0.8);
  ctx.beginPath();
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const y = topY + t * hPx;
    const x = colX + Math.sin(Math.PI * t) * maxAmp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(cardX, 36, cardW, H - 48);
  ctx.strokeStyle = pal.grid; ctx.strokeRect(cardX, 36, cardW, H - 48);

  ctx.fillStyle = pal.strong; ctx.textAlign = 'left';
  ctx.font = 'bold 11px var(--sans)';
  ctx.fillText('CRITÈRES MUR PORTEUR (EC2/EC6)', cardX + 10, 52);
  ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';

  const rows = [
    ['Hauteur H / Épais. t', `${fmt(wallH)} m / ${(wallT * 100).toFixed(0)} cm`],
    ['Charge de calcul n_Ed', `${fmt(res.nEd, 1)} kN/m`],
    ['Résistance ultime n_Rd', `${fmt(res.nRd, 1)} kN/m`],
    ['Élancement voile λ', `${fmt(res.lambda, 1)}`],
    ['Excentricité totale ei', `${(res.ei * 100).toFixed(1)} cm`],
    ['Facteur réduction Φ', `${fmt(res.phi, 3)}`],
    ['Contrainte moyenne σ', `${fmt(res.sigmaMoy, 2)} MPa`],
    ['Contrainte adm. σ_adm', `${fmt(input.sigmaAdm, 1)} MPa`],
    ['Taux de compression η', `${fmt(res.eta, 1)} %`]
  ];

  let rY = 74;
  rows.forEach(([label, val], idx) => {
    ctx.fillStyle = pal.text; ctx.textAlign = 'left';
    ctx.fillText(label, cardX + 10, rY);
    ctx.fillStyle = idx === rows.length - 1 ? col : pal.strong; ctx.textAlign = 'right';
    ctx.fillText(val, cardX + cardW - 10, rY);
    rY += 21;
  });
}

export function drawPartitionDiagram(ctx, res, W, H, pal) {
  const { H: partH, t: partT, input } = res;
  const col = cssRgb(colorForRatio(res.eta));
  const cardX = Math.round(W * 0.54);
  const cardW = W - cardX - 10;

  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('RIGIDITÉ CLOISON (POUSSÉE DTU)', 8, 14);

  const colX = Math.round(cardX * 0.44);
  const topY = 48, botY = H - 34;
  const hPx = botY - topY;

  ctx.fillStyle = pal.support;
  ctx.fillRect(colX - 26, topY - 6, 52, 6);
  ctx.fillRect(colX - 26, botY, 52, 6);

  ctx.strokeStyle = pal.ghost; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.strokeRect(colX - 6, topY, 12, hPx);
  ctx.setLineDash([]);

  for (let i = 1; i <= 5; i++) {
    const py = topY + (i / 6) * hPx;
    ctx.strokeStyle = pal.sag; ctx.fillStyle = pal.sag; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(colX - 44, py); ctx.lineTo(colX - 8, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(colX - 8, py); ctx.lineTo(colX - 15, py - 3); ctx.lineTo(colX - 15, py + 3); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = pal.sag; ctx.textAlign = 'right';
  ctx.fillText(`qh = ${fmt(input.qh, 2)} kN/m²`, colX - 48, topY + hPx / 2);

  const maxAmp = Math.min(26, cardX * 0.2);
  ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const y = topY + t * hPx;
    const x = colX + Math.sin(Math.PI * t) * maxAmp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(cardX, 36, cardW, H - 48);
  ctx.strokeStyle = pal.grid; ctx.strokeRect(cardX, 36, cardW, H - 48);

  ctx.fillStyle = pal.strong; ctx.textAlign = 'left';
  ctx.font = 'bold 11px var(--sans)';
  ctx.fillText('CRITÈRES CLOISON (DTU 25.41)', cardX + 10, 52);
  ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';

  const rows = [
    ['Hauteur H', `${fmt(partH)} m`],
    ['Épaisseur cloison t', `${(partT * 100).toFixed(0)} cm`],
    ['Poids sur plancher', `${fmt(res.weightLin, 2)} kN/m`],
    ['Masse surfacique', `${fmt(res.weightSurf, 0)} kg/m²`],
    ['Poussée horizontale', `${fmt(input.qh, 2)} kN/m²`],
    ['Flèche transversale fh', `${fmt(res.fhMm, 1)} mm`],
    ['Limite DTU H/200', `${fmt(res.lim200, 1)} mm`],
    ['Contrainte flexion σh', `${fmt(res.sigmaH, 2)} MPa`],
    ['Taux de rigidité η', `${fmt(res.eta, 1)} %`]
  ];

  let rY = 74;
  rows.forEach(([label, val], idx) => {
    ctx.fillStyle = pal.text; ctx.textAlign = 'left';
    ctx.fillText(label, cardX + 10, rY);
    ctx.fillStyle = idx === rows.length - 1 ? col : pal.strong; ctx.textAlign = 'right';
    ctx.fillText(val, cardX + cardW - 10, rY);
    rY += 21;
  });
}

export function drawCorbelDiagram(ctx, res, W, H, pal) {
  const { ac, hc, thetaDeg, input } = res;
  const col = cssRgb(colorForRatio(res.eta));
  const cardX = Math.round(W * 0.54);
  const cardW = W - cardX - 10;

  ctx.textAlign = 'left'; ctx.fillStyle = pal.text;
  ctx.fillText('MODÈLE BIELLES & TIRANTS DU CORBEAU', 8, 14);

  const colX = Math.round(cardX * 0.32);
  const colTopY = 40, colBotY = H - 36;
  const corbTopY = 70;
  const corbW = Math.min(100, Math.max(50, ac * 240));
  const corbH = Math.min(120, Math.max(60, hc * 240));

  ctx.fillStyle = pal.support;
  ctx.fillRect(colX - 34, colTopY, 34, colBotY - colTopY);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.strokeStyle = pal.strong; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(colX, corbTopY);
  ctx.lineTo(colX + corbW, corbTopY);
  ctx.lineTo(colX + corbW, corbTopY + corbH * 0.45);
  ctx.lineTo(colX, corbTopY + corbH);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  const tieY = corbTopY + 12;
  const loadX = colX + corbW * 0.75;
  ctx.strokeStyle = '#2e66e6'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(colX, tieY); ctx.lineTo(loadX, tieY); ctx.stroke();
  ctx.fillStyle = '#2e66e6'; ctx.textAlign = 'center';
  ctx.fillText('Tirant T_Ed', (colX + loadX) / 2, tieY - 8);

  const nodeY = corbTopY + corbH - 12;
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(loadX, tieY); ctx.lineTo(colX, nodeY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'left';
  ctx.fillText(`Bielle θ=${thetaDeg.toFixed(0)}°`, (colX + loadX) / 2 + 6, (tieY + nodeY) / 2);

  arrowDown(ctx, loadX, tieY - 34, tieY - 2, pal.sag, 2.5);
  ctx.fillStyle = pal.sag; ctx.textAlign = 'center';
  ctx.fillText(`F_Ed = ${fmt(res.Fed, 0)} kN`, loadX, tieY - 38);

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(cardX, 36, cardW, H - 48);
  ctx.strokeStyle = pal.grid; ctx.strokeRect(cardX, 36, cardW, H - 48);

  ctx.fillStyle = pal.strong; ctx.textAlign = 'left';
  ctx.font = 'bold 11px var(--sans)';
  ctx.fillText('CRITÈRES CORBEAU (EC2 §6.5)', cardX + 10, 52);
  ctx.font = '10.5px "JetBrains Mono", Consolas, monospace';

  const rows = [
    ['Portée ac / Hauteur hc', `${(ac * 100).toFixed(0)} / ${(hc * 100).toFixed(0)} cm`],
    ['Rapport ac/d', `${fmt(res.rac, 2)} (${res.rac <= 1.0 ? 'console courte' : 'console standard'})`],
    ['Charge verticale F_Ed', `${fmt(res.Fed, 1)} kN`],
    ['Angle de bielle θ', `${fmt(res.thetaDeg, 1)}°`],
    ['Traction tirant T_Ed', `${fmt(res.Ted, 1)} kN`],
    ['Armature requise As', `${fmt(res.AsReq, 1)} cm²`],
    ['Contrainte bielle σ_c', `${fmt(res.sigmaStrut, 1)} MPa`],
    ['Cisaillement τ_Ed', `${fmt(res.tau, 2)} MPa`],
    ['Taux global corbeau η', `${fmt(res.eta, 1)} %`]
  ];

  let rY = 74;
  rows.forEach(([label, val], idx) => {
    ctx.fillStyle = pal.text; ctx.textAlign = 'left';
    ctx.fillText(label, cardX + 10, rY);
    ctx.fillStyle = idx === rows.length - 1 ? col : pal.strong; ctx.textAlign = 'right';
    ctx.fillText(val, cardX + cardW - 10, rY);
    rY += 21;
  });
}
