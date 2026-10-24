# 3D Viewer Studio

Visionneuse 3D universelle (Electron + Three.js 0.165) — 100 % locale, aucun fichier n'est envoyé ni stocké.

## Lancement

- Double-cliquez sur `Lancer-Viewer.bat` (installe Electron au premier lancement), ou
- `npm install` puis `npm start`.

> Three.js est chargé localement via module ES / vendor local : fonctionne 100 % hors-ligne, aucune connexion Internet n'est requise.

## Formats

GLTF / GLB (Draco, KTX2, Meshopt), OBJ (+ MTL), FBX, STL, DAE (Collada), PLY (maillages et nuages de points).
Déposez le modèle **avec** ses textures / `.mtl` / `.bin` pour les résoudre automatiquement.
Un chemin de fichier passé en argument ouvre aussi le modèle (`electron . modele.glb`).

## Raccourcis

| Touche | Action | Touche | Action |
|---|---|---|---|
| `O` | Ouvrir un modèle | `1` `2` `3` `4` | PBR / Superposé / Filaire / UV |
| `L` | Calques | `G` | Grille |
| `E` | Éclairage | `F` / double-clic | Recentrer la caméra |
| `I` | Tiroir d'inspection | `S` | Capture HD (PNG, dossier Téléchargements) |
| `Échap` | Désélectionner | | |

## Options de développement

`--dev` (F12), `--shot=<png>`, `--exec=<js>`, `--mode=<shaded|overlay|wire|uv>`, `--drawer`, `--hidepanels`.
`npm run icon` régénère `icon.png` depuis `icon.svg`.
