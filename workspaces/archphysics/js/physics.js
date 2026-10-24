/**
 * ArchPhysics Studio — Moteur de calcul (fonctions pures, sans dépendance DOM).
 *
 *  Module 1 : thermique   (ISO 6946, ISO 13790, diffusivité / déphasage)
 *  Module 2 : RDM         (Euler-Bernoulli, combinaisons Eurocodes EN 1990)
 */

export const G = 9.81;               // m/s²
export const DAY_S = 86400;          // période de l'onde thermique journalière (s)

/* ========================================================================== */
/*  MODULE 1 — THERMIQUE                                                       */
/* ========================================================================== */

/** Résistances superficielles (ISO 6946, tableau 7). */
export const ROLES = {
  none:     { id: 'none',     label: 'Non assigné',        rsi: 0.13, rse: 0.04, short: '—' },
  mur:      { id: 'mur',      label: 'Mur extérieur',      rsi: 0.13, rse: 0.04, short: 'MUR' },       // flux horizontal
  toit:     { id: 'toit',     label: 'Toiture',            rsi: 0.10, rse: 0.04, short: 'TOIT' },      // flux ascendant
  plancher: { id: 'plancher', label: 'Plancher bas',       rsi: 0.17, rse: 0.04, short: 'PLANCHER' },  // flux descendant
  vitrage:  { id: 'vitrage',  label: 'Menuiserie vitrée',  rsi: 0.13, rse: 0.04, short: 'VITRAGE' }
};

/** Résistance thermique d'une couche. Vitrage : déduite de U_g (R = 1/Ug − 0,17). */
export function layerResistance(mat, e_m) {
  if (!mat) return 0;
  if (mat.glaz) return Math.max(1 / mat.glaz.U - 0.17, 0.001);
  if (!(e_m > 0) || !(mat.lambda > 0)) return 0;
  return e_m / mat.lambda;
}

/**
 * Calcul d'une paroi multicouche.
 * @param {string} role   clé de ROLES
 * @param {Array<{mat:string,e:number}>} layers  e en cm — du côté intérieur vers l'extérieur
 * @param {(id:string)=>object} getMat
 */
export function wallThermal(role, layers, getMat) {
  const r = ROLES[role] || ROLES.none;
  const T = DAY_S;
  const omega = 2 * Math.PI / T;
  const out = { role, rsi: r.rsi, rse: r.rse, layers: [], R: 0, U: 0, phaseH: 0, attenuation: 1, vCmH: 0, eTotal: 0, valid: false };
  let Rsum = 0, phase = 0, sumEoverDelta = 0, eTot = 0;

  for (const l of layers) {
    const m = l && l.mat ? getMat(l.mat) : null;
    if (!m) continue;
    const e = Math.max(0, (Number(l.e) || 0) / 100);
    const eEff = m.glaz ? m.glaz.e : e;               // épaisseur utilisée pour la dynamique
    const R = layerResistance(m, e);
    const a = m.lambda / (m.rho * m.cp);              // diffusivité D = λ/(ρ·cp)   [m²/s]
    const delta = Math.sqrt(a * T / Math.PI);         // profondeur de pénétration  [m]
    const v = omega * delta;                          // vitesse de phase de l'onde [m/s]
    const ph = eEff / v / 3600;                       // déphasage de la couche     [h]
    out.layers.push({
      matId: m.id, name: m.name, e, eEff, lambda: m.lambda, rho: m.rho, cp: m.cp,
      R, a, delta, vCmH: v * 3600 * 100, phaseH: ph, glaz: !!m.glaz
    });
    Rsum += R; phase += ph; sumEoverDelta += eEff / delta; eTot += m.glaz ? eEff : e;
  }

  if (!out.layers.length) return out;
  out.R = out.rsi + Rsum + out.rse;
  out.U = 1 / out.R;
  out.Rlayers = Rsum;
  out.phaseH = phase;
  out.attenuation = Math.exp(-sumEoverDelta);
  out.eTotal = eTot;
  out.vCmH = phase > 0 ? (eTot / phase) * 100 : 0;
  out.valid = true;
  return out;
}

/** Appréciation qualitative du déphasage estival (usage courant : confort d'été). */
export function phaseRating(h) {
  if (h >= 12) return { label: 'Excellent', cls: 'ok' };
  if (h >= 10) return { label: 'Bon', cls: 'ok' };
  if (h >= 8)  return { label: 'Moyen', cls: 'warn' };
  return { label: 'Faible', cls: 'bad' };
}

