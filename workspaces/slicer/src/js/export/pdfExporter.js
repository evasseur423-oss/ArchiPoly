/**
 * Architectural Vector PDF Exporter & Planche ZIP Packager
 * Maquette Slicer Studio — ArchiPoly
 *
 * Produces 100% vector, mathematically calibrated PDF files matching
 * the exact millimeter sheet dimensions chosen by the user (A4, A3, A2, A1, Laser bed, Custom).
 * Bundles all sheets into a clean compressed ZIP archive for laser cutting & model fabrication.
 */

const PT_PER_MM = 72 / 25.4; // 1 mm = ~2.83464567 pt

/**
 * Strips non-Latin diacritics and escapes characters for standard PDF WinAnsi / ASCII
 */
function sanitizePdfText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (é -> e, à -> a, etc.)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Converts a polygon point array [[x, y], ...] from millimeter sheet coordinates
 * into PDF vector path operators.
 */
function pointsToPdfPath(points, sheetHeightMm) {
  if (!points || points.length < 2) return '';
  let path = '';
  const [x0, y0] = points[0];
  const px0 = (x0 * PT_PER_MM).toFixed(3);
  const py0 = ((sheetHeightMm - y0) * PT_PER_MM).toFixed(3);
  path += `${px0} ${py0} m `;

  for (let i = 1; i < points.length; i++) {
    const [xi, yi] = points[i];
    const pxi = (xi * PT_PER_MM).toFixed(3);
    const pyi = ((sheetHeightMm - yi) * PT_PER_MM).toFixed(3);
    path += `${pxi} ${pyi} l `;
  }
  path += 'h '; // Close path
  return path;
}

