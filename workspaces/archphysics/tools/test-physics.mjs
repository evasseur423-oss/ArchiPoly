// Auto-tests du moteur de calcul : node tools/test-physics.mjs
import { wallThermal, roomBalance, beamAnalysis } from '../js/physics.js';
import { DEFAULT_MATERIALS as M } from '../js/materials.js';

let fails = 0;
const near = (name, v, ref, tol) => {
  const ok = Math.abs(v - ref) <= tol * Math.max(1, Math.abs(ref));
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${v.toFixed(5)} (attendu ${ref})`);
};
const get = (id) => M[id];

// Paroi : 20 béton + 14 laine de bois + 2 enduit
const w = wallThermal('mur', [{ mat: 'beton', e: 20 }, { mat: 'laine_bois', e: 14 }, { mat: 'enduit', e: 2 }], get);
const Rexp = 0.13 + 0.2 / 2.3 + 0.14 / 0.038 + 0.02 / 0.87 + 0.04;
near('R mur', w.R, Rexp, 1e-9);
near('U mur', w.U, 1 / Rexp, 1e-9);
console.log('déphasage (h):', w.phaseH.toFixed(2), 'amortissement:', w.attenuation.toFixed(4), 'vitesse cm/h:', w.vCmH.toFixed(2));
const dbl = wallThermal('vitrage', [{ mat: 'vitrage_d', e: 2.4 }], get);
near('U double vitrage', dbl.U, 1.1, 1e-9);
const tri = wallThermal('vitrage', [{ mat: 'vitrage_t', e: 3.6 }], get);
near('U triple vitrage', tri.U, 0.7, 1e-9);

// Bilan
const b = roomBalance({ elements: [{ name: 'a', role: 'mur', A: 20, U: 0.25 }], V: 75, n: 0.5, Tint: 20, Text: -5, S: 30, DJU: 2500 });
near('HT', b.HT, 5, 1e-12); near('HV', b.HV, 0.34 * 75 * 0.5, 1e-12);
near('Phi', b.phi, (5 + 12.75) * 25, 1e-12);

// RDM : poutre sur 2 appuis simples acier, q=10 kN/m, L=5, b=0.1, h=0.2, rho=0
const base = { L: 5, b: 0.1, h: 0.2, E: 210, sigmaAdm: 235, rho: 0, scheme: 'ss', q: 10, F: 0, nature: 'G' };
let r = beamAnalysis(base);
near('Iz cm4', r.IzCm4, 6666.6667, 1e-6);
near('Mels ss', r.Mmax_els, 10 * 25 / 8, 1e-12);
near('fels ss', r.fMm, 5 * 10 * 625 / (384 * 210e6 * (0.1 * 0.008 / 12)) * 1000, 1e-9);
near('fels via curve (L/2)', r.deflection(2.5) * 1000, r.fMm, 1e-9);
near('M curve (L/2)', r.moment(2.5) / 1.35, r.Mmax_els, 1e-9);

for (const sc of ['ss', 'fix', 'cant']) {
  r = beamAnalysis({ ...base, scheme: sc, F: 7, q: 4 });
  const x = sc === 'cant' ? base.L : base.L / 2;
  near(`courbe flèche ${sc}`, r.deflection(x) * 1000, r.fMm, 1e-9);
  const xm = sc === 'ss' ? base.L / 2 : 0;
  near(`courbe moment ${sc}`, Math.abs(r.moment(xm)), r.Mmax, 1e-9);
}
// Vérif intégrale numérique de M'' = w : M(x) cohérent par différences finies (ss, bi-encastré)
for (const sc of ['ss', 'fix']) {
  r = beamAnalysis({ ...base, scheme: sc, F: 0, q: 6 });
  const h = 0.01, x = 1.7;
  const d2 = (r.moment(x + h) - 2 * r.moment(x) + r.moment(x - h)) / (h * h);
  near(`M'' = -w (${sc})`, d2, -r.wu, 1e-3);
}
console.log(fails ? `\n${fails} échec(s)` : '\nTous les tests passent');
process.exit(fails ? 1 : 0);