/** Appréciation indicative de U selon le rôle (ordre de grandeur RE2020 / RT). */
export function uRating(role, U) {
  const limits = { mur: [0.20, 0.36, 0.60], toit: [0.15, 0.25, 0.40], plancher: [0.20, 0.30, 0.50], vitrage: [0.8, 1.4, 2.2], none: [0.2, 0.4, 0.8] };
  const l = limits[role] || limits.none;
  if (U <= l[0]) return { label: 'Excellente', cls: 'ok' };
  if (U <= l[1]) return { label: 'Bonne', cls: 'ok' };
  if (U <= l[2]) return { label: 'Moyenne', cls: 'warn' };
  return { label: 'Déperditive', cls: 'bad' };
}

/**
 * Bilan thermique global en régime permanent (ISO 13790, méthode statique).
 * elements : [{name, role, A (m²), U (W/m².K), b (coef. réduction)}]
 */
export function roomBalance({ elements, V, n, Tint, Text, S, DJU }) {
  const rows = elements.map((e) => {
    const b = Number.isFinite(e.b) ? e.b : 1;
    return { ...e, b, UA: b * e.U * e.A };
  });
  const HT = rows.reduce((s, r) => s + r.UA, 0);       // W/K
  const HV = 0.34 * V * n;                             // W/K  (0,34 = ρ_air·cp_air / 3600)
  const H = HT + HV;
  const dT = Tint - Text;
  const phi = H * dT;                                  // W (>0 chauffage, <0 refroidissement)
  const mode = Math.abs(dT) < 0.05 ? 'neutre' : dT > 0 ? 'chauffage' : 'refroidissement';
  const kwhYear = H * (DJU || 0) * 24 / 1000;
  rows.forEach((r) => { r.share = H > 0 ? r.UA / H : 0; });
  return {
    rows, HT, HV, H, dT, phi, mode,
    phiAbs: Math.abs(phi),
    wm2: S > 0 ? Math.abs(phi) / S : 0,
    shareHV: H > 0 ? HV / H : 0,
    shareHT: H > 0 ? HT / H : 0,
    kwhYear
  };
}

/* ========================================================================== */
/*  MODULE 2 — RDM                                                             */
/* ========================================================================== */

export const SCHEMES = {
  ss:   { id: 'ss',   label: 'Poutre sur 2 appuis simples' },
  fix:  { id: 'fix',  label: 'Poutre bi-encastrée' },
  cant: { id: 'cant', label: 'Console (porte-à-faux)' }
};

export const COLUMN_SCHEMES = {
  pin_pin:  { id: 'pin_pin',  label: 'Poteau bi-articulé (k = 1,0)',        k: 1.0 },
  fix_free: { id: 'fix_free', label: 'Poteau encastré-libre (k = 2,0)',    k: 2.0 },
  fix_pin:  { id: 'fix_pin',  label: 'Poteau encastré-articulé (k = 0,7)',  k: 0.7 },
  fix_fix:  { id: 'fix_fix',  label: 'Poteau bi-encastré (k = 0,5)',        k: 0.5 }
};

/** Coefficients partiels (EN 1990) */
export const GAMMA_G = 1.35;
export const GAMMA_Q = 1.50;

/**
 * Effets (M_max, V_max, f_max) d'un chargement w (kN/m) + F (kN) pour un schéma statique.
 * EI en kN.m² ; retourne M en kN.m, V en kN, f en m.
 */
function effects(scheme, L, EI, w, F) {
  switch (scheme) {
    case 'fix':
      return {
        M: w * L * L / 12 + F * L / 8,
        V: w * L / 2 + F / 2,
        f: w * L ** 4 / (384 * EI) + F * L ** 3 / (192 * EI)
      };
    case 'cant':
      return {
        M: w * L * L / 2 + F * L,
        V: w * L + F,
        f: w * L ** 4 / (8 * EI) + F * L ** 3 / (3 * EI)
      };
    case 'ss':
    default:
      return {
        M: w * L * L / 8 + F * L / 4,
        V: w * L / 2 + F / 2,
        f: 5 * w * L ** 4 / (384 * EI) + F * L ** 3 / (48 * EI)
      };
  }
}

/** Flèche y(x) (m, vers le bas > 0) en tout point — charges (w, F) */
function deflectionAt(scheme, L, EI, w, F, x) {
  if (scheme === 'ss') {
    const yw = w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * EI);
    const xs = Math.min(x, L - x);
    const yF = F * xs * (3 * L * L - 4 * xs * xs) / (48 * EI);
    return yw + yF;
  }
  if (scheme === 'fix') {
    const yw = w * x * x * (L - x) ** 2 / (24 * EI);
    const xs = Math.min(x, L - x);
    const yF = F * xs * xs * (3 * L - 4 * xs) / (48 * EI);
    return yw + yF;
  }
  // console encastrée en x = 0, charge F en extrémité libre
  const yw = w * x * x * (6 * L * L - 4 * L * x + x * x) / (24 * EI);
  const yF = F * x * x * (3 * L - x) / (6 * EI);
  return yw + yF;
}