export class PdfExporter {
  /**
   * Builds the PDF graphics stream for a single sheet.
   * @param {Object} sheet - Sheet object containing width, height, items, sheetNumber
   * @param {Object} options - Export metadata and display options
   * @returns {string} PDF graphics content stream
   */
  static buildSheetStream(sheet, options = {}) {
    const {
      totalSheets = 1,
      modelName = 'Maquette Architecturale',
      scale = 200,
      thickness = 1.5,
      materialStyle = 'Carton / Bois',
      formatLabel = 'A3',
      showGuides = true,
      showCutLines = true,
      showLabels = true,
      cutColor = [1, 0, 0],         // Pure Laser Red (1 0 0 RG)
      guideColor = [0, 0.4, 1],     // Laser Cyan/Blue (0 0.4 1 RG)
      labelColor = [0.15, 0.15, 0.15]
    } = options;

    const wMm = sheet.width;
    const hMm = sheet.height;
    const wPt = (wMm * PT_PER_MM).toFixed(3);
    const hPt = (hMm * PT_PER_MM).toFixed(3);

    let stream = `q\n`; // Save graphics state

    // =========================================================================
    // 1. SHEET BORDER & SAFETY MARGIN
    // =========================================================================
    const marginMm = 6;
    const mPtX = (marginMm * PT_PER_MM).toFixed(3);
    const mPtY = (marginMm * PT_PER_MM).toFixed(3);
    const mPtW = ((wMm - 2 * marginMm) * PT_PER_MM).toFixed(3);
    const mPtH = ((hMm - 2 * marginMm) * PT_PER_MM).toFixed(3);

    // Subtle outer border (useful for paper trimming or laser bed reference)
    stream += `0.65 0.65 0.65 RG 0.3 w [] 0 d\n`;
    stream += `${mPtX} ${mPtY} ${mPtW} ${mPtH} re S\n`;

    // =========================================================================
    // 2. CORNER REGISTRATION CROSSES (Croix de calage laser aux 4 coins)
    // =========================================================================
    const regOffset = 10; // 10 mm from edges
    const crossSize = 3;  // 3 mm half-length
    const corners = [
      [regOffset, regOffset],
      [wMm - regOffset, regOffset],
      [wMm - regOffset, hMm - regOffset],
      [regOffset, hMm - regOffset]
    ];

    stream += `0.4 0.4 0.4 RG 0.25 w [] 0 d\n`;
    for (const [cx, cy] of corners) {
      const px = cx * PT_PER_MM;
      const py = (hMm - cy) * PT_PER_MM;
      const d = crossSize * PT_PER_MM;
      stream += `${(px - d).toFixed(3)} ${py.toFixed(3)} m ${(px + d).toFixed(3)} ${py.toFixed(3)} l S\n`;
      stream += `${px.toFixed(3)} ${(py - d).toFixed(3)} m ${px.toFixed(3)} ${(py + d).toFixed(3)} l S\n`;
    }

    // =========================================================================
    // 3. ARCHITECTURAL TITLE BLOCK (Cartouche professionnel en pied de planche)
    // =========================================================================
    const blockX = (marginMm + 3) * PT_PER_MM;
    const blockY = (marginMm + 3) * PT_PER_MM;

    const titleLine1 = `ARCHIPOLY | PLANCHE ${sheet.sheetNumber} / ${totalSheets} - FORMAT ${formatLabel.toUpperCase()} (${wMm} x ${hMm} mm)`;
    const titleLine2 = `Modele : ${sanitizePdfText(modelName)} | Echelle : 1:${scale} | Epaisseur matiere : ${thickness} mm | ${sanitizePdfText(materialStyle)}`;

    stream += `BT\n`;
    stream += `/F2 8 Tf\n`; // Helvetica-Bold
    stream += `0.1 0.1 0.1 rg\n`;
    stream += `${blockX.toFixed(3)} ${(blockY + 14).toFixed(3)} Td\n`;
    stream += `(${sanitizePdfText(titleLine1)}) Tj\n`;
    stream += `ET\n`;

    stream += `BT\n`;
    stream += `/F1 6.5 Tf\n`; // Helvetica Regular
    stream += `0.35 0.35 0.35 rg\n`;
    stream += `${blockX.toFixed(3)} ${(blockY + 4).toFixed(3)} Td\n`;
    stream += `(${sanitizePdfText(titleLine2)}) Tj\n`;
    stream += `ET\n`;

    // =========================================================================
    // 4. GRAPHIC SCALE BAR (Barre d'étalonnage de contrôle 50 mm)
    // =========================================================================
    // Enables immediate physical verification with a real ruler after printing/cutting
    const rulerX = (wMm - marginMm - 65) * PT_PER_MM;
    const rulerY = (marginMm + 3) * PT_PER_MM;
    const blockWidthMm = 10;
    const blockHeightMm = 2;

    stream += `0.2 0.2 0.2 RG 0.2 0.2 0.2 rg 0.25 w [] 0 d\n`;
    for (let b = 0; b < 5; b++) {
      const bx = rulerX + (b * blockWidthMm * PT_PER_MM);
      const bw = blockWidthMm * PT_PER_MM;
      const bh = blockHeightMm * PT_PER_MM;
      if (b % 2 === 0) {
        stream += `${bx.toFixed(3)} ${rulerY.toFixed(3)} ${bw.toFixed(3)} ${bh.toFixed(3)} re B\n`; // Fill and stroke
      } else {
        stream += `${bx.toFixed(3)} ${rulerY.toFixed(3)} ${bw.toFixed(3)} ${bh.toFixed(3)} re S\n`; // Stroke only
      }

      // Numerals above ticks: 0, 10, 20, 30, 40, 50 mm
      const valText = `${b * 10}`;
      stream += `BT /F1 5 Tf 0.2 0.2 0.2 rg ${(bx - 2).toFixed(3)} ${(rulerY + bh + 2).toFixed(3)} Td (${valText}) Tj ET\n`;
    }
    // End value: 50 mm
    const endX = rulerX + (5 * blockWidthMm * PT_PER_MM);
    stream += `BT /F1 5 Tf 0.2 0.2 0.2 rg ${(endX - 5).toFixed(3)} ${(rulerY + blockHeightMm * PT_PER_MM + 2).toFixed(3)} Td (50 mm) Tj ET\n`;

    // Calibration note
    stream += `BT /F1 5 Tf 0.45 0.45 0.45 rg ${(rulerX - 5).toFixed(3)} ${(rulerY - 6).toFixed(3)} Td (Controle echelle 100% : mesurer cette regle = 50 mm exacts) Tj ET\n`;

    // =========================================================================
    // 5. ALIGNMENT GUIDES (Repères d'encollage en pointillés bleus)
    // =========================================================================
    if (showGuides && sheet.items) {
      const [gr, gg, gb] = guideColor;
      const guideDashPt = (2 * PT_PER_MM).toFixed(2); // ~2mm dashed line

      stream += `${gr} ${gg} ${gb} RG\n`;
      stream += `0.2835 w\n`; // 0.1 mm hairline
      stream += `[${guideDashPt} ${guideDashPt}] 0 d\n`;
      stream += `1 j 1 J\n`;

      let hasGuides = false;
      for (const item of sheet.items) {
        if (item.guides && item.guides.length > 0) {
          for (const guide of item.guides) {
            if (guide.outer && guide.outer.length >= 3) {
              stream += pointsToPdfPath(guide.outer, hMm);
              hasGuides = true;
            }
            if (guide.holes && guide.holes.length > 0) {
              for (const hole of guide.holes) {
                if (hole.length >= 3) {
                  stream += pointsToPdfPath(hole, hMm);
                  hasGuides = true;
                }
              }
            }
          }
        }
      }
      if (hasGuides) {
        stream += `S\n`; // Stroke all guide paths
      }
      stream += `[] 0 d\n`; // Reset dash
    }

    // =========================================================================
    // 6. CONTINUOUS LASER CUT LINES (Lignes de découpe rouge laser 0.1 mm)
    // =========================================================================
    if (showCutLines && sheet.items) {
      const [cr, cg, cb] = cutColor;
      stream += `${cr} ${cg} ${cb} RG\n`;
      stream += `0.2835 w\n`; // 0.1 mm laser standard hairline
      stream += `[] 0 d\n`;
      stream += `1 j 1 J\n`;

      let hasCuts = false;
      for (const item of sheet.items) {
        if (item.outer && item.outer.length >= 3) {
          stream += pointsToPdfPath(item.outer, hMm);
          hasCuts = true;
        }
        if (item.holes && item.holes.length > 0) {
          for (const hole of item.holes) {
            if (hole.length >= 3) {
              stream += pointsToPdfPath(hole, hMm);
              hasCuts = true;
            }
          }
        }
      }
      if (hasCuts) {
        stream += `S\n`; // Stroke all cutting contours
      }
    }

    // =========================================================================
    // 7. CENTROID MARKERS, STRATUM LABELS & ELEVATIONS
    // =========================================================================
    if (showLabels && sheet.items) {
      const [lr, lg, lb] = labelColor;
      for (const item of sheet.items) {
        if (item.centroid) {
          const [cxMm, cyMm] = item.centroid;
          const cxPt = cxMm * PT_PER_MM;
          const cyPt = (hMm - cyMm) * PT_PER_MM;

          // Crosshair alignment marker (4 mm cross)
          const markD = 2.0 * PT_PER_MM;
          stream += `0.25 0.25 0.25 RG 0.2 w [] 0 d\n`;
          stream += `${(cxPt - markD).toFixed(3)} ${cyPt.toFixed(3)} m ${(cxPt + markD).toFixed(3)} ${cyPt.toFixed(3)} l S\n`;
          stream += `${cxPt.toFixed(3)} ${(cyPt - markD).toFixed(3)} m ${cxPt.toFixed(3)} ${(cyPt + markD).toFixed(3)} l S\n`;

          // Stratum label (e.g. "L14")
          const labelStr = sanitizePdfText(item.label || `L${item.layerNumber}`);
          const labelLen = labelStr.length;
          const labelOffsetPt = labelLen * 8.0 * 0.28; // Centering heuristic

          stream += `BT\n`;
          stream += `/F2 8 Tf\n`; // Helvetica-Bold
          stream += `${lr} ${lg} ${lb} rg\n`;
          stream += `${(cxPt - labelOffsetPt).toFixed(3)} ${(cyPt + 3.0).toFixed(3)} Td\n`;
          stream += `(${labelStr}) Tj\n`;
          stream += `ET\n`;

          // Elevation subtext (e.g. "+21.0mm")
          const elevMm = item.elevationMm !== undefined ? item.elevationMm.toFixed(1) : '0.0';
          const elevStr = `+${elevMm}mm`;
          const elevOffsetPt = elevStr.length * 5.5 * 0.27;

          stream += `BT\n`;
          stream += `/F1 5.5 Tf\n`; // Helvetica regular
          stream += `0.4 0.4 0.4 rg\n`;
          stream += `${(cxPt - elevOffsetPt).toFixed(3)} ${(cyPt - 7.5).toFixed(3)} Td\n`;
          stream += `(${elevStr}) Tj\n`;
          stream += `ET\n`;
        }
      }
    }

    stream += `Q\n`; // Restore graphics state
    return stream;
  }

