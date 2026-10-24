/**
 * ArchPhysics Studio — Base de données physique des matériaux.
 *
 * Sources de référence (valeurs usuelles de calcul) :
 *  - ISO 10456 / EN 12524 (propriétés hygrothermiques : λ, ρ, cp)
 *  - EN 338, EN 14080 (bois C24, GL24h, bois feuillus D70)
 *  - EN 1992-1-1 (béton C25/30 : fcd = 0,85·fck/1,5), EN 1993-1-1 (acier S235, γM0 = 1,0)
 *  - EN 1995-1-1 (σ_adm = kmod · fm,k / γM, kmod = 0,8 ; γM = 1,3)
 *  - EN 1999-1-1 (aluminium EN AW-6063 T6)
 *
 * Champs :  lambda  [W/m.K]   conductivité thermique
 *           rho     [kg/m3]   masse volumique
 *           cp      [J/kg.K]  capacité thermique massique
 *           E       [GPa]     module d'Young
 *           sigma   [MPa]     contrainte admissible en flexion (valeur de calcul)
 *           glaz    {U, e}    (vitrages) U_g [W/m2.K] et épaisseur nominale e [m]
 */

export const DEFAULT_MATERIALS = {
  /* ---------- Structure : Bois d'ingénierie & Éco-matériaux ---------- */
  c24:        { id: 'c24',        name: 'Bois massif résineux (C24)',    cat: 'Structure — Bois & Éco-matériaux', lambda: 0.13,  rho: 420,  cp: 1600, E: 11.0,   sigma: 14.8 },
  gl24h:      { id: 'gl24h',      name: 'Bois lamellé-collé (GL24h)',    cat: 'Structure — Bois & Éco-matériaux', lambda: 0.13,  rho: 420,  cp: 1600, E: 11.5,   sigma: 14.8 },
  clt:        { id: 'clt',        name: 'Bois Lamellé-Croisé (CLT)',     cat: 'Structure — Bois & Éco-matériaux', lambda: 0.13,  rho: 470,  cp: 1600, E: 12.0,   sigma: 15.0 },
  lvl:        { id: 'lvl',        name: 'Bois lamifié LVL (Kerto-S)',    cat: 'Structure — Bois & Éco-matériaux', lambda: 0.13,  rho: 510,  cp: 1600, E: 14.0,   sigma: 28.0 },
  bambou:     { id: 'bambou',     name: 'Bambou lamellé structural',     cat: 'Structure — Bois & Éco-matériaux', lambda: 0.17,  rho: 700,  cp: 1600, E: 18.0,   sigma: 35.0 },
  exotique:   { id: 'exotique',   name: 'Bois feuillu dense (D70)',      cat: 'Structure — Bois & Éco-matériaux', lambda: 0.25,  rho: 1080, cp: 1600, E: 20.0,   sigma: 43.1 },

  /* ---------- Structure : Bétons techniques & hautes performances ---------- */
  beton:      { id: 'beton',      name: 'Béton armé standard (C25/30)',  cat: 'Structure — Bétons techniques',    lambda: 2.30,  rho: 2500, cp: 1000, E: 31.0,   sigma: 14.2 },
  beton_c40:  { id: 'beton_c40',  name: 'Béton haute résistance (C40/50)',cat: 'Structure — Bétons techniques',  lambda: 2.30,  rho: 2500, cp: 1000, E: 35.0,   sigma: 22.6 },
  bfup:       { id: 'bfup',       name: 'Béton Fibré Ultra-Performant (BFUP)',cat: 'Structure — Bétons techniques',lambda: 2.40,  rho: 2550, cp: 1000, E: 50.0,   sigma: 85.0 },

  /* ---------- Structure : Aciers & Métaux de structure ---------- */
  s235:       { id: 's235',       name: 'Acier de construction (S235)',  cat: 'Structure — Aciers & Métaux',      lambda: 50.0,  rho: 7850, cp: 460,  E: 210.0,  sigma: 235.0 },
  s355:       { id: 's355',       name: 'Acier haute limite (S355)',     cat: 'Structure — Aciers & Métaux',      lambda: 50.0,  rho: 7850, cp: 460,  E: 210.0,  sigma: 355.0 },
  inox:       { id: 'inox',       name: 'Acier Inoxydable (Inox 316L)',  cat: 'Structure — Aciers & Métaux',      lambda: 15.0,  rho: 7950, cp: 500,  E: 200.0,  sigma: 240.0 },
  alu:        { id: 'alu',        name: 'Aluminium d\'extrusion (6063-T6)',cat: 'Structure — Aciers & Métaux',   lambda: 160.0, rho: 2800, cp: 880,  E: 70.0,   sigma: 145.0 },
  alu_6082:   { id: 'alu_6082',   name: 'Aluminium structural (6082-T6)',cat: 'Structure — Aciers & Métaux',    lambda: 170.0, rho: 2710, cp: 890,  E: 70.0,   sigma: 210.0 },

  /* ---------- Structure : Pierre & Maçonnerie porteuse ---------- */
  maconnerie_blocs:{ id: 'maconnerie_blocs', name: 'Maçonnerie blocs pleins', cat: 'Structure — Maçonnerie & Pierre', lambda: 0.95, rho: 1400, cp: 920, E: 6.5, sigma: 4.2 },
  brique:     { id: 'brique',     name: 'Brique creuse terre cuite',     cat: 'Structure — Maçonnerie & Pierre', lambda: 0.45,  rho: 800,  cp: 936,  E: 4.0,    sigma: 0.80 },
  calcaire:   { id: 'calcaire',   name: 'Pierre calcaire de taille',     cat: 'Structure — Maçonnerie & Pierre', lambda: 1.70,  rho: 2200, cp: 1000, E: 25.0,   sigma: 1.80 },
  pierre_granit:{ id: 'pierre_granit', name: 'Granit / Pierre dure massive', cat: 'Structure — Maçonnerie & Pierre', lambda: 2.80, rho: 2700, cp: 850, E: 45.0, sigma: 8.5 },
  pise_porteur:{ id: 'pise_porteur', name: 'Pisé & Terre crue compactée',cat: 'Structure — Maçonnerie & Pierre', lambda: 0.85, rho: 2000, cp: 900,  E: 1.2,    sigma: 0.80 },
  btc:        { id: 'btc',        name: 'Terre crue comprimée (BTC)',    cat: 'Structure — Maçonnerie & Pierre', lambda: 0.80,  rho: 1900, cp: 900,  E: 1.0,    sigma: 0.30 },

  /* ---------- Structure : Matériaux Composites & Renforts ---------- */
  cfrp:       { id: 'cfrp',       name: 'Composite Carbone (CFRP)',      cat: 'Structure — Composites & Tirants', lambda: 5.0,   rho: 1600, cp: 1200, E: 160.0,  sigma: 1400.0 },
  gfrp:       { id: 'gfrp',       name: 'Fibre de verre pultrudée (GFRP)',cat: 'Structure — Composites & Tirants', lambda: 0.35, rho: 1800, cp: 1100, E: 30.0,   sigma: 250.0 },

  /* ---------- Isolants ---------- */
  laine_bois: { id: 'laine_bois', name: 'Laine de bois',                 cat: 'Isolants', lambda: 0.038, rho: 55, cp: 2100, E: 0.001,  sigma: 0.020 },
  laine_roche:{ id: 'laine_roche',name: 'Laine de roche',                cat: 'Isolants', lambda: 0.035, rho: 40, cp: 1030, E: 0.0005, sigma: 0.010 },
  pu:         { id: 'pu',         name: 'Polyuréthane (PU)',             cat: 'Isolants', lambda: 0.022, rho: 32, cp: 1450, E: 0.005,  sigma: 0.100 },
  pse:        { id: 'pse',        name: 'Polystyrène expansé (PSE)',     cat: 'Isolants', lambda: 0.032, rho: 20, cp: 1450, E: 0.004,  sigma: 0.080 },
  cellulose:  { id: 'cellulose',  name: 'Fibre de cellulose',            cat: 'Isolants', lambda: 0.039, rho: 50, cp: 1900, E: 0.0005, sigma: 0.010 },

  /* ---------- Vitrages et fluides ---------- */
  vitrage_s:  { id: 'vitrage_s',  name: 'Simple vitrage',                          cat: 'Vitrages et fluides', lambda: 1.00,   rho: 2500, cp: 750,  E: 70.0, sigma: 18.0, glaz: { U: 5.7, e: 0.004 } },
  vitrage_d:  { id: 'vitrage_d',  name: 'Double vitrage peu émissif Argon (U=1.1)',cat: 'Vitrages et fluides', lambda: 0.0325, rho: 2500, cp: 750,  E: 70.0, sigma: 18.0, glaz: { U: 1.1, e: 0.024 } },
  vitrage_t:  { id: 'vitrage_t',  name: 'Triple vitrage (U=0.7)',                  cat: 'Vitrages et fluides', lambda: 0.0286, rho: 2500, cp: 750,  E: 70.0, sigma: 18.0, glaz: { U: 0.7, e: 0.036 } },
  eau:        { id: 'eau',        name: 'Eau',                                     cat: 'Vitrages et fluides', lambda: 0.60,   rho: 1000, cp: 4186, E: 0.0,  sigma: 0.0 },
  air:        { id: 'air',        name: 'Lame d\'air immobile',                    cat: 'Vitrages et fluides', lambda: 0.025,  rho: 1.2,  cp: 1006, E: 0.0,  sigma: 0.0 },

  /* ---------- Finitions ---------- */
  enduit:     { id: 'enduit',     name: 'Enduit (chaux-ciment)',         cat: 'Finitions', lambda: 0.87, rho: 1800, cp: 1000, E: 10.0, sigma: 1.50 },
  platre:     { id: 'platre',     name: 'Plâtre (plaque de plâtre)',     cat: 'Finitions', lambda: 0.25, rho: 900,  cp: 1000, E: 3.0,  sigma: 1.00 }
};