/** Moment fléchissant M(x) (kN.m ; positif = fibre inférieure tendue) */
function momentAt(scheme, L, w, F, x) {
  if (scheme === 'ss') {
    const xs = Math.min(x, L - x);
    return w * x * (L - x) / 2 + F * xs / 2;
  }
  if (scheme === 'fix') {
    const xs = Math.min(x, L - x);
    return w * (6 * L * x - 6 * x * x - L * L) / 12 + F * (4 * xs - L) / 8;
  }
  const s = L - x;
  return -(w * s * s / 2 + F * s);
}

/**
 * Vérification complète d'une poutre.
 * @param p {L,b,h (m), E (GPa), sigmaAdm (MPa), rho (kg/m³), scheme, q (kN/m), F (kN), nature ('Q'|'G')}
 */
export function beamAnalysis(p) {
  const { L, b, h, E, sigmaAdm, rho, scheme } = p;
  const q = Number(p.q) || 0;
  const F = Number(p.F) || 0;
  const nature = p.nature === 'G' ? 'G' : 'Q';
  if (!(L > 0 && b > 0 && h > 0)) return { error: 'Dimensions invalides (L, b, h > 0 requis).' };
  if (!(E > 0) || !(sigmaAdm > 0)) return { error: 'Matériau non porteur (E ou σ_adm nul) : choisissez un matériau de structure.' };

  const Iz = b * h ** 3 / 12;                  // m⁴
  const Wel = b * h * h / 6;                   // m³  (I / v, v = h/2)
  const EI = E * 1e6 * Iz;                     // kN.m²  (E[GPa] → kN/m²)
  const pp = rho * G * b * h / 1000;           // kN/m (poids propre)

  // Combinaison ELS caractéristique : G + Q
  const ws = pp + q, Fs = F;
  // Combinaison ELU fondamentale : 1,35 G + 1,5 Q  (q et F sont de nature G ou Q)
  const gUser = nature === 'G' ? GAMMA_G : GAMMA_Q;
  const wu = GAMMA_G * pp + gUser * q, Fu = gUser * F;

  const els = effects(scheme, L, EI, ws, Fs);
  const elu = effects(scheme, L, EI, wu, Fu);

  const sigmaEls = els.M / Wel / 1000;         // MPa
  const sigmaElu = elu.M / Wel / 1000;
  const eta = sigmaElu / sigmaAdm * 100;       // taux de travail (%) — ELU vs σ_adm
  const etaEls = sigmaEls / sigmaAdm * 100;

  const fMm = els.f * 1000;
  const Lref = scheme === 'cant' ? 2 * L : L;  // EN 1990 : porte-à-faux → 2L
  const lim300 = Lref / 300 * 1000;
  const lim500 = Lref / 500 * 1000;
  const ratio = fMm > 0 ? Lref * 1000 / fMm : Infinity;

  let verdict, cause;
  if (eta > 100) { verdict = 'rupture'; cause = 'Contrainte de flexion supérieure à σ_adm'; }
  else if (fMm > lim300) { verdict = 'rupture'; cause = `Flèche supérieure à L/300 (${lim300.toFixed(1)} mm)`; }
  else if (eta > 90) { verdict = 'limite'; cause = 'Taux de travail supérieur à 90 %'; }
  else if (fMm > lim500) { verdict = 'limite'; cause = `Flèche comprise entre L/500 et L/300`; }
  else { verdict = 'ok'; cause = 'Contrainte et flèche conformes (≤ L/500)'; }

  return {
    input: { L, b, h, E, sigmaAdm, rho, scheme, q, F, nature },
    Iz, IzCm4: Iz * 1e8, Wel, WelCm3: Wel * 1e6, EI, pp, ws, Fs, wu, Fu,
    els, elu,
    Mmax_els: els.M, Vmax_els: els.V,
    Mmax: elu.M, Vmax: elu.V,
    sigmaEls, sigmaElu, eta, etaEls,
    fMm, Lref, lim300, lim500, ratio,
    verdict, cause,
    deflection: (x) => deflectionAt(scheme, L, EI, ws, Fs, x),   // ELS (m)
    moment: (x) => momentAt(scheme, L, wu, Fu, x)                 // ELU (kN.m)
  };
}

/**
 * Dimensionnement et vérification au flambement d'un poteau (poutre verticale soumise à la compression).
 * Eurocodes EN 1993-1-1 / EN 1995-1-1 / EN 1992-1-1 & Théorie du flambement élastique d'Euler.
 *
 * @param {object} p {L, b, h (m), E (GPa), sigmaAdm (MPa), rho (kg/m³), scheme, N (kN), e0 (m), M (kN·m), nature ('Q'|'G')}
 */
