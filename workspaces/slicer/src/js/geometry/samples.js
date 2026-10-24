/**
 * Built-in Architectural 3D Sample Presets
 * Maquette Slicer Studio - Professional Grade Architectural Templates
 */

import * as THREE from 'three';

export class ModelPresets {
  /**
   * 1. Topographie de Terrain Architectural
   * Procedural stepped site terrain with natural hills, contoured ridges,
   * winding access roadway cut, and a leveled dual-tier building platform.
   * Watertight solid manifold suitable for laser slicing (approx 60m x 45m x 16m).
   */
  static createTopography() {
    const width = 60;
    const depth = 45;
    const segX = 75;
    const segZ = 60;

    const geometry = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Multi-frequency natural terrain harmonics
      let h = 0;
      // Main rolling ridge in the North-East
      h += 6.5 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.06);
      // Secondary dramatic knoll in the South-East
      h += 5.5 * Math.exp(-((x - 14) ** 2 + (z - 8) ** 2) / 160);
      // Gentle undulating slope
      h += 3.0 * Math.sin(x * 0.025 + z * 0.04);
      // High plateau in the West
      h += 4.5 * Math.exp(-((x + 16) ** 2 + (z + 10) ** 2) / 150);

      // Winding architectural access road cut into the hillside
      // A smooth curved path: x = 6 * sin(z * 0.12) - 4
      const roadX = 6.0 * Math.sin(z * 0.12) - 4.0;
      const distRoad = Math.abs(x - roadX);
      if (distRoad < 4.5 && z > -15 && z < 18) {
        const roadBlend = Math.max(0, 1 - distRoad / 4.5);
        // Road gently rises from 3.0m to 7.0m along Z
        const roadElevation = 3.0 + ((z + 15) / 33) * 4.0;
        h = h * (1 - roadBlend) + roadElevation * roadBlend;
      }

      // Leveled building plateau for architectural project (approx 18m x 14m)
      const distPlateau1 = Math.sqrt((x + 8) ** 2 + (z - 4) ** 2);
      if (distPlateau1 < 11) {
        const blend = Math.max(0, Math.min(1, (11 - distPlateau1) / 4.5));
        h = h * (1 - blend) + 6.8 * blend;
      }

      // Secondary scenic terrace plateau overlooking the valley
      const distPlateau2 = Math.sqrt((x - 12) ** 2 + (z + 10) ** 2);
      if (distPlateau2 < 8) {
        const blend2 = Math.max(0, Math.min(1, (8 - distPlateau2) / 3.5));
        h = h * (1 - blend2) + 4.2 * blend2;
      }

      // Carved retention water basin / creek depression
      const distBasin = Math.sqrt((x - 16) ** 2 + (z - 12) ** 2);
      if (distBasin < 9) {
        const basinBlend = Math.max(0, Math.min(1, (9 - distBasin) / 3.0));
        h = h * (1 - basinBlend) + 1.2 * basinBlend;
      }

      // Base elevation shift to ensure positive height above ground plinth
      h = Math.max(1.0, h + 5.0);