  /**
   * Generates a single sheet PDF as Uint8Array
   * @param {Object} sheet - Sheet object
   * @param {Object} options - Metadata & style options
   * @returns {Uint8Array} Binary PDF data
   */
  static generateSingleSheetPdf(sheet, options = {}) {
    return this.buildPdfDocument([sheet], options);
  }

  /**
   * Generates a multi-page PDF containing all sheets
   * @param {Array<Object>} sheets - Array of sheet objects
   * @param {Object} options - Metadata & style options
   * @returns {Uint8Array} Binary PDF data
   */
  static generateMultiPagePdf(sheets, options = {}) {
    return this.buildPdfDocument(sheets, options);
  }

  /**
   * Internal PDF 1.4 document builder
   * @param {Array<Object>} sheets
   * @param {Object} options
   * @returns {Uint8Array}
   */
  static buildPdfDocument(sheets, options = {}) {
    if (!sheets || sheets.length === 0) {
      throw new Error("Aucune planche à exporter en PDF.");
    }

    const objects = [];
    function addObj(content) {
      objects.push(content);
      return objects.length;
    }

    // 1. Catalog
    addObj(`<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>`);

    // 2. Pages Root (Index 2, will update kids after)
    const pagesObjIndex = 2;
    addObj(''); // Placeholder

    // Fonts: F1 = Helvetica, F2 = Helvetica-Bold (Standard 14 built-in PDF fonts)
    const fontRegularIndex = addObj(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>`);
    const fontBoldIndex = addObj(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>`);

    const pageRefs = [];

    for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
      const sheet = sheets[sIdx];
      const pageStream = this.buildSheetStream(sheet, {
        ...options,
        totalSheets: sheets.length
      });

      // Stream length in bytes
      const encoder = new TextEncoder();
      const streamBytes = encoder.encode(pageStream);
      const streamLen = streamBytes.length;

      const streamObjIndex = addObj(`<<\n  /Length ${streamLen}\n>>\nstream\n${pageStream}\nendstream`);

      const ptW = (sheet.width * PT_PER_MM).toFixed(3);
      const ptH = (sheet.height * PT_PER_MM).toFixed(3);

      const pageObjIndex = addObj(`<<\n  /Type /Page\n  /Parent ${pagesObjIndex} 0 R\n  /MediaBox [0 0 ${ptW} ${ptH}]\n  /Contents ${streamObjIndex} 0 R\n  /Resources <<\n    /Font <<\n      /F1 ${fontRegularIndex} 0 R\n      /F2 ${fontBoldIndex} 0 R\n    >>\n  >>\n>>`);

      pageRefs.push(`${pageObjIndex} 0 R`);
    }