export function columnAnalysis(p) {
  const { L, b, h, E, sigmaAdm, rho } = p;
  const scheme = p.scheme || 'pin_pin';
  const N = Math.max(0, Number(p.N) || 0);            // Effort axial appliqué en tête (kN)
  const M = Math.max(0, Number(p.M) || 0);            // Moment en tête (kN·m)
  const nature = p.nature === 'G' ? 'G' : 'Q';

  if (!(L > 0 && b > 0 && h > 0)) return { error: 'Dimensions de poteau invalides (H, b, h > 0 requis).' };
  if (!(E > 0) || !(sigmaAdm > 0)) return { error: 'Matériau non porteur : choisissez un matériau de structure pour le poteau.' };

  const A = b * h;                                    // Section m²
  const Iy = b * h ** 3 / 12;                         // m⁴
  const Iz = h * b ** 3 / 12;                         // m⁴
  const Imin = Math.min(Iy, Iz);                      // Axe faible de flambement (m⁴)
  const Imax = Math.max(Iy, Iz);
  const imin = Math.sqrt(Imin / A);                   // Rayon de giration minimal (m)
  const Wmin = Imin / (Math.min(b, h) / 2);           // Module de résistance élastique axe faible (m³)
  const Wy = Iy / (h / 2);
  const Wz = Iz / (b / 2);

  // Poids propre du poteau
  const pp = rho * G * A * L / 1000;                  // kN total

  // Facteur de longueur de flambement selon les liaisons d'extrémité
  const kScheme = COLUMN_SCHEMES[scheme] ? COLUMN_SCHEMES[scheme].k : 1.0;
  const Lcr = kScheme * L;                            // Longueur de flambement libre (m)

  // Élancement géométrique λ = L_cr / i_min
  const lambda = Lcr / Math.max(imin, 1e-6);

  // Charge critique d'Euler N_cr = π²·E·I_min / L_cr² (kN)
  const EImin = E * 1e6 * Imin;                       // kN·m²
  const Ncr = (Math.PI ** 2 * EImin) / Math.max(Lcr ** 2, 1e-6);

  // Élancement de référence Eurocode λ1 = π · √(E / f_y)
  const lambda1 = Math.PI * Math.sqrt((E * 1000) / sigmaAdm);
  const lambdaBar = lambda / Math.max(lambda1, 1e-6); // Élancement réduit adimensionnel

  // Coefficient de réduction de flambement χ (Eurocode courbe standard b, α = 0.34)
  const alpha = 0.34;
  let chi = 1.0;
  if (lambdaBar > 0.2) {
    const phi = 0.5 * (1 + alpha * (lambdaBar - 0.2) + lambdaBar ** 2);
    const discr = Math.max(0, phi ** 2 - lambdaBar ** 2);
    chi = Math.min(1.0, 1 / (phi + Math.sqrt(discr)));
  }

  // Résistance axiale au flambement selon Eurocode (kN)
  const NbRd = chi * A * sigmaAdm * 1000;             // kN

  // Combinaisons
  const gUser = nature === 'G' ? GAMMA_G : GAMMA_Q;
  const Nels = N + pp;
  const Nelu = gUser * N + GAMMA_G * pp;

  // Excentricité accidentelle (EN 1992 / EN 1993 : e0 = max(L/400, 2 cm))
  const e0 = Number.isFinite(p.e0) && p.e0 >= 0 ? p.e0 : Math.max(L / 400, 0.02); // m
  const Melu = gUser * M + Nelu * e0;                 // kN·m

  // Contraintes en MPa
  const sigmaN = (Nelu / A) / 1000;                   // Contrainte normale axiale
  const sigmaM = (Melu / Wmin) / 1000;                // Contrainte due au moment d'excentricité
  const sigmaTotal = sigmaN + sigmaM;
  const sigmaEls = (Nels / A) / 1000;

  // Taux de travail
  const etaBuckling = (Nelu / Math.max(NbRd, 1e-6)) * 100; // Flambement axial
  const etaStress = (sigmaTotal / sigmaAdm) * 100;          // Contrainte combinée
  const eta = Math.max(etaBuckling, etaStress);

  // Déplacement / flèche latérale estimée sous flambement (amplification au centre)
  const wMid = Nelu < Ncr ? (e0 * Nelu / (Ncr - Nelu)) * 1000 : Infinity; // mm

  let verdict, cause;
  if (Nelu >= Ncr) {
    verdict = 'rupture';
    cause = `Instabilité par flambement critique d'Euler (N_Ed = ${Nelu.toFixed(1)} kN ≥ N_cr = ${Ncr.toFixed(1)} kN)`;
  } else if (eta > 100) {
    verdict = 'rupture';
    cause = etaBuckling > etaStress
      ? `Résistance au flambement dépassée (N_Ed > N_b,Rd = ${NbRd.toFixed(1)} kN)`
      : `Contrainte maximale (${sigmaTotal.toFixed(1)} MPa) supérieure à σ_adm`;
  } else if (eta > 90) {
    verdict = 'limite';
    cause = 'Taux de travail au flambement supérieur à 90 %';
  } else if (lambda > 150) {
    verdict = 'limite';
    cause = `Poteau excessivement élancé (λ = ${lambda.toFixed(0)} > 150 : sensibilité accrue aux imperfections)`;
  } else {
    verdict = 'ok';
    cause = `Flambement et compression vérifiés selon Eurocodes (N_Ed ≤ N_b,Rd, taux ${eta.toFixed(0)} %)`;
  }

  return {
    type: 'column',
    input: { L, b, h, E, sigmaAdm, rho, scheme, N, M, e0, nature },
    A, ACm2: A * 1e4,
    Imin, IminCm4: Imin * 1e8,
    Imax, ImaxCm4: Imax * 1e8,
    imin, iminCm: imin * 100,
    Wmin, WminCm3: Wmin * 1e6,
    kScheme, Lcr, lambda, lambda1, lambdaBar, alpha, chi,
    Ncr, NbRd, pp,
    Nels, Nelu, e0, Melu,
    sigmaN, sigmaM, sigmaTotal, sigmaEls,
    eta, etaBuckling, etaStress,
    wMid,
    verdict, cause,
    // Forme modale de flambement w(z) le long de la hauteur z [0..L]
    deflection: (z) => {
      if (Nelu >= Ncr) return 0.05 * Math.sin((Math.PI * z) / L);
      const amp = Math.min(Math.max((e0 * Nelu) / Math.max(Ncr - Nelu, 1), 0), 0.15);
      return amp * Math.sin((Math.PI * z) / L);
    }
  };
}