      pos.setY(i, h);
    }

    geometry.computeVertexNormals();

    // Close terrain with solid side skirts and bottom plate
    const solidGeom = this.addBaseToTerrain(geometry, width, depth, segX, segZ);

    const material = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false
    });

    const mesh = new THREE.Mesh(solidGeom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = "Preset_Topographie_Site";
    mesh.userData.defaultUnit = "m";
    mesh.userData.defaultScale = 200;
    mesh.userData.defaultThickness = 1.5;

    return mesh;
  }

  /**
   * Helper to close terrain sides and base into a solid manifold mesh.
   */
  static addBaseToTerrain(topGeom, width, depth, segX, segZ) {
    const topPos = topGeom.attributes.position;
    const vertices = [];
    const indices = [];

    // 1. Copy top vertices
    for (let i = 0; i < topPos.count; i++) {
      vertices.push(topPos.getX(i), topPos.getY(i), topPos.getZ(i));
    }

    // 2. Top faces
    const topIndices = topGeom.index;
    for (let i = 0; i < topIndices.count; i++) {
      indices.push(topIndices.getX(i));
    }

    const nx = segX + 1;
    const nz = segZ + 1;
    const topCount = topPos.count;

    // 3. Bottom vertices (Y = 0)
    for (let i = 0; i < topPos.count; i++) {
      vertices.push(topPos.getX(i), 0, topPos.getZ(i));
    }

    // 4. Bottom faces (reversed winding for downward normal)
    for (let i = 0; i < topIndices.count; i += 3) {
      indices.push(topCount + topIndices.getX(i + 2));
      indices.push(topCount + topIndices.getX(i + 1));
      indices.push(topCount + topIndices.getX(i));
    }

    // 5. Side skirts along 4 boundaries:
    // South edge (z = -depth/2, j = 0)
    for (let i = 0; i < segX; i++) {
      const t1 = i;
      const t2 = i + 1;
      const b1 = topCount + t1;
      const b2 = topCount + t2;
      indices.push(t1, b1, t2);
      indices.push(t2, b1, b2);
    }
    // North edge (z = +depth/2, j = segZ)
    const northOffset = segZ * nx;
    for (let i = 0; i < segX; i++) {
      const t1 = northOffset + i;
      const t2 = northOffset + i + 1;
      const b1 = topCount + t1;
      const b2 = topCount + t2;
      indices.push(t1, t2, b1);
      indices.push(t2, b2, b1);
    }
    // West edge (x = -width/2, i = 0)
    for (let j = 0; j < segZ; j++) {
      const t1 = j * nx;
      const t2 = (j + 1) * nx;
      const b1 = topCount + t1;
      const b2 = topCount + t2;
      indices.push(t1, t2, b1);
      indices.push(t2, b2, b1);
    }
    // East edge (x = +width/2, i = segX)
    for (let j = 0; j < segZ; j++) {
      const t1 = j * nx + segX;
      const t2 = (j + 1) * nx + segX;
      const b1 = topCount + t1;
      const b2 = topCount + t2;
      indices.push(t1, b1, t2);
      indices.push(t2, b1, b2);
    }

    const solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    solid.setIndex(indices);
    solid.computeVertexNormals();
    return solid;
  }

  /**
   * 2. Villa Contemporaine en Porte-à-Faux
   * Modernist architectural villa featuring stepped plinth, reflecting pool,
   * structural pilotis columns, ground-floor living hall with courtyard void,
   * dramatic 5-meter cantilevered first floor with terrace, and rooftop pergola.
   */
  static createArchitecturalVilla() {
    const group = new THREE.Group();
    group.name = "Preset_Villa_Architecte";
    group.userData.defaultUnit = "m";
    group.userData.defaultScale = 100;
    group.userData.defaultThickness = 2.0;

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.55,
      metalness: 0.05
    });

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xc28e5b,
      roughness: 0.7,
      metalness: 0.02
    });

    const darkCoreMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.1
    });

    // Helper to add clean mesh to group
    function addBox(w, h, d, x, y, z, mat = concreteMat, name = "Box") {
      const geom = new THREE.BoxGeometry(w, h, d);
      geom.translate(x, y + h / 2, z);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }

    // A. Landscaped Podium & Entrance Terrace (Y: 0 to 1.4m)
    addBox(38, 1.2, 26, 0, 0, 0, concreteMat, "Socle_Terrasse_Principal");
    // Sunken water garden / reflecting pool basin perimeter
    addBox(14, 0.4, 8, 8, 0.8, 6, darkCoreMat, "Bassin_Miroir_Fond");
    // Entrance stairs (3 broad cascading steps)
    addBox(7, 0.3, 2.5, -16, 0.3, 10, concreteMat, "Escalier_Niveau_1");
    addBox(7, 0.3, 1.8, -16, 0.6, 9.5, concreteMat, "Escalier_Niveau_2");
    addBox(7, 0.3, 1.0, -16, 0.9, 9.0, concreteMat, "Escalier_Niveau_3");

    // B. Ground Floor (Rez-de-chaussée - Y: 1.2m to 4.8m)
    // Main living room wing (glazed pavilion)
    addBox(19, 3.4, 10, -5.5, 1.2, 2, concreteMat, "RDC_Sejour_Principal");
    // Central service core & fireplace mass (dark textured stone)
    addBox(7, 3.8, 13, 8.5, 1.2, -1.5, darkCoreMat, "RDC_Noyau_Services");
    // Kitchen and dining pavilion
    addBox(11, 3.4, 7, -1.5, 1.2, -7.5, concreteMat, "RDC_Cuisine_Salle_Manger");

    // Structural pilotis / columns (0.5m x 0.5m x 3.4m) elevating the cantilever
    const columnCoords = [
      [-14, 8], [-9, 8], [-4, 8],
      [-14, -6], [-9, -6], [-4, -6]
    ];
    columnCoords.forEach(([cx, cz], idx) => {
      addBox(0.6, 3.4, 0.6, cx, 1.2, cz, darkCoreMat, `Piloti_Structure_${idx + 1}`);
    });

    // C. Cantilevered First Floor (Étage en Porte-à-Faux - Y: 4.6m to 8.2m)
    // Floor slab extending 5m into dramatic cantilever over garden
    addBox(35, 0.6, 16, -2.5, 4.6, 0.5, concreteMat, "Dalle_Porte_A_Faux");
    // Upper bedroom suites volume
    addBox(24, 3.2, 11, -3, 5.2, 0, concreteMat, "Etage_Chambres");
    // Master suite cantilever projection
    addBox(10, 3.0, 7, -10, 5.2, 3, concreteMat, "Etage_Suite_Parentale");
    // Open terrace balustrade / parapet (acrotère de sécurité)
    addBox(10, 0.9, 0.3, 8, 5.2, 7.5, concreteMat, "Garde_Corps_Sud");
    addBox(0.3, 0.9, 13, 13, 5.2, 1, concreteMat, "Garde_Corps_Est");

    // D. Rooftop Penthouse & Pergola (Y: 8.2m to 11.2m)
    // Penthouse studio / access core
    addBox(10, 2.6, 7, 0, 8.4, -1, concreteMat, "Rooftop_Studio_Penthouse");
    // Pergola sunshade structural beams (timber louvers)
    for (let k = -3; k <= 3; k++) {
      addBox(0.25, 0.45, 9, -6 + k * 1.6, 10.4, 2, woodMat, `Pergola_Lame_${k + 4}`);
    }
    // Main pergola support beam
    addBox(11.5, 0.35, 0.4, -6, 10.6, 6.3, woodMat, "Pergola_Poutre_Support");

    return group;
  }

  /**
   * 3. Amphithéâtre Urbain Classique
   * Solid tiered semicircular seating (cavea) with 3 radial access stairways (vomitoria),
   * central semicircular orchestra stage, and monumental scenic colonnade backdrop (scaenae frons).
   */
  static createAmphitheater() {
    const group = new THREE.Group();
    group.name = "Preset_Amphitheatre";
    group.userData.defaultUnit = "m";
    group.userData.defaultScale = 100;
    group.userData.defaultThickness = 1.5;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xa8a29e,
      roughness: 0.75,
      metalness: 0.05
    });

    const darkGraniteMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.65,
      metalness: 0.1
    });

    // 1. Base podium foundation (semicircular slab + stage terrace)
    const baseGeom = new THREE.CylinderGeometry(23, 24, 1.2, 54, 1, false, 0, Math.PI);
    baseGeom.rotateY(-Math.PI);
    baseGeom.translate(0, 0.6, 0);
    const baseMesh = new THREE.Mesh(baseGeom, stoneMat);
    baseMesh.name = "Amphi_Socle_Principal";
    group.add(baseMesh);

    // Stage terrace rear foundation
    const stagePlinthGeom = new THREE.BoxGeometry(40, 1.2, 10);
    stagePlinthGeom.translate(0, 0.6, 4.5);
    const stagePlinth = new THREE.Mesh(stagePlinthGeom, stoneMat);
    stagePlinth.name = "Amphi_Fondation_Scene";
    group.add(stagePlinth);

    // 2. Central Orchestra (semi-circular stage floor at Y = 1.2 to 1.8m)
    const orchGeom = new THREE.CylinderGeometry(7.2, 7.2, 0.6, 40, 1, false, 0, Math.PI);
    orchGeom.rotateY(-Math.PI);
    orchGeom.translate(0, 1.5, 0);
    const orchMesh = new THREE.Mesh(orchGeom, darkGraniteMat);
    orchMesh.name = "Amphi_Orchestre_Central";
    group.add(orchMesh);

    // 3. Solid Seating Tiers (Cavea)
    // 9 stepped concentric rings with 3 radial vomitoria stair gaps at -50°, 0°, +50°
    const tierCount = 9;
    const startRadius = 7.5;
    const tierTread = 1.45;
    const tierRiser = 0.85;

    // 4 angular seating sectors separated by vomitoria (stairs)
    // vomitoria at -48°..-42°, -3°..+3°, +42°..+48°
    const sectors = [
      { start: -Math.PI * 0.96, end: -Math.PI * 0.54 },
      { start: -Math.PI * 0.46, end: -Math.PI * 0.04 },
      { start: Math.PI * 0.04, end: Math.PI * 0.46 },
      { start: Math.PI * 0.54, end: Math.PI * 0.96 }
    ];

    for (let t = 0; t < tierCount; t++) {
      const innerR = startRadius + t * tierTread;
      const outerR = innerR + tierTread;
      const tierH = 1.2 + (t + 1) * tierRiser;

      for (let s = 0; s < sectors.length; s++) {
        const { start, end } = sectors[s];
        const span = end - start;

        // Solid manifold sector wedge using ExtrudeGeometry on 2D shape
        const shape = new THREE.Shape();
        const steps = 14;
        // Outer arc
        for (let i = 0; i <= steps; i++) {
          const a = start + (i / steps) * span;
          const x = outerR * Math.cos(a);
          const y = outerR * Math.sin(a);
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        // Inner arc
        for (let i = steps; i >= 0; i--) {
          const a = start + (i / steps) * span;
          const x = innerR * Math.cos(a);
          const y = innerR * Math.sin(a);
          shape.lineTo(x, y);
        }
        shape.closePath();

        const extrudeGeom = new THREE.ExtrudeGeometry(shape, {
          depth: tierH,
          bevelEnabled: false
        });
        // Rotate so depth extrudes along Y (upwards)
        extrudeGeom.rotateX(-Math.PI / 2);
        extrudeGeom.rotateY(-Math.PI / 2);

        const tierMesh = new THREE.Mesh(extrudeGeom, stoneMat);
        tierMesh.name = `Gradin_T${t + 1}_Secteur_${s + 1}`;
        tierMesh.castShadow = true;
        tierMesh.receiveShadow = true;
        group.add(tierMesh);
      }
    }

    // 4. Monumental Stage Backdrop Wall (Scaenae Frons)
    const wallGeom = new THREE.BoxGeometry(34, 8.5, 3.2);
    wallGeom.translate(0, 5.45, 6.0);
    const wallMesh = new THREE.Mesh(wallGeom, stoneMat);
    wallMesh.name = "Scene_Mur_Monumental";
    group.add(wallMesh);

    // Central Royal Portal archway opening
    const portalGeom = new THREE.BoxGeometry(6.5, 5.0, 3.6);
    portalGeom.translate(0, 3.7, 6.0);
    // Side portal wings
    const sideWallLGeom = new THREE.BoxGeometry(4.0, 7.5, 5.0);
    sideWallLGeom.translate(-15, 4.95, 4.5);
    const sideWallRGeom = new THREE.BoxGeometry(4.0, 7.5, 5.0);
    sideWallRGeom.translate(15, 4.95, 4.5);
    group.add(new THREE.Mesh(sideWallLGeom, stoneMat));
    group.add(new THREE.Mesh(sideWallRGeom, stoneMat));

    // Classical decorative stage columns (colonnade proscenium)
    for (let c = -4; c <= 4; c++) {
      if (Math.abs(c) === 1) continue; // skip central portal entrance
      const colGeom = new THREE.CylinderGeometry(0.45, 0.5, 7.2, 16);
      colGeom.translate(c * 3.4, 4.8, 4.2);
      const colMesh = new THREE.Mesh(colGeom, stoneMat);
      colMesh.name = `Colonne_Scene_${c + 5}`;
      group.add(colMesh);
    }

    // Stage cornice / entablature roof
    const entablatureGeom = new THREE.BoxGeometry(36, 0.8, 4.5);
    entablatureGeom.translate(0, 9.8, 5.5);
    group.add(new THREE.Mesh(entablatureGeom, darkGraniteMat));

    return group;
  }

  /**
   * 4. Pavillon Sculptural Paramétrique (Nouveau Preset Pro)
   * Organic undulating timber/concrete vaulted canopy resting on 4 sculptural footing piers,
   * over a terraced architectural plinth with central oculus skylight and structural lamella ribs.
   */
  static createParametricPavilion() {
    const group = new THREE.Group();
    group.name = "Preset_Pavillon_Parametrique";
    group.userData.defaultUnit = "m";
    group.userData.defaultScale = 100;
    group.userData.defaultThickness = 1.5;

    const timberMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.65,
      metalness: 0.05
    });

    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      metalness: 0.1
    });

    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.6,
      metalness: 0.05
    });

    // 1. Concentric Stepped Architectural Plinth (Socle en gradins)
    const plinthLevels = [
      { w: 38, d: 28, h: 0.5, y: 0 },
      { w: 35, d: 25, h: 0.5, y: 0.5 },
      { w: 32, d: 22, h: 0.6, y: 1.0 }
    ];
    plinthLevels.forEach((lvl, i) => {
      const g = new THREE.BoxGeometry(lvl.w, lvl.h, lvl.d);
      g.translate(0, lvl.y + lvl.h / 2, 0);
      const m = new THREE.Mesh(g, plinthMat);
      m.name = `Socle_Podium_Niveau_${i + 1}`;
      group.add(m);
    });

    // 2. 4 Sculptural Anchor Piers (Culées d'ancrage en coins)
    const pierCoords = [
      [-13, -8.5], [13, -8.5],
      [-13, 8.5], [13, 8.5]
    ];
    pierCoords.forEach(([px, pz], idx) => {
      // Tapered organic column pier
      const pierGeom = new THREE.CylinderGeometry(1.6, 2.4, 3.8, 16);
      pierGeom.translate(px, 1.6 + 1.9, pz);
      const pier = new THREE.Mesh(pierGeom, timberMat);
      pier.name = `Culee_Ancrage_${idx + 1}`;
      group.add(pier);
    });

    // 3. Double-curved vaulted parametric canopy shell (Watertight manifold buffer geometry)
    const gridU = 36;
    const gridV = 28;
    const spanX = 29;
    const spanZ = 20;

    // Mathematical surface function: double-curved hyperbolic vault with oculus and edge arches
    function evaluateCanopy(u, v, isTop) {
      const x = (u - 0.5) * spanX;
      const z = (v - 0.5) * spanZ;
      const nx = x / (spanX * 0.5); // -1 to +1
      const nz = z / (spanZ * 0.5); // -1 to +1

      // Central vault reaches ~9.5m, edge arches reach ~5.5m, corners touch piers at ~4.8m
      const rCornerSq = (nx ** 2 + nz ** 2) / 2;
      const archFactor = (Math.cos(nx * Math.PI * 0.5) ** 0.8) * (Math.cos(nz * Math.PI * 0.5) ** 0.8);
      
      let y = 4.8 + 4.8 * archFactor - 0.9 * rCornerSq;

      // Central oculus void subtle upward lip
      const distCenter = Math.sqrt(nx ** 2 + nz ** 2);
      if (distCenter < 0.28) {
        y += 0.3 * (1 - distCenter / 0.28);
      }

      // Shell thickness = 0.55m
      const thickness = isTop ? 0.28 : -0.28;
      return [x, y + thickness, z];
    }

    // Build top and bottom quad surfaces and connect side skirts
    const vertices = [];
    const indices = [];

    // Top surface vertices
    for (let j = 0; j <= gridV; j++) {
      for (let i = 0; i <= gridU; i++) {
        const [x, y, z] = evaluateCanopy(i / gridU, j / gridV, true);
        vertices.push(x, y, z);
      }
    }

    const rowCount = gridU + 1;
    const topOffset = 0;
    const bottomOffset = (gridU + 1) * (gridV + 1);

    // Top surface faces
    for (let j = 0; j < gridV; j++) {
      for (let i = 0; i < gridU; i++) {
        const a = topOffset + j * rowCount + i;
        const b = topOffset + j * rowCount + (i + 1);
        const c = topOffset + (j + 1) * rowCount + i;
        const d = topOffset + (j + 1) * rowCount + (i + 1);
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // Bottom surface vertices
    for (let j = 0; j <= gridV; j++) {
      for (let i = 0; i <= gridU; i++) {
        const [x, y, z] = evaluateCanopy(i / gridU, j / gridV, false);
        vertices.push(x, y, z);
      }
    }

    // Bottom surface faces (reversed winding)
    for (let j = 0; j < gridV; j++) {
      for (let i = 0; i < gridU; i++) {
        const a = bottomOffset + j * rowCount + i;
        const b = bottomOffset + j * rowCount + (i + 1);
        const c = bottomOffset + (j + 1) * rowCount + i;
        const d = bottomOffset + (j + 1) * rowCount + (i + 1);
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    // Perimeter boundary skirts to make the canopy solid watertight
    // 1. South edge (j = 0)
    for (let i = 0; i < gridU; i++) {
      const t1 = topOffset + i;
      const t2 = topOffset + (i + 1);
      const b1 = bottomOffset + i;
      const b2 = bottomOffset + (i + 1);
      indices.push(t1, b1, t2);
      indices.push(t2, b1, b2);
    }
    // 2. North edge (j = gridV)
    const nTop = topOffset + gridV * rowCount;
    const nBot = bottomOffset + gridV * rowCount;
    for (let i = 0; i < gridU; i++) {
      const t1 = nTop + i;
      const t2 = nTop + (i + 1);
      const b1 = nBot + i;
      const b2 = nBot + (i + 1);
      indices.push(t1, t2, b1);
      indices.push(t2, b2, b1);
    }
    // 3. West edge (i = 0)
    for (let j = 0; j < gridV; j++) {
      const t1 = topOffset + j * rowCount;
      const t2 = topOffset + (j + 1) * rowCount;
      const b1 = bottomOffset + j * rowCount;
      const b2 = bottomOffset + (j + 1) * rowCount;
      indices.push(t1, t2, b1);
      indices.push(t2, b2, b1);
    }
    // 4. East edge (i = gridU)
    for (let j = 0; j < gridV; j++) {
      const t1 = topOffset + j * rowCount + gridU;
      const t2 = topOffset + (j + 1) * rowCount + gridU;
      const b1 = bottomOffset + j * rowCount + gridU;
      const b2 = bottomOffset + (j + 1) * rowCount + gridU;
      indices.push(t1, b1, t2);
      indices.push(t2, b1, b2);
    }

    const canopyGeom = new THREE.BufferGeometry();
    canopyGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    canopyGeom.setIndex(indices);
    canopyGeom.computeVertexNormals();

    const canopyMesh = new THREE.Mesh(canopyGeom, timberMat);
    canopyMesh.name = "Pavillon_Coque_Voûte";
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    group.add(canopyMesh);

    // 4. Structural Lamella Grid Ribs (Nervures porteuses)
    // 7 transverse architectural ribs running along Z
    for (let r = -3; r <= 3; r++) {
      const ribX = r * 3.8;
      const ribBox = new THREE.BoxGeometry(0.35, 1.4, 21);
      // Follow the vault arch height
      const archH = 8.8 * (Math.cos((ribX / (spanX * 0.5)) * Math.PI * 0.5) ** 0.8);
      ribBox.translate(ribX, 1.5 + archH * 0.85, 0);
      const rMesh = new THREE.Mesh(ribBox, ribMat);
      rMesh.name = `Nervure_Transversale_${r + 4}`;
      group.add(rMesh);
    }

    // Central Oculus Skylight Ring (Anneau du puits de lumière)
    const oculusGeom = new THREE.CylinderGeometry(3.2, 3.2, 0.7, 32, 1, true);
    oculusGeom.translate(0, 9.7, 0);
    const oculusMesh = new THREE.Mesh(oculusGeom, ribMat);
    oculusMesh.name = "Pavillon_Oculus_Zenithal";
    group.add(oculusMesh);

    return group;
  }
}
