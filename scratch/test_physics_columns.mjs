import assert from 'node:assert';
import { MaterialDB, DEFAULT_MATERIALS, STRUCTURAL_IDS, MATERIAL_CATEGORIES } from '../workspaces/archphysics/js/materials.js';
import * as P from '../workspaces/archphysics/js/physics.js';

const db = new MaterialDB();
console.log('--- 1. Testing Structural Materials & Categories ---');
console.log('Total materials in db:', Object.keys(db.items).length);
console.log('Structural IDs count:', STRUCTURAL_IDS.length);

// Verify new structural materials exist
const expectedNewMaterials = [
  'clt', 'lvl', 'bambou', 'bfup', 'beton_c40', 's355', 'inox',
  'alu_6082', 'maconnerie_blocs', 'pierre_granit', 'pise_porteur', 'cfrp', 'gfrp'
];

for (const id of expectedNewMaterials) {
  const m = db.get(id);
  assert(m, `Material ${id} should exist in db`);
  assert(m.E > 0, `Material ${id} must have Young's modulus E > 0`);
  assert(m.sigma > 0, `Material ${id} must have sigmaAdm > 0`);
  assert(STRUCTURAL_IDS.includes(id), `Material ${id} should be in STRUCTURAL_IDS`);
  console.log(`✓ Material [${id}] ${m.name}: E=${m.E} GPa, σ_adm=${m.sigma} MPa, cat=${m.cat}`);
}

console.log('--- 2. Testing Column Analysis (Euler & Eurocode Buckling) ---');
// Poteau béton C25/30 : H = 3.2m, b = 0.25m, h = 0.25m, N = 250 kN
const colConcrete = P.columnAnalysis({
  L: 3.2,
  b: 0.25,
  h: 0.25,
  E: 31,          // GPa
  sigmaAdm: 16.7, // MPa
  rho: 2400,
  scheme: 'pin_pin',
  N: 250,
  e0: 0.02,
  M: 0,
  nature: 'Q'
});

console.log('Concrete column results:', {
  type: colConcrete.type,
  Lcr: colConcrete.Lcr,
  iminCm: colConcrete.iminCm,
  lambda: colConcrete.lambda,
  lambdaBar: colConcrete.lambdaBar,
  chi: colConcrete.chi,
  Ncr: colConcrete.Ncr,
  NbRd: colConcrete.NbRd,
  Nelu: colConcrete.Nelu,
  sigmaTotal: colConcrete.sigmaTotal,
  eta: colConcrete.eta,
  verdict: colConcrete.verdict
});

assert.strictEqual(colConcrete.type, 'column');
assert(colConcrete.Ncr > 0, 'Ncr must be positive');
assert(colConcrete.NbRd > 0, 'NbRd must be positive');
assert(colConcrete.chi > 0 && colConcrete.chi <= 1.0, 'chi must be between 0 and 1');
assert(colConcrete.verdict === 'ok' || colConcrete.verdict === 'limite', 'Should be verifiable');

// Deflection function check
const midDefl = colConcrete.deflection(1.6);
assert(Number.isFinite(midDefl), 'Deflection at mid-height must be a finite number');
console.log('✓ Column deflection at z = 1.6m:', (midDefl * 1000).toFixed(2), 'mm');

// Poteau acier S235 : H = 3.5m, section 14x14cm, N = 350 kN
const colSteel = P.columnAnalysis({
  L: 3.5,
  b: 0.14,
  h: 0.14,
  E: 210,
  sigmaAdm: 235,
  rho: 7850,
  scheme: 'pin_pin',
  N: 350,
  e0: 0.02,
  M: 0,
  nature: 'Q'
});

console.log('Steel column results:', {
  type: colSteel.type,
  lambda: colSteel.lambda,
  chi: colSteel.chi,
  Ncr: colSteel.Ncr,
  NbRd: colSteel.NbRd,
  Nelu: colSteel.Nelu,
  eta: colSteel.eta,
  verdict: colSteel.verdict
});
assert.strictEqual(colSteel.type, 'column');
assert(colSteel.Ncr > 500, 'Steel column Ncr should be high');

// Test extreme buckling overload (Euler instability)
const colUnstable = P.columnAnalysis({
  L: 6.0,
  b: 0.05,
  h: 0.05,
  E: 10,
  sigmaAdm: 20,
  rho: 500,
  scheme: 'fix_free', // k = 2.0 -> Lcr = 12m !
  N: 100,
  e0: 0.05,
  M: 0,
  nature: 'Q'
});
console.log('Unstable column verdict:', colUnstable.verdict, 'cause:', colUnstable.cause);
assert.strictEqual(colUnstable.verdict, 'rupture', 'Extreme slender column must fail');

console.log('--- 3. Testing Beam Analysis vs Column Analysis Discrimination ---');
const beamSimple = P.beamAnalysis({
  L: 5.0,
  b: 0.15,
  h: 0.30,
  E: 11,
  sigmaAdm: 24,
  rho: 420,
  scheme: 'ss',
  q: 4,
  F: 0,
  nature: 'Q'
});
assert.strictEqual(beamSimple.type, undefined); // Beam standard
assert(beamSimple.fMm > 0, 'Beam must have deflection');
assert(beamSimple.Iz > 0, 'Beam must have Iz');

console.log('--- ALL UNIT TESTS PASSED SUCCESSFULLY! ---');