    // Update Pages root object
    objects[pagesObjIndex - 1] = `<<\n  /Type /Pages\n  /Kids [${pageRefs.join(' ')}]\n  /Count ${sheets.length}\n>>`;

    // Assemble final PDF with exact xref table offsets
    let header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
    const offsets = [];
    let currentBytePos = header.length;

    let body = '';
    for (let i = 0; i < objects.length; i++) {
      offsets.push(currentBytePos);
      const chunk = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
      body += chunk;
      currentBytePos += chunk.length;
    }

    const startXref = currentBytePos;
    let xref = `xref\n0 ${objects.length + 1}\n`;
    xref += `0000000000 65535 f \n`;
    for (let i = 0; i < offsets.length; i++) {
      const offsetStr = String(offsets[i]).padStart(10, '0');
      xref += `${offsetStr} 00000 n \n`;
    }

    const trailer = `trailer\n<<\n  /Size ${objects.length + 1}\n  /Root 1 0 R\n>>\nstartxref\n${startXref}\n%%EOF\n`;

    const fullPdfString = header + body + xref + trailer;

    // Convert to Uint8Array (Latin-1 / binary mapping)
    const uint8 = new Uint8Array(fullPdfString.length);
    for (let i = 0; i < fullPdfString.length; i++) {
      uint8[i] = fullPdfString.charCodeAt(i) & 0xff;
    }