/**
 * Vérification d'un plancher / dalle sous flexion uni ou bidirectionnelle (Eurocode 2 / Eurocode 5).
 * @param {object} p {L (Lx en m), W (Ly en m), h (épaisseur e en m), E (GPa), sigmaAdm (MPa), rho (kg/m³), q (kN/m²), gPerm (kN/m²), boundary}
 */
export function slabAnalysis(p) {
  const L = Math.max(0.1, Number(p.L) || 4.0);
  const W = Math.max(0.1, Number(p.W) || 5.0);
  const e = Math.max(0.01, Number(p.h) || 0.20);
  const { E, sigmaAdm, rho } = p;
  const q = Math.max(0, Number(p.q) || 2.5);          // Charge d'exploitation (kN/m²)
  const gPerm = Math.max(0, Number(p.gPerm) || 1.2);  // Charges permanentes additionnelles (kN/m²)
  const boundary = p.boundary || 'four_sides';

  if (!(L > 0 && W > 0 && e > 0)) return { error: 'Dimensions de plancher invalides.' };
  if (!(E > 0) || !(sigmaAdm > 0)) return { error: 'Matériau non porteur : choisissez un matériau structural pour la dalle.' };

  const Lx = Math.min(L, W);
  const Ly = Math.max(L, W);
  const ratio = Lx / Ly;                              // Rapport de forme Lx / Ly (<= 1.0)
  const isOneWay = boundary === 'one_way' || ratio < 0.5;

  const pp = rho * G * e / 1000;                      // Poids propre en kN/m²
  const Gtot = pp + gPerm;
  const qEls = Gtot + q;                              // ELS (kN/m²)
  const qElu = GAMMA_G * Gtot + GAMMA_Q * q;          // ELU (kN/m²)

  const I1 = 1.0 * e ** 3 / 12;                       // Inertie pour 1 m de largeur (m⁴/m)
  const W1 = 1.0 * e ** 2 / 6;                        // Module élastique pour 1 m (m³/m)
  const EI = E * 1e6 * I1;                            // kN·m² par mètre

  // Coefficient de moment en travée dans le sens principal Lx (Marcus / Pigeaud)
  let muX = 0.125;                                    // 1/8 pour portée isostatique 1 sens
  if (!isOneWay && boundary === 'four_sides') {
    muX = 1 / (8 * (1 + ratio ** 4));                 // Répartition bidirectionnelle
  } else if (boundary === 'cantilever') {
    muX = 0.5;
  }

  const Mmax = muX * qElu * Lx ** 2;                  // Moment fléchissant max ELU (kN·m/m)
  const Mels = muX * qEls * Lx ** 2;                  // Moment fléchissant max ELS (kN·m/m)

  const sigmaElu = (Mmax / W1) / 1000;                // MPa
  const sigmaEls = (Mels / W1) / 1000;                // MPa
  const etaStress = (sigmaElu / sigmaAdm) * 100;

  // Flèche maximale ELS (mm)
  const deflFactor = isOneWay ? (5 / 384) : (5 / 384) * (ratio ** 4 / (1 + ratio ** 4));
  const fMm = (deflFactor * (qEls * Lx ** 4) / Math.max(EI, 1e-4)) * 1000;
  const lim350 = (Lx / 350) * 1000;
  const lim500 = (Lx / 500) * 1000;
  const etaDefl = (fMm / lim350) * 100;

  // Effort tranchant par mètre
  const Vmax = 0.5 * qElu * Lx;                       // kN/m
  const tau = (1.5 * Vmax / (1.0 * e)) / 1000;        // MPa

  const eta = Math.max(etaStress, etaDefl);
  let verdict, cause;
  if (etaStress > 100) {
    verdict = 'rupture'; cause = `Contrainte de flexion de dalle (${sigmaElu.toFixed(1)} MPa) supérieure à σ_adm`;
  } else if (fMm > lim350) {
    verdict = 'rupture'; cause = `Flèche du plancher (${fMm.toFixed(1)} mm) supérieure à L/350 (${lim350.toFixed(1)} mm)`;
  } else if (eta > 90) {
    verdict = 'limite'; cause = 'Taux de travail ou flèche supérieur à 90 %';
  } else if (fMm > lim500) {
    verdict = 'limite'; cause = 'Flèche comprise entre L/500 et L/350';
  } else {
    verdict = 'ok'; cause = `Plancher conforme aux critères de portance et flèche ELS (${fMm.toFixed(1)} mm ≤ L/500)`;
  }

  return {
    type: 'slab',
    input: { L, W, h: e, E, sigmaAdm, rho, q, gPerm, boundary },
    Lx, Ly, ratio, isOneWay,
    pp, Gtot, qEls, qElu,
    I1, I1Cm4: I1 * 1e8, W1, W1Cm3: W1 * 1e6,
    Mmax, Mels, Vmax,
    sigmaElu, sigmaEls, tau,
    fMm, lim350, lim500,
    eta, etaStress, etaDefl,
    verdict, cause,
    deflection: (x) => {
      const s = Math.sin((Math.PI * x) / Lx);
      return (fMm / 1000) * s;
    }
  };
}