export const MATERIAL_CATEGORIES = [
  'Structure — Bois & Éco-matériaux',
  'Structure — Bétons techniques',
  'Structure — Aciers & Métaux',
  'Structure — Maçonnerie & Pierre',
  'Structure — Composites & Tirants',
  'Isolants',
  'Vitrages et fluides',
  'Finitions',
  'Personnalisés'
];

/** Matériaux porteurs proposés dans le module RDM. */
export const STRUCTURAL_IDS = [
  's235', 's355', 'inox', 'alu', 'alu_6082',
  'c24', 'gl24h', 'clt', 'lvl', 'bambou', 'exotique',
  'beton', 'beton_c40', 'bfup',
  'maconnerie_blocs', 'calcaire', 'pierre_granit', 'pise_porteur',
  'cfrp', 'gfrp'
];

const LS_KEY = 'archphysics.materials.v1';

export class MaterialDB {
  constructor() {
    this.items = JSON.parse(JSON.stringify(DEFAULT_MATERIALS));
    this.listeners = new Set();
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const [id, m] of Object.entries(saved)) {
        if (this._valid(m)) this.items[id] = { ...(this.items[id] || {}), ...m, id };
      }
    } catch (_) { /* stockage indisponible */ }
  }

  _valid(m) {
    return m && typeof m.name === 'string' && [m.lambda, m.rho, m.cp, m.E, m.sigma].every((v) => Number.isFinite(+v));
  }

  save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.items)); } catch (_) { /* ignore */ }
    this.listeners.forEach((fn) => fn());
  }

  onChange(fn) { this.listeners.add(fn); }

  get(id) { return this.items[id] || null; }

  list() { return Object.values(this.items); }

  update(id, patch) {
    if (!this.items[id]) return;
    Object.assign(this.items[id], patch);
    this.save();
  }

  add(m) {
    let base = (m.name || 'materiau').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) || 'mat';
    let id = 'u_' + base, n = 1;
    while (this.items[id]) id = `u_${base}_${n++}`;
    this.items[id] = {
      id, name: 'Nouveau matériau', cat: 'Personnalisés', lambda: 1.0, rho: 1000, cp: 1000, E: 10, sigma: 5,
      custom: true, ...m
    };
    this.items[id].id = id;
    this.save();
    return id;
  }

  remove(id) {
    const m = this.items[id];
    if (!m || !m.custom) return false;
    delete this.items[id];
    this.save();
    return true;
  }

  resetDefaults() {
    this.items = JSON.parse(JSON.stringify(DEFAULT_MATERIALS));
    this.save();
  }

  toJSON() { return JSON.stringify(this.items, null, 2); }

  importJSON(text) {
    const obj = JSON.parse(text);
    let n = 0;
    for (const [id, m] of Object.entries(obj)) {
      if (this._valid(m)) { this.items[id] = { ...m, id, cat: m.cat || 'Personnalisés', custom: !DEFAULT_MATERIALS[id] }; n++; }
    }
    this.save();
    return n;
  }
}