    return uint8;
  }

  /**
   * Generates a compressed .ZIP file containing:
   *  - Individual vector PDF per sheet (Planche_01_A3.pdf, etc.)
   *  - Complete multi-page vector PDF (Maquette_Complete_Toutes_Planches.pdf)
   *  - Assembly guide & fabrication instructions (README_DECOUPE.txt)
   *  - Optional standalone SVG (Maquette_Decoupe_Laser.svg)
   *
   * @param {Object} packedResult - Output from SheetPacker.packLayers
   * @param {Object} [options] - Options (modelName, scale, thickness, formatLabel, svgContent)
   * @returns {Promise<Blob>} ZIP file Blob
   */
  static async generatePlanchesZip(packedResult, options = {}) {
    if (!packedResult || !packedResult.sheets || packedResult.sheets.length === 0) {
      throw new Error("Aucune planche à archiver en ZIP.");
    }

    const ZipClass = (typeof window !== 'undefined' && window.JSZip)
      || (typeof globalThis !== 'undefined' && globalThis.JSZip)
      || (typeof JSZip !== 'undefined' ? JSZip : null);
    if (!ZipClass) {
      throw new Error("La bibliothèque JSZip n'est pas chargée. Impossible de créer l'archive ZIP.");
    }

    const zip = new ZipClass();

    const {
      modelName = 'Maquette Architecturale',
      scale = 200,
      thickness = 1.5,
      materialStyle = 'Carton / Bois',
      formatLabel = 'A3',
      svgContent = null
    } = options;

    const sheets = packedResult.sheets;
    const totalSheets = sheets.length;

    // 1. Add individual sheet PDFs
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      const sheetNum = String(sheet.sheetNumber).padStart(2, '0');
      const filename = `Planche_${sheetNum}_${formatLabel.toUpperCase()}_${sheet.width}x${sheet.height}mm.pdf`;

      const sheetPdfBytes = this.generateSingleSheetPdf(sheet, {
        ...options,
        totalSheets
      });

      zip.file(filename, sheetPdfBytes, { binary: true });
    }

    // 2. Add complete multi-page PDF combining all sheets
    const multiPdfBytes = this.generateMultiPagePdf(sheets, {
      ...options,
      totalSheets
    });
    const multiFilename = `Maquette_Complete_Toutes_Planches_1_${scale}.pdf`;
    zip.file(multiFilename, multiPdfBytes, { binary: true });

    // 3. Add fabrication and assembly guide README
    const readmeContent = this.generateReadmeText(packedResult, options);
    zip.file('GUIDE_DECOUPE_ET_MONTAGE.txt', readmeContent);

    // 4. Optionally include laser SVG inside the zip
    if (svgContent) {
      zip.file(`Maquette_Decoupe_Laser_Vectoriel_1_${scale}.svg`, svgContent);
    }

    // Generate compressed ZIP blob
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return zipBlob;
  }

  /**
   * Generates a clear, professional technical summary and assembly manual
   */
  static generateReadmeText(packedResult, options = {}) {
    const {
      modelName = 'Maquette Architecturale',
      scale = 200,
      thickness = 1.5,
      materialStyle = 'Carton / Bois',
      formatLabel = 'A3'
    } = options;

    const totalSheets = packedResult.sheets.length;
    let totalPieces = 0;
    for (const sheet of packedResult.sheets) {
      totalPieces += sheet.items ? sheet.items.length : 0;
    }

    return `======================================================================
  ARCHIPOLY — MAQUETTE SLICER STUDIO
  DOSSIER DE FABRICATION & DECOUPE VECTORIELLE
======================================================================

PROJET : ${modelName}
DATE D'EXPORT : ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}
ECHELLE MAQUETTE : 1:${scale} (1 cm sur maquette = ${(scale / 100).toFixed(2)} m réels)
MATERIAU CONSEILLE : ${materialStyle}
EPAISSEUR DE PLAQUE : ${thickness} mm
FORMAT DE PLANCHE : ${formatLabel.toUpperCase()} (${packedResult.sheetWidth} × ${packedResult.sheetHeight} mm)
NOMBRE DE PLANCHES : ${totalSheets} planche(s)
NOMBRE TOTAL DE STRATES : ${totalPieces} pièce(s)

----------------------------------------------------------------------
1. CONTENU DU DOSSIER ZIP
----------------------------------------------------------------------
- Planche_01_${formatLabel.toUpperCase()}_...pdf : Fichiers PDF individuels calibrés à l'échelle 1:1.
- Maquette_Complete_Toutes_Planches_1_${scale}.pdf : Document multi-pages regroupant l'ensemble des planches.
- Maquette_Decoupe_Laser_Vectoriel_...svg : Fichier vectoriel SVG pour les logiciels de découpe laser (LightBurn, RDWorks, Trotec JobControl).
- GUIDE_DECOUPE_ET_MONTAGE.txt : Ce fichier technique.

----------------------------------------------------------------------
2. CONSIGNES D'IMPRESSION (TRACAGE PAPIER / MANUEL)
----------------------------------------------------------------------
1. Lors de l'impression des PDF (Acrobat Reader, navigateur ou traceur), 
   choisissez IMPERATIVEMENT "Échelle 100%" ou "Taille réelle" (Actual size).
   Ne cochez SURTOUT PAS "Ajuster à la page" (Fit to page), cela fausserait l'échelle.
2. CONTRÔLE D'ÉCHELLE PHYSIQUE :
   En bas à droite de chaque planche se trouve une règle graduée de 50 mm.
   Mesurez cette barre avec un réglet métallique après impression.
   Elle doit mesurer exactement 50,0 mm.

----------------------------------------------------------------------
3. PARAMETRAGE MACHINE DE DECOUPE LASER (FABLAB / ATELIER)
----------------------------------------------------------------------
Les tracés vectoriels sont organisés selon le code couleur standardisé :
- ROUGE VIF (#FF0000) : CONTOURS DE DECOUPE (Cut Lines)
  -> Épaisseur : 0.1 mm (Hairline). Mode : Découpe laser traversante.
- BLEU CYAN (#0066FF) : REPERES D'ENCOLLAGE EN POINTILLES (Alignment Guides)
  -> Silhouette de la couche N+1 projetée sur la couche N.
  -> Mode : Gravure vectorielle superficielle ou marquage rapide à faible puissance.
- NOIR / CHARCOAL (#222222) : NUMEROTATION & ALTIMETRIE (Engraving / Labels)
  -> Croix de centrage et numéro de strate (ex. L12, +18.0mm).
  -> Mode : Gravure laser vectorielle ou texte de repérage manuel.

----------------------------------------------------------------------
4. GUIDE D'ASSEMBLAGE COUCHE PAR COUCHE
----------------------------------------------------------------------
1. Triez les pièces découpées par numéro de strate croissant (L1 = couche la plus basse, socle).
2. Fixez la couche L1 sur un carton de fond ou socle rigide.
3. Pour chaque couche N suivante :
   - Positionnez la pièce N sur les repères bleus gravés sur la pièce N-1.
   - Vérifiez l'alignement avec les croix de centrage.
   - Appliquez un film fin de colle blanche (colle vinylique ou colle spéciale maquette).
   - Pressez uniformément quelques secondes.
4. Laissez sécher l'ensemble sous un poids plat pour éviter tout gondolage.

Généré avec succès par ArchiPoly Maquette Slicer Studio.
`;
  }
}