/**
 * Vérification d'un mur porteur soumis à la compression verticale et au flambement (Eurocode 6 / Eurocode 2).
 * @param {object} p {L (longueur en m), h (hauteur H en m), b (épaisseur t en m), E (GPa), sigmaAdm (MPa), rho (kg/m³), n (charge linéique en kN/m), nature}
 */
export function bearingWallAnalysis(p) {
  const L = Math.max(0.1, Number(p.L) || 4.0);
  const H = Math.max(0.1, Number(p.h) || 2.8);
  const t = Math.max(0.02, Number(p.b) || 0.20);
  const { E, sigmaAdm, rho } = p;
  const n = Math.max(0, Number(p.n) || 120);           // Charge verticale linéique en tête (kN/m)
  const nature = p.nature === 'G' ? 'G' : 'Q';

  if (!(L > 0 && H > 0 && t > 0)) return { error: 'Dimensions de mur invalides.' };
  if (!(E > 0) || !(sigmaAdm > 0)) return { error: 'Matériau non porteur pour le mur porteur.' };

  const ppLin = rho * G * t * H / 1000;               // Poids propre linéique en pied (kN/m)
  const gUser = nature === 'G' ? GAMMA_G : GAMMA_Q;
  const nEls = n + ppLin;
  const nEd = gUser * n + GAMMA_G * ppLin;             // Charge de calcul ELU en pied (kN/m)

  const i = t / Math.sqrt(12);                        // Rayon de giration du voile (m)
  const lambda = H / Math.max(i, 1e-4);               // Élancement géométrique

  // Excentricité de calcul et réduction selon Eurocode 6 / Eurocode 2
  const ei = Math.max(H / 300, 0.02) + (H ** 2) / Math.max(2000 * t, 0.01);
  const phi = Math.max(0.08, Math.min(1.0, 1.14 * (1 - 2 * (ei / t)) - 0.024 * (H / t)));

  // Capacité portante résistante par mètre linéaire de mur (kN/m)
  const nRd = phi * t * sigmaAdm * 1000;              // kN/m
  const sigmaMoy = (nEd / (t * 1000));                // Contrainte moyenne axiale en pied (MPa)
  const eta = (nEd / Math.max(nRd, 1e-4)) * 100;

  let verdict, cause;
  if (nEd >= nRd) {
    verdict = 'rupture'; cause = `Capacité portante dépassée sous compression axiale (n_Ed = ${nEd.toFixed(1)} kN/m > n_Rd = ${nRd.toFixed(1)} kN/m)`;
  } else if (eta > 90) {
    verdict = 'limite'; cause = 'Taux de travail sous compression supérieur à 90 %';
  } else if (lambda > 120) {
    verdict = 'limite'; cause = `Voile élancé (λ = ${lambda.toFixed(0)} > 120 : sensibilité aux imperfections)`;
  } else {
    verdict = 'ok'; cause = `Mur porteur vérifié au flambement et à l'écrasement (taux ${eta.toFixed(0)} %)`;
  }

  return {
    type: 'bearingwall',
    input: { L, h: H, b: t, E, sigmaAdm, rho, n, nature },
    H, t, L, ppLin,
    nEls, nEd, nRd,
    i, iminCm: i * 100,
    lambda, ei, phi,
    sigmaMoy, sigmaAdm,
    eta,
    verdict, cause,
    deflection: (z) => {
      const amp = (ei * nEd) / Math.max(nRd * 1.5, 1);
      return amp * Math.sin((Math.PI * z) / H);
    }
  };
}

