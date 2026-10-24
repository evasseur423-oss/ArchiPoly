/**
 * ArchPhysics Studio — Génération de la note de calcul (HTML autonome, imprimable en PDF).
 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fi = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '—');
const VERDICT = {
  ok: ['CONFORME', 'ok'],
  limite: ['LIMITE', 'warn'],
  rupture: ['RUPTURE / FLÈCHE EXCESSIVE', 'bad']
};
const SCHEME = {
  ss: 'Poutre sur 2 appuis simples',
  fix: 'Poutre bi-encastrée',
  cant: 'Console (porte-à-faux)',
  pin_pin: 'Poteau bi-articulé (k = 1,0)',
  fix_free: 'Poteau encastré-libre (k = 2,0)',
  fix_pin: 'Poteau encastré-articulé (k = 0,7)',
  fix_fix: 'Poteau bi-encastré (k = 0,5)',
  one_way: 'Plancher dalle — Portée 1 sens (appuis parallèles)',
  two_way: 'Plancher dalle — Portée 2 sens (Marcus / Pigeaud)',
  two_pinned: 'Mur porteur articulé tête et pied (β = 1,0)',
  fixed_base: 'Mur porteur encastré en pied (β = 0,85)',
  continuous: 'Mur porteur plancher continu (β = 0,75)',
  top_bottom: 'Cloison guidée en tête et fixée en pied',
  three_sides: 'Cloison fixée sur 3 côtés (sol, plafond, mur)',
  four_sides: 'Cloison bloquée sur les 4 rives',
  corbel_tie: 'Modèle Bielle & Tirant Eurocode 2 §6.5 (Strut-and-Tie)'
};

const CSS = `
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 "Segoe UI", Roboto, Arial, sans-serif; color: #151821; margin: 0; background: #eef0f4; }
  .page { max-width: 900px; margin: 0 auto; background: #fff; padding: 34px 44px 40px; }
  .toolbar { position: sticky; top: 0; z-index: 5; background: #14161b; color: #fff; padding: 10px 18px; display: flex; gap: 12px; align-items: center; }
  .toolbar button { background: #2e66e6; color: #fff; border: 0; padding: 8px 16px; border-radius: 7px; font-weight: 600; cursor: pointer; }
  .toolbar span { font-size: 12px; opacity: .7; }
  header.doc { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #2e66e6; padding-bottom: 12px; margin-bottom: 18px; }
  header.doc h1 { margin: 0; font-size: 24px; letter-spacing: -.01em; }
  header.doc h1 small { display: block; color: #f59e0b; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; }
  header.doc .meta { text-align: right; font-size: 11px; color: #4b5160; }
  h2 { font-size: 15px; margin: 26px 0 8px; padding: 5px 10px; background: #14161b; color: #fff; border-left: 5px solid #f59e0b; border-radius: 3px; page-break-after: avoid; }
  h3 { font-size: 13px; margin: 16px 0 5px; color: #1d4fd0; page-break-after: avoid; }
  h4 { font-size: 12px; margin: 10px 0 4px; }
  p { margin: 5px 0; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 11px; page-break-inside: avoid; }
  th { background: #eceff5; text-align: right; padding: 4px 7px; border: 1px solid #cfd4de; font-weight: 700; }
  td { padding: 3.5px 7px; border: 1px solid #dde1e9; text-align: right; font-family: "Cascadia Mono", Consolas, monospace; }
  th:first-child, td:first-child { text-align: left; font-family: inherit; }
  tr.total td { background: #f4f6fa; font-weight: 700; }
  .formula { font-family: "Cascadia Mono", Consolas, monospace; background: #f4f6fa; border-left: 3px solid #2e66e6; padding: 6px 12px; margin: 5px 0; font-size: 11.5px; page-break-inside: avoid; }
  .formula small { display: block; font-family: "Segoe UI", sans-serif; color: #5b6170; margin-top: 2px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
  .kpi { border: 1px solid #cfd4de; border-radius: 6px; padding: 7px 10px; background: #fafbfd; }
  .kpi b { display: block; font: 700 16px "Cascadia Mono", Consolas, monospace; }
  .kpi span { font-size: 10px; color: #5b6170; text-transform: uppercase; letter-spacing: .05em; }
  .kpi.hero { grid-column: span 2; background: #fff6e5; border-color: #f5c36b; }
  .kpi.hero b { font-size: 22px; color: #b45309; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-weight: 800; letter-spacing: .06em; font-size: 11px; border: 1.5px solid; }
  .badge.ok { color: #0f7a3f; background: #e4f7ec; border-color: #2fbf71; }
  .badge.warn { color: #b45309; background: #fff0dd; border-color: #ff8a1f; }
  .badge.bad { color: #b3261e; background: #fde8e6; border-color: #ef3b2d; }
  .block { border: 1px solid #cfd4de; border-radius: 8px; padding: 10px 14px 6px; margin: 12px 0; page-break-inside: avoid; }
  .block > h3 { margin-top: 0; display: flex; justify-content: space-between; align-items: center; }
  img.shot { width: 100%; border-radius: 6px; border: 1px solid #cfd4de; background: #0e0f11; }
  img.chart { width: 100%; border: 1px solid #dde1e9; border-radius: 4px; }
  .note { font-size: 10.5px; color: #5b6170; }
  footer.doc { margin-top: 28px; border-top: 1px solid #cfd4de; padding-top: 8px; font-size: 10px; color: #6b7080; display: flex; justify-content: space-between; }
  @media print {
    body { background: #fff; } .page { padding: 0; max-width: none; } .toolbar { display: none; }
    h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .badge, th, .formula, .kpi { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function layersTable(el) {
  const rows = el.wt.layers.map((l) =>
    `<tr><td>${esc(l.name)}</td><td>${f(l.eEff * 100, 1)}</td><td>${f(l.lambda, 4)}</td><td>${f(l.rho, 0)}</td><td>${f(l.cp, 0)}</td>` +
    `<td>${f(l.R, 4)}</td><td>${f(l.a * 1e7, 3)}</td><td>${f(l.delta * 100, 2)}</td><td>${f(l.phaseH, 2)}</td></tr>`).join('');
  return `<table>
    <thead><tr><th>Couche (intérieur → extérieur)</th><th>e (cm)</th><th>λ (W/m·K)</th><th>ρ (kg/m³)</th><th>c<sub>p</sub> (J/kg·K)</th><th>R<sub>i</sub> (m²K/W)</th><th>D (10⁻⁷ m²/s)</th><th>δ (cm)</th><th>φ<sub>i</sub> (h)</th></tr></thead>
    <tbody>
      <tr><td>Résistance superficielle intérieure R<sub>si</sub></td><td>—</td><td>—</td><td>—</td><td>—</td><td>${f(el.wt.rsi, 2)}</td><td>—</td><td>—</td><td>—</td></tr>
      ${rows}
      <tr><td>Résistance superficielle extérieure R<sub>se</sub></td><td>—</td><td>—</td><td>—</td><td>—</td><td>${f(el.wt.rse, 2)}</td><td>—</td><td>—</td><td>—</td></tr>
      <tr class="total"><td>Total</td><td>${f(el.wt.eTotal * 100, 1)}</td><td colspan="3"></td><td>${f(el.wt.R, 4)}</td><td colspan="2"></td><td>${f(el.wt.phaseH, 2)}</td></tr>
    </tbody></table>`;
}

function columnBlock(b) {
  const r = b.res, i = r.input;
  const [vl, vc] = VERDICT[r.verdict];
  const schemeLabels = {
    pin_pin: 'Poteau bi-articulé (k = 1,0)',
    fix_free: 'Poteau encastré-libre (k = 2,0)',
    fix_pin: 'Poteau encastré-articulé (k = 0,7)',
    fix_fix: 'Poteau bi-encastré (k = 0,5)'
  };
  return `<div class="block">
    <h3><span>${esc(b.name)} <small style="font-weight:400;color:#6b7080;">(Poteau structural)</small></span><span class="badge ${vc}">${vl}</span></h3>
    <div class="grid2">
      <div>
        <table>
          <thead><tr><th colspan="3">Données du poteau</th></tr></thead>
          <tbody>
            <tr><td>Liaisons d'extrémité</td><td colspan="2">${schemeLabels[i.scheme] || i.scheme}</td></tr>
            <tr><td>Hauteur libre H</td><td>${f(i.L, 3)}</td><td>m</td></tr>
            <tr><td>Section b × h</td><td>${f(i.b * 100, 1)} × ${f(i.h * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Matériau porteur</td><td colspan="2">${esc(b.mat.name)}</td></tr>
            <tr><td>E · σ<sub>adm</sub> · ρ</td><td colspan="2">${f(i.E, 1)} GPa · ${f(i.sigmaAdm, 1)} MPa · ${f(i.rho, 0)} kg/m³</td></tr>
            <tr><td>Poids propre Pp</td><td>${f(r.pp, 2)}</td><td>kN</td></tr>
            <tr><td>Effort axial N (${i.nature === 'G' ? 'permanent' : 'variable'})</td><td>${f(i.N, 1)}</td><td>kN</td></tr>
            <tr><td>Excentricité e<sub>0</sub></td><td>${f(r.e0 * 100, 1)}</td><td>cm</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Résultats de flambement</th><th>Valeur</th><th>Unité</th></tr></thead>
          <tbody>
            <tr><td>Inertie axe faible I<sub>min</sub></td><td>${f(r.IminCm4, 1)}</td><td>cm⁴</td></tr>
            <tr><td>Rayon de giration i<sub>min</sub></td><td>${f(r.iminCm, 2)}</td><td>cm</td></tr>
            <tr><td>Charge critique d'Euler N<sub>cr</sub></td><td class="total">${f(r.Ncr, 1)}</td><td>kN</td></tr>
            <tr><td>Longueur de flambement L<sub>cr</sub></td><td>${f(r.Lcr, 2)}</td><td>m</td></tr>
            <tr><td>Élancement géométrique λ</td><td>${f(r.lambda, 1)}</td><td>–</td></tr>
            <tr><td>Élancement réduit λ̄ (Eurocode)</td><td>${f(r.lambdaBar, 2)}</td><td>–</td></tr>
            <tr><td>Facteur de réduction χ</td><td>${f(r.chi, 3)}</td><td>–</td></tr>
            <tr class="total"><td>Résistance axiale N<sub>b,Rd</sub></td><td>${f(r.NbRd, 1)}</td><td>kN</td></tr>
            <tr><td>Effort sollicitant N<sub>Ed</sub> (ELU)</td><td>${f(r.Nelu, 1)}</td><td>kN</td></tr>
            <tr><td>Contrainte axiale σ<sub>N</sub></td><td>${f(r.sigmaN, 1)}</td><td>MPa</td></tr>
            <tr><td>Contrainte totale σ<sub>max</sub></td><td>${f(r.sigmaTotal, 1)}</td><td>MPa</td></tr>
            <tr class="total"><td>Taux de travail au flambement</td><td>${f(r.eta, 1)} %</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="note"><b>Conclusion :</b> ${esc(r.cause)}.</p>
    <img class="chart" src="${b.chart}" alt="Diagramme de flambement — ${esc(b.name)}">
  </div>`;
}

function beamBlock(b) {
  const r = b.res, i = r.input;
  const [vl, vc] = VERDICT[r.verdict];
  return `<div class="block">
    <h3><span>${esc(b.name)} <small style="font-weight:400;color:#6b7080;">(Poutre)</small></span><span class="badge ${vc}">${vl}</span></h3>
    <div class="grid2">
      <div>
        <table>
          <thead><tr><th colspan="3">Données</th></tr></thead>
          <tbody>
            <tr><td>Schéma statique</td><td colspan="2">${SCHEME[i.scheme]}</td></tr>
            <tr><td>Portée L</td><td>${f(i.L, 3)}</td><td>m</td></tr>
            <tr><td>Section b × h</td><td>${f(i.b * 100, 1)} × ${f(i.h * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Matériau</td><td colspan="2">${esc(b.mat.name)}</td></tr>
            <tr><td>E · σ<sub>adm</sub> · ρ</td><td colspan="2">${f(i.E, 1)} GPa · ${f(i.sigmaAdm, 1)} MPa · ${f(i.rho, 0)} kg/m³</td></tr>
            <tr><td>Poids propre g</td><td>${f(r.pp, 3)}</td><td>kN/m</td></tr>
            <tr><td>Charge répartie q (${i.nature === 'G' ? 'permanente' : 'exploitation'})</td><td>${f(i.q, 3)}</td><td>kN/m</td></tr>
            <tr><td>Charge ponctuelle F ${i.scheme === 'cant' ? '(extrémité)' : '(centre)'}</td><td>${f(i.F, 2)}</td><td>kN</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Résultat</th><th>ELS</th><th>ELU</th><th></th></tr></thead>
          <tbody>
            <tr><td>I<sub>z</sub> = b·h³/12</td><td colspan="2">${f(r.IzCm4, 1)}</td><td>cm⁴</td></tr>
            <tr><td>W = b·h²/6</td><td colspan="2">${f(r.WelCm3, 1)}</td><td>cm³</td></tr>
            <tr><td>M<sub>max</sub></td><td>${f(r.els.M, 2)}</td><td>${f(r.elu.M, 2)}</td><td>kN·m</td></tr>
            <tr><td>V<sub>max</sub></td><td>${f(r.els.V, 2)}</td><td>${f(r.elu.V, 2)}</td><td>kN</td></tr>
            <tr><td>σ<sub>max</sub></td><td>${f(r.sigmaEls, 2)}</td><td>${f(r.sigmaElu, 2)}</td><td>MPa</td></tr>
            <tr class="total"><td>Taux de travail σ/σ<sub>adm</sub></td><td colspan="2">${f(r.eta, 1)} %</td><td></td></tr>
            <tr class="total"><td>Flèche f<sub>max</sub></td><td colspan="2">${f(r.fMm, 2)}</td><td>mm</td></tr>
            <tr><td>L/f<sub>max</sub>${i.scheme === 'cant' ? ' (L<sub>ref</sub>=2L)' : ''}</td><td colspan="2">${Number.isFinite(r.ratio) ? 'L/' + fi(r.ratio) : '—'}</td><td></td></tr>
            <tr><td>Seuils L/300 · L/500</td><td colspan="2">${f(r.lim300, 2)} · ${f(r.lim500, 2)}</td><td>mm</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="note"><b>Conclusion :</b> ${esc(r.cause)}.</p>
    <img class="chart" src="${b.chart}" alt="Déformée et diagramme du moment — ${esc(b.name)}">
  </div>`;
}

function slabBlock(b) {
  const r = b.res, i = r.input;
  const [vl, vc] = VERDICT[r.verdict];
  return `<div class="block">
    <h3><span>${esc(b.name)} <small style="font-weight:400;color:#6b7080;">(Plancher dalle)</small></span><span class="badge ${vc}">${vl}</span></h3>
    <div class="grid2">
      <div>
        <table>
          <thead><tr><th colspan="3">Données du plancher</th></tr></thead>
          <tbody>
            <tr><td>Comportement mécanique</td><td colspan="2">${r.isOneWay ? 'Portée 1 sens (directionnelle)' : 'Portée 2 sens (bidirectionnelle)'}</td></tr>
            <tr><td>Portées L<sub>x</sub> × L<sub>y</sub></td><td>${f(r.Lx, 2)} × ${f(r.Ly, 2)}</td><td>m</td></tr>
            <tr><td>Épaisseur de dalle e</td><td>${f(i.h * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Matériau structural</td><td colspan="2">${esc(b.mat.name)}</td></tr>
            <tr><td>E · σ<sub>adm</sub> · ρ</td><td colspan="2">${f(i.E, 1)} GPa · ${f(i.sigmaAdm, 1)} MPa · ${f(i.rho, 0)} kg/m³</td></tr>
            <tr><td>Poids propre g<sub>0</sub></td><td>${f(r.pp, 2)}</td><td>kN/m²</td></tr>
            <tr><td>Charges finitions g<sub>perm</sub></td><td>${f(i.gPerm, 2)}</td><td>kN/m²</td></tr>
            <tr><td>Charge d'exploitation q</td><td>${f(i.q, 2)}</td><td>kN/m²</td></tr>
            <tr><td>Charge totale ELU q<sub>ELU</sub></td><td>${f(r.qElu, 2)}</td><td>kN/m²</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Résultats de dimensionnement</th><th>Valeur</th><th>Unité</th></tr></thead>
          <tbody>
            <tr><td>Moment fléchissant maximal M<sub>max</sub> (ELU)</td><td>${f(r.Mmax, 2)}</td><td>kN·m/m</td></tr>
            <tr><td>Effort tranchant maximal V<sub>max</sub> (ELU)</td><td>${f(r.Vmax, 2)}</td><td>kN/m</td></tr>
            <tr><td>Contrainte de flexion σ<sub>ELU</sub></td><td>${f(r.sigmaElu, 2)}</td><td>MPa</td></tr>
            <tr><td>Taux de contrainte σ / σ<sub>adm</sub></td><td>${f(r.etaStress, 1)} %</td><td></td></tr>
            <tr class="total"><td>Flèche maximale ELS f<sub>max</sub></td><td>${f(r.fMm, 2)}</td><td>mm</td></tr>
            <tr><td>Rapport L<sub>x</sub> / f<sub>max</sub></td><td>${Number.isFinite(r.Lx / (r.fMm / 1000)) ? 'L/' + fi(r.Lx / (r.fMm / 1000)) : '—'}</td><td></td></tr>
            <tr><td>Seuils admissibles L/500 · L/350</td><td>${f(r.lim500, 2)} · ${f(r.lim350, 2)}</td><td>mm</td></tr>
            <tr class="total"><td>Taux de travail global η</td><td>${f(r.eta, 1)} %</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="note"><b>Conclusion :</b> ${esc(r.cause)}.</p>
    <img class="chart" src="${b.chart}" alt="Diagramme de plancher dalle — ${esc(b.name)}">
  </div>`;
}

function bearingWallBlock(b) {
  const r = b.res, i = r.input;
  const [vl, vc] = VERDICT[r.verdict];
  return `<div class="block">
    <h3><span>${esc(b.name)} <small style="font-weight:400;color:#6b7080;">(Mur porteur)</small></span><span class="badge ${vc}">${vl}</span></h3>
    <div class="grid2">
      <div>
        <table>
          <thead><tr><th colspan="3">Données du mur porteur</th></tr></thead>
          <tbody>
            <tr><td>Conditions d'appui</td><td colspan="2">${SCHEME[i.scheme] || i.scheme || 'Articulé tête et pied'}</td></tr>
            <tr><td>Hauteur libre H</td><td>${f(r.H, 2)}</td><td>m</td></tr>
            <tr><td>Épaisseur brute t</td><td>${f(r.t * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Longueur du mur L</td><td>${f(r.L, 2)}</td><td>m</td></tr>
            <tr><td>Matériau porteur</td><td colspan="2">${esc(b.mat.name)}</td></tr>
            <tr><td>E · σ<sub>adm</sub> · ρ</td><td colspan="2">${f(i.E, 1)} GPa · ${f(i.sigmaAdm, 1)} MPa · ${f(i.rho, 0)} kg/m³</td></tr>
            <tr><td>Poids propre linéique n<sub>g</sub></td><td>${f(r.ppLin, 2)}</td><td>kN/m</td></tr>
            <tr><td>Charge linéique appliquée n (${i.nature === 'G' ? 'permanente' : 'exploitation'})</td><td>${f(i.n, 1)}</td><td>kN/m</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Vérification au flambement (Eurocode 2 / 6)</th><th>Valeur</th><th>Unité</th></tr></thead>
          <tbody>
            <tr><td>Charge linéique de calcul n<sub>Ed</sub> (ELU)</td><td>${f(r.nEd, 1)}</td><td>kN/m</td></tr>
            <tr><td>Rayon de giration i</td><td>${f(r.iminCm, 2)}</td><td>cm</td></tr>
            <tr><td>Élancement géométrique λ = H / i</td><td>${f(r.lambda, 1)}</td><td>–</td></tr>
            <tr><td>Excentricité de calcul e<sub>i</sub></td><td>${f(r.ei * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Facteur de réduction au flambement Φ</td><td>${f(r.phi, 3)}</td><td>–</td></tr>
            <tr class="total"><td>Capacité portante ultime n<sub>Rd</sub></td><td>${f(r.nRd, 1)}</td><td>kN/m</td></tr>
            <tr><td>Contrainte axiale moyenne σ<sub>moy</sub></td><td>${f(r.sigmaMoy, 2)}</td><td>MPa</td></tr>
            <tr class="total"><td>Taux d'utilisation n<sub>Ed</sub> / n<sub>Rd</sub></td><td>${f(r.eta, 1)} %</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="note"><b>Conclusion :</b> ${esc(r.cause)}.</p>
    <img class="chart" src="${b.chart}" alt="Élévation et flambement du mur — ${esc(b.name)}">
  </div>`;
}

function partitionBlock(b) {
  const r = b.res, i = r.input;
  const [vl, vc] = VERDICT[r.verdict];
  return `<div class="block">
    <h3><span>${esc(b.name)} <small style="font-weight:400;color:#6b7080;">(Cloison de distribution)</small></span><span class="badge ${vc}">${vl}</span></h3>
    <div class="grid2">
      <div>
        <table>
          <thead><tr><th colspan="3">Caractéristiques de la cloison</th></tr></thead>
          <tbody>
            <tr><td>Maintien transversal</td><td colspan="2">${SCHEME[i.scheme] || i.scheme || 'Guidée tête et pied'}</td></tr>
            <tr><td>Hauteur libre H</td><td>${f(r.H, 2)}</td><td>m</td></tr>
            <tr><td>Épaisseur de cloison t</td><td>${f(r.t * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Longueur de cloison L</td><td>${f(r.L, 2)}</td><td>m</td></tr>
            <tr><td>Matériau</td><td colspan="2">${esc(b.mat.name)}</td></tr>
            <tr><td>Masse surfacique</td><td>${f(r.weightSurf, 1)}</td><td>kg/m²</td></tr>
            <tr><td>Poids linéique reporté sur plancher</td><td>${f(r.weightLin, 2)}</td><td>kN/m</td></tr>
            <tr><td>Pression horizontale (NF DTU 25.41) q<sub>h</sub></td><td>${f(i.qh, 2)}</td><td>kN/m²</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Rigidité transversale et déformation</th><th>Valeur</th><th>Unité</th></tr></thead>
          <tbody>
            <tr><td>Moment sous poussée M<sub>h</sub></td><td>${f(r.Mh, 3)}</td><td>kN·m/m</td></tr>
            <tr><td>Contrainte transversale σ<sub>h</sub></td><td>${f(r.sigmaH, 2)}</td><td>MPa</td></tr>
            <tr class="total"><td>Flèche horizontale sous poussée f<sub>h</sub></td><td>${f(r.fhMm, 2)}</td><td>mm</td></tr>
            <tr><td>Flèche admissible ELS (H/200)</td><td>${f(r.lim200, 2)}</td><td>mm</td></tr>
            <tr><td>Rapport H / f<sub>h</sub></td><td>${Number.isFinite(r.H / (r.fhMm / 1000)) ? 'H/' + fi(r.H / (r.fhMm / 1000)) : '—'}</td><td></td></tr>
            <tr class="total"><td>Taux de flèche f<sub>h</sub> / (H/200)</td><td>${f(r.etaDefl, 1)} %</td><td></td></tr>
            <tr class="total"><td>Taux de travail critique η</td><td>${f(r.eta, 1)} %</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="note"><b>Conclusion :</b> ${esc(r.cause)}.</p>
    <img class="chart" src="${b.chart}" alt="Déformée transversale sous poussée DTU — ${esc(b.name)}">
  </div>`;
}

function corbelBlock(b) {
  const r = b.res, i = r.input;
  const [vl, vc] = VERDICT[r.verdict];
  return `<div class="block">
    <h3><span>${esc(b.name)} <small style="font-weight:400;color:#6b7080;">(Corbeau / Console courte)</small></span><span class="badge ${vc}">${vl}</span></h3>
    <div class="grid2">
      <div>
        <table>
          <thead><tr><th colspan="3">Géométrie et sollicitations (EC2 §6.5)</th></tr></thead>
          <tbody>
            <tr><td>Modèle de calcul</td><td colspan="2">Bielle &amp; Tirant (Strut-and-Tie)</td></tr>
            <tr><td>Portée de charge a<sub>c</sub></td><td>${f(i.L, 2)}</td><td>m</td></tr>
            <tr><td>Hauteur totale h<sub>c</sub> / utile d</td><td>${f(i.h * 100, 1)} / ${f(r.d * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Largeur d'appui b</td><td>${f(i.b * 100, 1)}</td><td>cm</td></tr>
            <tr><td>Rapport a<sub>c</sub> / d</td><td>${f(r.rac, 2)}</td><td>${r.rac <= 1.0 ? '(console courte)' : '(hors domaine bielle)'}</td></tr>
            <tr><td>Matériau</td><td colspan="2">${esc(b.mat.name)}</td></tr>
            <tr><td>Charge verticale appliquée F (${i.nature === 'G' ? 'permanente' : 'variable'})</td><td>${f(i.F, 1)}</td><td>kN</td></tr>
            <tr><td>Charge verticale de calcul F<sub>Ed</sub> (ELU)</td><td>${f(r.Fed, 1)}</td><td>kN</td></tr>
            <tr><td>Effort horizontal parasite H<sub>Ed</sub> = 0,2·F<sub>Ed</sub></td><td>${f(r.Hed, 1)}</td><td>kN</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Résultats Bielle &amp; Tirant (Strut-and-Tie)</th><th>Valeur</th><th>Unité</th></tr></thead>
          <tbody>
            <tr><td>Inclinaison de la bielle de béton θ</td><td>${f(r.thetaDeg, 1)}</td><td>°</td></tr>
            <tr><td>Traction dans le tirant T<sub>Ed</sub></td><td>${f(r.Ted, 1)}</td><td>kN</td></tr>
            <tr class="total"><td>Section d'aciers principaux A<sub>s,req</sub></td><td>${f(r.AsReq, 2)}</td><td>cm²</td></tr>
            <tr><td>Contrainte bielle de béton σ<sub>strut</sub></td><td>${f(r.sigmaStrut, 2)}</td><td>MPa</td></tr>
            <tr><td>Résistance admissible de calcul σ<sub>adm</sub></td><td>${f(i.sigmaAdm, 2)}</td><td>MPa</td></tr>
            <tr><td>Taux de travail de la bielle η<sub>strut</sub></td><td>${f(r.etaStrut, 1)} %</td><td></td></tr>
            <tr><td>Cisaillement moyen à l'encastrement τ</td><td>${f(r.tau, 2)}</td><td>MPa</td></tr>
            <tr><td>Cisaillement admissible τ<sub>adm</sub></td><td>${f(r.tauAdm, 2)}</td><td>MPa</td></tr>
            <tr class="total"><td>Taux d'utilisation critique η</td><td>${f(r.eta, 1)} %</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="note"><b>Conclusion :</b> ${esc(r.cause)}.</p>
    <img class="chart" src="${b.chart}" alt="Modèle Bielle et Tirant du corbeau — ${esc(b.name)}">
  </div>`;
}

function structBlock(b) {
  if (!b || !b.res) return '';
  switch (b.res.type) {
    case 'column': return columnBlock(b);
    case 'slab': return slabBlock(b);
    case 'bearingwall': return bearingWallBlock(b);
    case 'partition': return partitionBlock(b);
    case 'corbel': return corbelBlock(b);
    default: return beamBlock(b);
  }
}

export function buildReport(d) {
  const bal = d.balance;
  const date = d.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' — ' + d.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const modeLabel = bal.mode === 'chauffage' ? 'Puissance de chauffage' : bal.mode === 'refroidissement' ? 'Puissance de refroidissement' : 'Puissance';

  const matRows = d.materials.map((m) =>
    `<tr><td>${esc(m.name)}</td><td>${f(m.lambda, 4)}</td><td>${f(m.rho, 1)}</td><td>${f(m.cp, 0)}</td><td>${f(m.E, 4)}</td><td>${f(m.sigma, 2)}</td></tr>`).join('');

  const balRows = [...bal.rows].sort((a, b) => b.UA - a.UA).map((r) =>
    `<tr><td>${esc(r.name)}</td><td>${esc(r.role)}</td><td>${f(r.A, 2)}</td><td>${f(r.U, 3)}</td><td>${f(r.b, 2)}</td><td>${f(r.UA, 2)}</td><td>${f(r.share * 100, 1)}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Note de calcul — ${esc(d.project)}</title>
<style>${CSS}</style></head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button><span>Astuce : choisissez « Enregistrer au format PDF » comme imprimante.</span></div>
<div class="page">

<header class="doc">
  <h1><small>ArchPhysics Studio · Laboratoire d'ingénierie architecturale</small>Note de calcul — Thermique &amp; Structure</h1>
  <div class="meta"><b>${esc(d.project)}</b><br>${date}<br>ISO 6946 · ISO 13790 · EN 1990 · EN 1995 · EN 1993</div>
</header>

${d.snapshot ? `<img class="shot" src="${d.snapshot}" alt="Vue 3D de la maquette">` : ''}

<h2>1. Formules et hypothèses — Module thermique</h2>
<h3>1.1 Paroi multicouche (ISO 6946)</h3>
<div class="formula">R<sub>T</sub> = R<sub>si</sub> + Σ (e<sub>i</sub> / λ<sub>i</sub>) + R<sub>se</sub> &nbsp;&nbsp;[m²·K/W]<small>Vitrages : R<sub>couche</sub> = 1/U<sub>g</sub> − 0,17 (valeur certifiée du vitrage).</small></div>
<div class="formula">U = 1 / R<sub>T</sub> &nbsp;&nbsp;[W/m²·K]</div>
<table>
  <thead><tr><th>Position de la paroi (sens du flux)</th><th>R<sub>si</sub></th><th>R<sub>se</sub></th></tr></thead>
  <tbody>
    <tr><td>Mur extérieur / menuiserie (flux horizontal)</td><td>0,13</td><td>0,04</td></tr>
    <tr><td>Toiture (flux ascendant)</td><td>0,10</td><td>0,04</td></tr>
    <tr><td>Plancher bas (flux descendant)</td><td>0,17</td><td>0,04</td></tr>
  </tbody>
</table>
<h3>1.2 Comportement dynamique estival</h3>
<div class="formula">D = λ / (ρ · c<sub>p</sub>) &nbsp;[m²/s] &nbsp;— diffusivité thermique</div>
<div class="formula">δ = √(D · T / π) &nbsp;[m] &nbsp;— profondeur de pénétration de l'onde journalière (T = 86 400 s)<br>v = ω·δ, ω = 2π/T &nbsp;— vitesse de pénétration de la chaleur</div>
<div class="formula">φ = Σ (e<sub>i</sub> / v<sub>i</sub>) = Σ (T / 2π) · (e<sub>i</sub> / δ<sub>i</sub>) &nbsp;[h] &nbsp;— déphasage<br>A<sub>mortissement</sub> ≈ exp(− Σ e<sub>i</sub> / δ<sub>i</sub>)<small>Modèle simplifié additif par couche (l'ordre des couches et les réflexions d'interface ne sont pas pris en compte ; cf. ISO 13786 pour la méthode matricielle complète).</small></div>
<h3>1.3 Bilan thermique global (ISO 13790, régime permanent)</h3>
<div class="formula">H<sub>T</sub> = Σ (b<sub>tr,i</sub> · U<sub>i</sub> · A<sub>i</sub>) &nbsp;[W/K] &nbsp;— transmission</div>
<div class="formula">H<sub>V</sub> = 0,34 · V · n &nbsp;[W/K] &nbsp;— renouvellement d'air (0,34 = ρ<sub>air</sub>·c<sub>p,air</sub>/3600 en Wh/m³·K)</div>
<div class="formula">Φ = (H<sub>T</sub> + H<sub>V</sub>) · (T<sub>i</sub> − T<sub>e</sub>) &nbsp;[W] &nbsp;— Φ &gt; 0 : chauffage ; Φ &lt; 0 : refroidissement<small>Hors apports solaires, apports internes et ponts thermiques linéiques.</small></div>

<h2>2. Formules et hypothèses — Module RDM &amp; Éléments structuraux</h2>
<h3>2.1 Poutres en flexion (Euler-Bernoulli)</h3>
<div class="formula">I<sub>z</sub> = b·h³ / 12 &nbsp;;&nbsp; W = I<sub>z</sub> / (h/2) = b·h² / 6 &nbsp;;&nbsp; σ<sub>max</sub> = M<sub>max</sub> / W</div>
<div class="formula">Poids propre : g = ρ · g<sub>n</sub> · b · h &nbsp;; &nbsp;q = bande de chargement × charge surfacique × g<sub>n</sub></div>
<div class="formula">Combinaisons : ELU = 1,35·G + 1,5·Q (résistance) &nbsp;;&nbsp; ELS = G + Q (flèche maximale)</div>

<h3>2.2 Poteaux comprimés (Flambement axial Eurocodes)</h3>
<div class="formula">N<sub>cr</sub> = π² · E · I<sub>min</sub> / L<sub>cr</sub>² &nbsp;;&nbsp; λ = L<sub>cr</sub> / i<sub>min</sub> &nbsp;;&nbsp; λ̄ = √(A · f<sub>y</sub> / N<sub>cr</sub>)<br>Facteur d'imperfection α et réduction χ selon Eurocode 3 / 2 / 5 : N<sub>b,Rd</sub> = χ · A · σ<sub>adm</sub></div>

<h3>2.3 Planchers dalles (Flexion 1 et 2 sens)</h3>
<div class="formula">1 sens : M<sub>Ed,x</sub> = p<sub>Ed</sub> · L<sub>x</sub>² / 8 &nbsp;;&nbsp; V<sub>Ed</sub> = p<sub>Ed</sub> · L<sub>x</sub> / 2 &nbsp;;&nbsp; f<sub>ELS</sub> = 5 · p<sub>ser</sub> · L<sub>x</sub>⁴ / (384 · E · I)<br>2 sens (Marcus / Pigeaud, ratio r = L<sub>x</sub>/L<sub>y</sub> ≤ 1,0) : μ<sub>x</sub> = 1 / (8 · (1 + 2·r⁴)) &nbsp;;&nbsp; M<sub>Ed,x</sub> = μ<sub>x</sub> · p<sub>Ed</sub> · L<sub>x</sub>²</div>

<h3>2.4 Murs porteurs (Voiles comprimés Eurocode 2 / 6)</h3>
<div class="formula">Élancement : λ = H<sub>eff</sub> / i<sub>mur</sub> = β · H / (t / √12) &nbsp;;&nbsp; Excentricité : e<sub>i</sub> = max(e<sub>0</sub>, H<sub>eff</sub>/300, 20 mm)<br>Facteur de réduction au flambement : Φ = 1 − 2 · (e<sub>i</sub> / t) − 0,002 · λ² &nbsp;;&nbsp; Capacité ultime : n<sub>Rd</sub> = Φ · t · σ<sub>adm</sub></div>

<h3>2.5 Cloisons de distribution (NF DTU 25.41 &amp; Eurocode)</h3>
<div class="formula">Poids linéique reporté sur dalle : n<sub>g</sub> = ρ · g<sub>n</sub> · t · H &nbsp;[kN/m]<br>Poussée horizontale conventionnelle : q<sub>h</sub> = 0,40 kN/m² &nbsp;;&nbsp; Déformation transversale ELS : f<sub>h</sub> ≤ H / 200 (ou H / 400 pour cloisons fragiles)</div>

<h3>2.6 Corbeaux et consoles courtes (Modèle Bielle &amp; Tirant Eurocode 2 §6.5)</h3>
<div class="formula">Domaine console courte : a<sub>c</sub> / d ≤ 1,0 &nbsp;;&nbsp; Bras de levier : z<sub>0</sub> = d − 0,5·x &nbsp;;&nbsp; Angle de bielle : tan θ = z<sub>0</sub> / a<sub>c</sub><br>Traction tirant : T<sub>Ed</sub> = F<sub>Ed</sub> · cot θ + H<sub>Ed</sub> &nbsp;;&nbsp; Section d'aciers : A<sub>s,req</sub> = T<sub>Ed</sub> / f<sub>yd</sub><br>Contrainte de compression bielle béton : σ<sub>c</sub> = F<sub>Ed</sub> / (b · z<sub>0</sub> · cos²θ) ≤ ν' · f<sub>cd</sub></div>

<h2>3. Matériaux utilisés</h2>
<table>
  <thead><tr><th>Matériau</th><th>λ (W/m·K)</th><th>ρ (kg/m³)</th><th>c<sub>p</sub> (J/kg·K)</th><th>E (GPa)</th><th>σ<sub>adm</sub> (MPa)</th></tr></thead>
  <tbody>${matRows || '<tr><td colspan="6">—</td></tr>'}</tbody>
</table>

<h2>4. Compositions des parois d'enveloppe</h2>
${d.elements.length ? d.elements.map((el) => `
<div class="block">
  <h3><span>${esc(el.name)} <small style="color:#5b6170;font-weight:400">— ${esc(el.roleLabel)}</small></span>
      <span>U = ${f(el.wt.U, 3)} W/m²·K</span></h3>
  <p class="note">Dimensions : ${f(el.L, 2)} × ${f(el.W, 2)} × ${f(el.T, 2)} m — surface retenue A = ${f(el.A, 2)} m² — b<sub>tr</sub> = ${f(el.b, 2)}</p>
  ${layersTable(el)}
  <p><b>R<sub>T</sub></b> = ${f(el.wt.R, 3)} m²·K/W &nbsp;·&nbsp; <b>U</b> = 1/R<sub>T</sub> = ${f(el.wt.U, 3)} W/m²·K &nbsp;·&nbsp; <b>φ</b> = ${f(el.wt.phaseH, 1)} h &nbsp;·&nbsp; amortissement ≈ ${f(el.wt.attenuation, 3)} &nbsp;·&nbsp; v<sub>moy</sub> = ${f(el.wt.vCmH, 2)} cm/h</p>
</div>`).join('') : '<p class="note">Aucune paroi d\'enveloppe définie.</p>'}

<h2>5. Bilan énergétique du volume fermé</h2>
<table>
  <thead><tr><th>Donnée</th><th>Valeur</th><th>Unité</th></tr></thead>
  <tbody>
    <tr><td>Volume d'air intérieur V</td><td>${f(d.room.V, 2)}</td><td>m³</td></tr>
    <tr><td>Surface utile de référence S</td><td>${f(d.room.S, 2)}</td><td>m²</td></tr>
    <tr><td>Température extérieure T<sub>e</sub></td><td>${f(d.climate.Text, 1)}</td><td>°C</td></tr>
    <tr><td>Température intérieure de consigne T<sub>i</sub></td><td>${f(d.climate.Tint, 1)}</td><td>°C</td></tr>
    <tr><td>Taux de renouvellement d'air n (VMC)</td><td>${f(d.climate.n, 2)}</td><td>vol/h</td></tr>
    <tr><td>Degrés-jours unifiés (base 18 °C)</td><td>${fi(d.climate.DJU)}</td><td>°C·j/an</td></tr>
  </tbody>
</table>
<table>
  <thead><tr><th>Élément</th><th>Rôle</th><th>A (m²)</th><th>U (W/m²K)</th><th>b<sub>tr</sub></th><th>b·U·A (W/K)</th><th>Part (%)</th></tr></thead>
  <tbody>
    ${balRows}
    <tr class="total"><td colspan="5">H<sub>T</sub> = Σ b·U·A</td><td>${f(bal.HT, 2)}</td><td>${f(bal.shareHT * 100, 1)}</td></tr>
    <tr class="total"><td colspan="5">H<sub>V</sub> = 0,34 × ${f(d.room.V, 1)} × ${f(d.climate.n, 2)}</td><td>${f(bal.HV, 2)}</td><td>${f(bal.shareHV * 100, 1)}</td></tr>
    <tr class="total"><td colspan="5">H = H<sub>T</sub> + H<sub>V</sub></td><td>${f(bal.H, 2)}</td><td>100</td></tr>
  </tbody>
</table>
<div class="kpis">
  <div class="kpi hero"><span>${modeLabel} nécessaire — Φ = H·(T<sub>i</sub> − T<sub>e</sub>) = ${f(bal.H, 1)} × ${f(bal.dT, 1)}</span><b>${fi(bal.phiAbs)} W</b></div>
  <div class="kpi"><span>Puissance surfacique</span><b>${f(bal.wm2, 1)} W/m²</b></div>
  <div class="kpi"><span>Besoin annuel indicatif</span><b>${fi(bal.kwhYear)} kWh/an</b></div>
</div>
<p class="note">Besoin annuel indicatif = H × DJU × 24 / 1000. Régime permanent, hors apports solaires et internes.</p>

<h2>6. Vérification RDM des éléments structuraux</h2>
${d.beams.length ? d.beams.map(structBlock).join('') : '<p class="note">Aucun élément structural vérifié. Passez en mode « Structure / RDM » et sélectionnez les éléments porteurs.</p>'}

<footer class="doc"><span>ArchPhysics Studio — note générée automatiquement</span><span>Les résultats doivent être validés par un ingénieur qualifié avant toute utilisation réglementaire.</span></footer>
</div>
</body></html>`;
}
