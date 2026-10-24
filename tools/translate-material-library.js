const fs = require('fs');
const path = require('path');

function updateFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  for (const [from, to] of replacements) {
    if (content.includes(from)) {
      content = content.replaceAll(from, to);
      count++;
    } else {
      console.warn(`[WARN] String not found in ${filePath}: "${from.slice(0, 40)}..."`);
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[SUCCESS] ${filePath}: applied ${count}/${replacements.length} replacements.`);
}

// 1. MATERIAL-LIBRARY
const matLibPath = path.join(__dirname, '..', 'workspaces', 'material-library', 'index.html');
const matLibReplacements = [
  ['<html lang="fr">', '<html lang="en">'],
  ['title="Ouvrir le dossier des matériaux dans l\'explorateur Windows" onclick="fetch(\'/api/open-folder\').catch(e => console.error(e))">📁 Dossier</button>', 'title="Open materials folder in File Explorer" onclick="fetch(\'/api/open-folder\').catch(e => console.error(e))">📁 Folder</button>'],
  ['title="Glissez-déposez un dossier ou des images, ou utilisez les boutons"', 'title="Drag & drop a folder or textures, or use buttons"'],
  ['<div class="dropzone-title">IMPORTER UN DOSSIER OU DES TEXTURES</div>', '<div class="dropzone-title">IMPORT FOLDER OR TEXTURES</div>'],
  ['<div class="dropzone-sub">Déposez un dossier/textures ou utilisez les sélecteurs</div>', '<div class="dropzone-sub">Drop folder / texture maps or click below</div>'],
  ['<span>CATÉGORIE CIBLE :</span>', '<span>TARGET CATEGORY:</span>'],
  ['title="Sélectionner un dossier complet de textures">📁 Parcourir dossier</button>', 'title="Select complete PBR texture folder">📁 Browse Folder</button>'],
  ['title="Sélectionner des fichiers de textures individuels">🖼️ Parcourir fichiers</button>', 'title="Select individual texture maps">🖼️ Browse Files</button>'],
  ['placeholder="Rechercher un matériau...">', 'placeholder="Search materials...">'],
  ['Sphère UV\n            </button>', 'UV Sphere\n            </button>'],
  ['Cube\n            </button>', 'Cube\n            </button>'],
  ['Dalle plane\n            </button>', 'Flat Slab\n            </button>'],
  ['Diorama architectural\n            </button>', 'Architectural Diorama\n            </button>'],
  ['title="Tester le matériau sur votre propre modèle 3D (GLB, OBJ, STL)">\n                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>\n                Modèle 3D Perso\n            </button>', 'title="Test material on your custom 3D model (GLB, OBJ, STL)">\n                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>\n                Custom 3D Model\n            </button>'],
  ['RÉPÉTITION UV\n                    <span id="uvValueLabel">1x</span>', 'UV TILING\n                    <span id="uvValueLabel">1x</span>'],
  ['RELIEF 3D (DISP)\n                    <span id="dispValueLabel">0.05</span>', '3D DISPLACEMENT\n                    <span id="dispValueLabel">0.05</span>'],
  ['Rotation\n                </button>', 'Turntable\n                </button>'],
  ['Reset Vue\n                </button>', 'Reset View\n                </button>'],
  ['<span>Chargement des textures haute résolution...</span>', '<span>Loading high-resolution textures...</span>'],
  ['<h2 class="modal-title">Renommer le matériau</h2>', '<h2 class="modal-title">Rename Material</h2>'],
  ["Le dossier et l'ensemble des textures associées seront automatiquement renommés pour conserver une nomenclature PBR uniforme.", "The folder and all associated textures will automatically be renamed to preserve uniform PBR naming."],
  ['placeholder="nouveau_nom_de_materiau">', 'placeholder="new_material_name">'],
  ['<button class="modal-btn modal-btn-cancel" id="renameCancelBtn">Annuler</button>', '<button class="modal-btn modal-btn-cancel" id="renameCancelBtn">Cancel</button>'],
  ['<button class="modal-btn modal-btn-confirm" id="renameConfirmBtn">Confirmer</button>', '<button class="modal-btn modal-btn-confirm" id="renameConfirmBtn">Confirm</button>'],
  ["btnView.textContent = 'Voir';", "btnView.textContent = 'View';"],
  ["btnRename.textContent = 'Renommer';", "btnRename.textContent = 'Rename';"],
  ["btnFolder.textContent = 'Dossier';", "btnFolder.textContent = 'Folder';"],
  ["btnFolder.title = 'Ouvrir le dossier dans Windows Explorer';", "btnFolder.title = 'Open folder in File Explorer';"],
  ["emptyMsg.textContent = 'Aucun matériau ne correspond à votre recherche.';", "emptyMsg.textContent = 'No materials match your search.';"],
  ["uploadFeedback.textContent = `✓ Modèle 3D '${file.name}' chargé pour aperçu PBR !`;", "uploadFeedback.textContent = `✓ Custom 3D Model '${file.name}' loaded for PBR preview!`;"],
  ["uploadFeedback.textContent = `Erreur modèle 3D : ${err.message}`;", "uploadFeedback.textContent = `3D Model error: ${err.message}`;"],
  ["uploadFeedback.textContent = 'Analyse des éléments déposés...';", "uploadFeedback.textContent = 'Analyzing dropped files...';"],
  ["uploadFeedback.textContent = 'Aucun fichier valide détecté.';", "uploadFeedback.textContent = 'No valid files detected.';"],
  ["uploadFeedback.textContent = 'Erreur lors du traitement du glisser-déposer.';", "uploadFeedback.textContent = 'Error processing drag and drop.';"],
  ["uploadFeedback.textContent = `Aucune texture d'image valide trouvée pour '${folderName}'.`;", "uploadFeedback.textContent = `No valid image textures found for '${folderName}'.`;"],
  ["uploadFeedback.textContent = `✓ '${data.materialName}' importé avec succès dans '${category}' !`;", "uploadFeedback.textContent = `✓ '${data.materialName}' imported successfully into '${category}'!`;"],
  ["uploadFeedback.textContent = `Erreur: ${(data && data.error) || 'Échec de l\\'importation'}`;", "uploadFeedback.textContent = `Error: ${(data && data.error) || 'Import failed'}`;"],
  ["? 'Le téléversement a expiré après 90 secondes.'", "? 'Upload timed out after 90 seconds.'"],
  [": 'Erreur réseau lors de l\\'importation: ' + (err.message || 'connexion impossible');", ": 'Network error during import: ' + (err.message || 'connection failed');"],
  ["uploadFeedback.textContent = `✓ ${data.message || 'Dossier importé avec succès !'}`;", "uploadFeedback.textContent = `✓ ${data.message || 'Folder imported successfully!'}`;"],
  ["uploadFeedback.textContent = `✓ ${data.message || 'Textures importées avec succès !'}`;", "uploadFeedback.textContent = `✓ ${data.message || 'Textures imported successfully!'}`;"],
  ["alert('Erreur réseau lors du renommage');", "alert('Network error while renaming material');"]
];

updateFile(matLibPath, matLibReplacements);