/**
 * Vérification d'une cloison intérieure (non porteuse, stabilité sous poussée horizontale & DTU).
 * @param {object} p {L (longueur en m), h (hauteur H en m), b (épaisseur t en m), E (GPa), sigmaAdm (MPa), rho (kg/m³), qh (kN/m²)}
 */
export function partitionAnalysis(p) {
  const L = Math.max(0.1, Number(p.L) || 3.5);
  const H = Math.max(0.1, Number(p.h) || 2.6);
  const t = Math.max(0.01, Number(p.b) || 0.08);
  const { E, sigmaAdm, rho } = p;
  const qh = Math.max(0.05, Number(p.qh) || 0.40);     // Pression horizontale d'usage DTU (kN/m²)

  if (!(L > 0 && H > 0 && t > 0)) return { error: 'Dimensions de cloison invalides.' };
  if (!(E > 0) || !(sigmaAdm > 0)) return { error: 'Matériau de cloison invalide.' };

  const weightLin = rho * G * t * H / 1000;            // Poids linéaire sur le plancher (kN/m)
  const weightSurf = rho * t;                         // Masse surfacique (kg/m²)

  const I1 = 1.0 * t ** 3 / 12;
  const W1 = 1.0 * t ** 2 / 6;
  const EI = E * 1e6 * I1;

  // Moment de flexion transversal sous poussée horizontale qh (kN·m/m)
  const Mh = qh * H ** 2 / 8;
  const sigmaH = (Mh / W1) / 1000;                    // MPa
  const etaStress = (sigmaH / sigmaAdm) * 100;

  // Flèche transversale horizontale maximale (mm)
  const fhMm = ((5 / 384) * (qh * H ** 4) / Math.max(EI, 1e-4)) * 1000;
  const lim200 = (H / 200) * 1000;                    // Limite DTU 25.41 (H/200)

  const etaDefl = (fhMm / lim200) * 100;
  const eta = Math.max(etaStress, etaDefl);

  let verdict, cause;
  if (etaStress > 100) {
    verdict = 'rupture'; cause = `Contrainte sous poussée horizontale (${sigmaH.toFixed(2)} MPa) supérieure à la limite admissible`;
  } else if (fhMm > lim200) {
    verdict = 'rupture'; cause = `Flèche transversale sous poussée (${fhMm.toFixed(1)} mm) supérieure à H/200 (${lim200.toFixed(1)} mm)`;
  } else if (eta > 85) {
    verdict = 'limite'; cause = 'Rigidité transversale en limite de conformité DTU';
  } else {
    verdict = 'ok'; cause = `Cloison stable et conforme aux critères de poussée et rigidité DTU (flèche ${fhMm.toFixed(1)} mm ≤ H/200)`;
  }

  return {
    type: 'partition',
    input: { L, h: H, b: t, E, sigmaAdm, rho, qh },
    H, t, L,
    weightLin, weightSurf,
    Mh, sigmaH, fhMm, lim200,
    eta, etaStress, etaDefl,
    verdict, cause,
    deflection: (z) => {
      return (fhMm / 1000) * Math.sin((Math.PI * z) / H);
    }
  };
}

/**
 * Dimensionnement et vérification d'un corbeau / console courte (Eurocode 2 §6.5 & Eurocode 3).
 * Modèle bielles et tirants (Strut-and-Tie) pour transmission des charges ponctuelles de poutres.
 * @param {object} p {L (portée ac en m), h (hauteur hc en m), b (largeur b en m), E (GPa), sigmaAdm (MPa), rho (kg/m³), F (charge kN), nature}
 */
export function corbelAnalysis(p) {
  const ac = Math.max(0.05, Number(p.L) || 0.25);      // Distance de la charge au nu d'appui (m)
  const hc = Math.max(0.05, Number(p.h) || 0.40);      // Hauteur totale du corbeau (m)
  const b = Math.max(0.05, Number(p.b) || 0.25);       // Largeur du corbeau (m)
  const { E, sigmaAdm, rho } = p;
  const F = Math.max(0, Number(p.F) || 120);           // Charge verticale transmise par la poutre (kN)
  const nature = p.nature === 'G' ? 'G' : 'Q';

  if (!(ac > 0 && hc > 0 && b > 0)) return { error: 'Dimensions de corbeau invalides.' };
  if (!(E > 0) || !(sigmaAdm > 0)) return { error: 'Matériau non structural pour le corbeau.' };

  const d = 0.90 * hc;                                 // Hauteur utile (m)
  const z = 0.85 * d;                                  // Bras de levier mécanique (m)
  const rac = ac / Math.max(d, 1e-3);                  // Rapport ac / d (console courte si <= 1.0)

  const gUser = nature === 'G' ? GAMMA_G : GAMMA_Q;
  const Fels = F;
  const Fed = gUser * F;                               // Charge verticale ELU (kN)
  const Hed = 0.20 * Fed;                              // Effort horizontal de frottement / dilatation (EN 1992 §6.5)

  // Angle de la bielle comprimée θ
  const thetaRad = Math.atan(z / Math.max(ac, 1e-3));
  const thetaDeg = (thetaRad * 180) / Math.PI;

  // Effort dans le tirant principal d'armatures / boulonnerie : Ted = Fed · (ac / z) + Hed
  const Ted = Fed * (ac / z) + Hed;                    // kN (traction)

  // Effort de compression dans la bielle de béton : Ced = Fed / sin(θ)
  const Ced = Fed / Math.max(Math.sin(thetaRad), 0.1); // kN (compression)

  // Contrainte dans la bielle inclinée
  const bielleArea = b * ac * Math.sin(thetaRad);      // m²
  const sigmaStrut = (Ced / Math.max(bielleArea, 1e-4)) / 1000; // MPa

  // Contrainte de cisaillement moyen à la jonction du corbeau
  const tau = (Fed / (b * d)) / 1000;                  // MPa
  const tauAdm = 0.35 * sigmaAdm;                      // Valeur de cisaillement admissible

  // Section d'armature principale requise (acier fyd = 435 MPa)
  const AsReq = (Ted * 10) / 435;                      // cm²

  const etaStrut = (sigmaStrut / sigmaAdm) * 100;
  const etaShear = (tau / Math.max(tauAdm, 1e-3)) * 100;
  const eta = Math.max(etaStrut, etaShear);

  let verdict, cause;
  if (rac > 1.2) {
    verdict = 'limite'; cause = `Portée importante (ac/d = ${rac.toFixed(2)} > 1.0 : fonctionnement en console standard plutôt qu'en corbeau court)`;
  } else if (sigmaStrut > sigmaAdm) {
    verdict = 'rupture'; cause = `Écrasement de la bielle comprimée de béton (${sigmaStrut.toFixed(1)} MPa > σ_adm)`;
  } else if (tau > tauAdm) {
    verdict = 'rupture'; cause = `Cisaillement excessif à la jonction (${tau.toFixed(1)} MPa > τ_adm)`;
  } else if (eta > 90) {
    verdict = 'limite'; cause = 'Taux de contrainte en bielle ou cisaillement supérieur à 90 %';
  } else {
    verdict = 'ok'; cause = `Corbeau vérifié selon le modèle bielles et tirants Eurocode (θ = ${thetaDeg.toFixed(0)}°, As = ${AsReq.toFixed(1)} cm²)`;
  }

  return {
    type: 'corbel',
    input: { L: ac, h: hc, b, E, sigmaAdm, rho, F, nature },
    ac, hc, d, z, rac,
    Fed, Hed, Fels,
    thetaDeg, thetaRad,
    Ted, Ced,
    sigmaStrut, tau, tauAdm, AsReq,
    eta, etaStrut, etaShear,
    verdict, cause,
    deflection: (x) => {
      // Déplacement vertical estimé de l'extrémité du corbeau
      const fTip = (Fed * ac ** 3) / (3 * E * 1e6 * (b * hc ** 3 / 12));
      return (fTip * (x / ac) ** 2);
    }
  };
}

/* ========================================================================== */
/*  Cartes de couleurs                                                         */
/* ========================================================================== */

function lerp3(stops, t) {
  if (t <= stops[0][0]) return stops[0][1].slice();
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return stops[stops.length - 1][1].slice();
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export const U_STOPS = [
  [0.10, hex(0x2e66e6)], [0.30, hex(0x1fb8b0)], [0.55, hex(0x3ecf6e)],
  [1.00, hex(0xf2c40f)], [1.60, hex(0xf59e0b)], [2.60, hex(0xef3b2d)]
];
export const RATIO_STOPS = [
  [0, hex(0x3ecf6e)], [55, hex(0x8fd14f)], [80, hex(0xf2c40f)], [100, hex(0xf59e0b)], [130, hex(0xef3b2d)]
];

/** Couleur [r,g,b] (0..1) pour un coefficient U (W/m².K). */
export const colorForU = (U) => lerp3(U_STOPS, U);
/** Couleur [r,g,b] (0..1) pour un taux de travail (%). */
export const colorForRatio = (eta) => lerp3(RATIO_STOPS, eta);
export const cssRgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
