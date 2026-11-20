import * as THREE from "three";

const materialCache = new Map();

function material(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? 0.82}|${opts.metalness ?? 0}|${opts.emissive || ""}|${
    opts.transparent ? opts.opacity : ""
  }`;
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: Boolean(opts.transparent),
    opacity: opts.transparent ? opts.opacity ?? 0.35 : 1,
    side: opts.side ?? THREE.FrontSide,
  });
  materialCache.set(key, mat);
  return mat;
}

function shift(color, lightness = 0, saturation = 0) {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + saturation)), Math.max(0, Math.min(1, hsl.l + lightness)));
  return `#${c.getHexString()}`;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop, rBottom, h, segments, mat, x = 0, y = 0, z = 0, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function legs(group, mat, w, d, height, thickness = 0.055) {
  const inset = thickness;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(box(thickness, height, thickness, mat, sx * (w / 2 - inset), height / 2, sz * (d / 2 - inset)));
    }
  }
}

function soft(group, color, w, h, d, x, y, z, roughness = 0.92) {
  group.add(box(w, h, d, material(color, { roughness }), x, y, z));
}

function buildSofa(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const fabric = material(object.color, { roughness: 0.95 });
  const accent = material(object.accent || shift(object.color, -0.08), { roughness: 0.95 });
  const legMat = material("#4A4036", { roughness: 0.6 });
  const legH = h * 0.14;
  legs(group, legMat, w, d, legH, 0.06);
  group.add(box(w, h * 0.26, d, fabric, 0, legH + h * 0.13, 0));
  // seat cushions
  const cushionW = (w - 0.18) / 3;
  for (let i = 0; i < 3; i += 1) {
    const x = -w / 2 + 0.09 + cushionW / 2 + i * cushionW;
    group.add(box(cushionW - 0.025, h * 0.18, d * 0.66, material(shift(object.color, 0.05), { roughness: 0.98 }), x, legH + h * 0.3, d * 0.1));
  }
  // back
  group.add(box(w, h * 0.52, d * 0.2, fabric, 0, legH + h * 0.36, -d * 0.38));
  const backCushionW = (w - 0.2) / 3;
  for (let i = 0; i < 3; i += 1) {
    const x = -w / 2 + 0.1 + backCushionW / 2 + i * backCushionW;
    group.add(box(backCushionW - 0.03, h * 0.38, d * 0.16, material(shift(object.color, 0.03), { roughness: 0.98 }), x, legH + h * 0.42, -d * 0.27));
  }
  // arms
  for (const sx of [-1, 1]) {
    group.add(box(w * 0.075, h * 0.32, d, accent, sx * (w / 2 - w * 0.0375), legH + h * 0.16, 0));
  }
  // throw pillows
  group.add(box(w * 0.16, h * 0.2, d * 0.12, material(shift(object.color, 0.14), { roughness: 0.98 }), -w * 0.3, legH + h * 0.5, -d * 0.19, { z: 0.18 }));
  return group;
}

function buildArmchair(object, reading = false) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const fabric = material(object.color, { roughness: 0.95 });
  const accent = material(object.accent || shift(object.color, -0.08), { roughness: 0.95 });
  const legMat = material("#4A4036", { roughness: 0.6 });
  const legH = h * 0.16;
  legs(group, legMat, w, d, legH, 0.05);
  group.add(box(w, h * 0.24, d * 0.92, fabric, 0, legH + h * 0.12, 0));
  group.add(box(w * 0.82, h * 0.15, d * 0.62, material(shift(object.color, 0.06), { roughness: 0.98 }), 0, legH + h * 0.28, d * 0.08));
  group.add(box(w * 0.92, h * (reading ? 0.72 : 0.52), d * 0.18, accent, 0, legH + h * (reading ? 0.48 : 0.36), -d * 0.4));
  for (const sx of [-1, 1]) {
    group.add(box(w * 0.1, h * 0.28, d * 0.9, fabric, sx * (w / 2 - w * 0.05), legH + h * 0.14, 0));
  }
  return group;
}

function buildDiningChair(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const wood = material(object.color, { roughness: 0.7 });
  const seatH = h * 0.52;
  group.add(box(w, h * 0.055, d, wood, 0, seatH, 0));
  legs(group, material(shift(object.color, -0.06), { roughness: 0.7 }), w, d, seatH - h * 0.03, 0.038);
  for (const sx of [-1, 1]) {
    group.add(box(0.042, h * 0.42, 0.045, wood, sx * (w / 2 - 0.045), seatH + h * 0.2, -d / 2 + 0.04));
  }
  group.add(box(w * 0.82, h * 0.12, 0.045, wood, 0, seatH + h * 0.26, -d / 2 + 0.04));
  group.add(box(w * 0.82, h * 0.08, 0.035, wood, 0, seatH + h * 0.15, -d / 2 + 0.04));
  return group;
}

function buildOttoman(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const fabric = material(object.color, { roughness: 0.98 });
  const legMat = material("#4A4036", { roughness: 0.6 });
  group.add(box(w, h * 0.68, d, fabric, 0, h * 0.64, 0));
  group.add(box(w * 0.96, h * 0.1, d * 0.96, material(shift(object.color, 0.06)), 0, h * 0.61, 0));
  legs(group, legMat, w * 0.86, d * 0.86, h * 0.3, 0.045);
  return group;
}

function buildBed(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const frameMat = material(object.accent || shift(object.color, -0.22), { roughness: 0.65 });
  const linen = material(object.color, { roughness: 0.96 });
  const white = material("#F2EBDD", { roughness: 0.96 });
  const headH = h;
  group.add(box(w, h * 0.22, d * 0.94, frameMat, 0, h * 0.2, 0));
  group.add(box(w * 0.96, h * 0.24, d * 0.9, material("#F4EFE4", { roughness: 0.97 }), 0, h * 0.42, 0));
  // duvet
  group.add(box(w * 0.98, h * 0.1, d * 0.62, linen, 0, h * 0.56, d * 0.13));
  // pillows
  const count = w > 1.3 ? 2 : 1;
  const pw = count === 2 ? w * 0.4 : w * 0.58;
  for (let i = 0; i < count; i += 1) {
    const x = count === 1 ? 0 : (i === 0 ? -1 : 1) * w * 0.24;
    group.add(box(pw, h * 0.13, d * 0.15, white, x, h * 0.6, -d * 0.29, { x: -0.2 }));
  }
  // headboard
  group.add(box(w * 1.02, headH * 0.85, 0.07, frameMat, 0, headH * 0.5, -d / 2 + 0.02));
  return group;
}

function buildDiningTable(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const wood = material(object.color, { roughness: 0.62 });
  const dark = material(shift(object.color, -0.07), { roughness: 0.64 });
  group.add(box(w, h * 0.08, d, wood, 0, h * 0.96, 0));
  for (const sx of [-1, 1]) {
    group.add(box(w * 0.055, h * 0.92, d * 0.12, dark, sx * (w / 2 - 0.08), h * 0.46, 0));
    group.add(box(w * 0.06, h * 0.1, d * 0.7, dark, sx * (w / 2 - 0.08), h * 0.06, 0));
  }
  group.add(box(w * 0.82, h * 0.06, d * 0.1, dark, 0, h * 0.55, 0));
  return group;
}

function buildCoffeeTable(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const wood = material(object.color, { roughness: 0.6 });
  group.add(box(w, h * 0.12, d, wood, 0, h * 0.94, 0));
  group.add(box(w * 0.84, h * 0.07, d * 0.76, material(shift(object.color, 0.04), { roughness: 0.7 }), 0, h * 0.32, 0));
  legs(group, material(shift(object.color, -0.08), { roughness: 0.7 }), w, d, h * 0.88, 0.045);
  return group;
}

function buildDesk(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const wood = material(object.color, { roughness: 0.58 });
  const metal = material(object.accent || "#3F3C36", { roughness: 0.4, metalness: 0.5 });
  group.add(box(w, h * 0.08, d, wood, 0, h * 0.96, 0));
  for (const sx of [-1, 1]) {
    group.add(box(w * 0.045, h * 0.9, d * 0.92, material(shift(object.color, -0.06), { roughness: 0.65 }), sx * (w / 2 - 0.03), h * 0.45, 0));
  }
  group.add(box(w * 0.4, h * 0.5, d * 0.8, material(shift(object.color, 0.02), { roughness: 0.7 }), w * 0.18, h * 0.34, 0));
  // drawer lines and handles
  for (let i = 0; i < 2; i += 1) {
    group.add(box(w * 0.32, 0.012, 0.015, material(shift(object.color, -0.1)), w * 0.18, h * 0.38 + i * h * 0.16, d * 0.4 + 0.008));
    group.add(box(w * 0.08, 0.014, 0.014, metal, w * 0.18, h * 0.34 + i * h * 0.16, d * 0.42));
  }
  return group;
}

function buildSideTable(object, round = false) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const wood = material(object.color, { roughness: 0.55 });
  const dark = material(shift(object.color, -0.1), { roughness: 0.6 });
  if (round) {
    group.add(cyl(w / 2, w / 2, h * 0.08, 28, wood, 0, h * 0.96, 0));
    group.add(cyl(w * 0.06, w * 0.08, h * 0.86, 12, dark, 0, h * 0.46, 0));
    group.add(cyl(w * 0.32, w * 0.32, h * 0.05, 24, dark, 0, h * 0.03, 0));
  } else {
    group.add(box(w, h * 0.08, d, wood, 0, h * 0.96, 0));
    legs(group, dark, w * 0.9, d * 0.9, h * 0.9, 0.04);
    group.add(box(w * 0.7, 0.012, d * 0.7, material(shift(object.color, 0.03)), 0, h * 0.28, 0));
  }
  return group;
}

function buildWardrobe(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const body = material(object.color, { roughness: 0.62 });
  const doorMat = material(shift(object.color, 0.03), { roughness: 0.58 });
  const handle = material(object.accent || "#5A4B3A", { roughness: 0.35, metalness: 0.35 });
  group.add(box(w, h, d, body, 0, h / 2, 0));
  const doorW = w / 2 - 0.012;
  for (const sx of [-1, 1]) {
    group.add(box(doorW, h * 0.9, 0.025, doorMat, sx * (w / 4), h * 0.52, d / 2 + 0.014));
    group.add(box(0.018, h * 0.16, 0.025, handle, sx * 0.06, h * 0.52, d / 2 + 0.045));
  }
  group.add(box(w * 0.94, 0.04, d * 0.9, material(shift(object.color, -0.16)), 0, h + 0.01, 0));
  return group;
}

function buildBookshelf(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const wood = material(object.color, { roughness: 0.66 });
  const side = 0.035;
  group.add(box(side, h, d, wood, -w / 2 + side / 2, h / 2, 0));
  group.add(box(side, h, d, wood, w / 2 - side / 2, h / 2, 0));
  group.add(box(w, 0.035, d, wood, 0, h - 0.0175, 0));
  group.add(box(w, h * 0.02, d, wood, 0, h * 0.01, 0));
  group.add(box(w, h, 0.025, material(shift(object.color, -0.08)), 0, h / 2, -d / 2 + 0.012));
  const shelves = 4;
  const bookColors = ["#A8563D", "#5C7062", "#C4A15F", "#7A8791", "#E3D8C2", "#663F35"];
  for (let i = 1; i < shelves; i += 1) {
    const y = (h / shelves) * i;
    group.add(box(w - side * 2, 0.028, d * 0.94, wood, 0, y, 0));
    let x = -w / 2 + side + 0.03;
    let n = 0;
    while (x < w / 2 - side - 0.06 && n < 9) {
      const bw = 0.025 + ((i * 7 + n * 3) % 4) * 0.009;
      const bh = 0.14 + ((i * 5 + n * 11) % 6) * 0.018;
      group.add(
        box(bw, bh, d * 0.58, material(bookColors[(i + n) % bookColors.length], { roughness: 0.9 }), x, y + 0.014 + bh / 2, 0.01)
      );
      x += bw + 0.012;
      n += 1;
    }
  }
  return group;
}

function buildSideboard(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const body = material(object.color, { roughness: 0.6 });
  const doorMat = material(shift(object.color, 0.04), { roughness: 0.56 });
  const legsMat = material(object.accent || shift(object.color, -0.2), { roughness: 0.5 });
  legs(group, legsMat, w * 0.88, d * 0.86, h * 0.18, 0.045);
  group.add(box(w, h * 0.74, d, body, 0, h * 0.55, 0));
  const doorW = w / 3 - 0.015;
  for (let i = -1; i <= 1; i += 1) {
    group.add(box(doorW, h * 0.62, 0.02, doorMat, i * (w / 3), h * 0.55, d / 2 + 0.011));
    group.add(cyl(0.008, 0.008, 0.012, 8, legsMat, i * (w / 3), h * 0.57, d / 2 + 0.03, { x: Math.PI / 2 }));
  }
  group.add(box(w * 0.96, h * 0.04, d * 0.94, material(shift(object.color, -0.12)), 0, h * 0.94, 0));
  return group;
}

function buildKitchenCabinets(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const front = material(object.color, { roughness: 0.52 });
  const accent = material(object.accent || "#B08D57", { roughness: 0.3, metalness: 0.5 });
  const counter = material("#DFD8C9", { roughness: 0.4, metalness: 0.05 });
  const dark = material(shift(object.color, -0.12), { roughness: 0.7 });
  const baseH = h * 0.44;
  const toe = h * 0.045;
  group.add(box(w, baseH, d * 0.94, front, 0, toe + baseH / 2, 0.01));
  group.add(box(w * 1.02, h * 0.035, d, counter, 0, toe + baseH + h * 0.0175, 0));
  const doorCount = Math.max(2, Math.round(w / 0.6));
  const doorW = w / doorCount - 0.012;
  for (let i = 0; i < doorCount; i += 1) {
    const x = -w / 2 + doorW / 2 + 0.006 + i * (doorW + 0.012);
    group.add(box(doorW, baseH * 0.9, 0.02, material(shift(object.color, 0.03), { roughness: 0.5 }), x, toe + baseH * 0.5, d * 0.48));
    group.add(box(doorW * 0.2, 0.012, 0.016, accent, x, toe + baseH * 0.78, d * 0.495));
  }
  // upper cabinets against the wall side
  const upperY = toe + baseH + h * 0.3;
  const upperH = h * 0.3;
  const upperD = d * 0.55;
  group.add(box(w, upperH, upperD, front, 0, upperY, -d / 2 + upperD / 2 + 0.02));
  const upCount = Math.max(2, Math.round(w / 0.75));
  const upW = w / upCount - 0.012;
  for (let i = 0; i < upCount; i += 1) {
    const x = -w / 2 + upW / 2 + 0.006 + i * (upW + 0.012);
    group.add(box(upW, upperH * 0.88, 0.02, material(shift(object.color, 0.05), { roughness: 0.5 }), x, upperY, -d / 2 + upperD + 0.03));
    group.add(box(upW * 0.16, 0.012, 0.016, accent, x, upperY - upperH * 0.32, -d / 2 + upperD + 0.045));
  }
  // backsplash
  group.add(box(w, h * 0.16, 0.015, dark, 0, toe + baseH + h * 0.11, -d / 2 + 0.02));
  return group;
}

function buildKitchenIsland(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const body = material(object.color, { roughness: 0.55 });
  const top = material(object.accent || "#D9D2C2", { roughness: 0.35 });
  group.add(box(w, h * 0.82, d, body, 0, h * 0.41, 0));
  group.add(box(w * 1.05, h * 0.06, d * 1.1, top, 0, h * 0.88, 0));
  group.add(box(w * 0.92, h * 0.06, 0.02, body, 0, h * 0.2, d / 2 + 0.006));
  for (const sx of [-1, 1]) {
    group.add(box(w * 0.35, h * 0.07, d * 0.86, material(shift(object.color, -0.1), { roughness: 0.6 }), sx * w * 0.22, h * 0.62, 0));
  }
  return group;
}

function buildLamp(object, floor = true) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const metal = material(object.color, { roughness: 0.35, metalness: 0.45 });
  const shade = material(object.accent || "#EADFC8", { roughness: 0.9, emissive: "#F3E6C7", emissiveIntensity: 0.25 });
  if (floor) {
    group.add(cyl(w * 0.3, w * 0.34, 0.035, 24, metal, 0, 0.018, 0));
    group.add(cyl(0.014, 0.014, h * 0.78, 10, metal, 0, h * 0.4, 0));
    group.add(cyl(w * 0.24, w * 0.42, h * 0.2, 24, shade, 0, h * 0.86, 0));
  } else {
    group.add(cyl(w * 0.24, w * 0.3, h * 0.05, 20, metal, 0, h * 0.05, 0));
    group.add(cyl(0.015, 0.015, h * 0.38, 8, metal, 0, h * 0.26, 0));
    group.add(cyl(w * 0.26, w * 0.42, h * 0.34, 20, shade, 0, h * 0.65, 0));
  }
  return group;
}

function buildPendant(object) {
  const { w, h } = object.dims;
  const group = new THREE.Group();
  const metal = material(object.color, { roughness: 0.3, metalness: 0.5 });
  const shade = material(object.accent || "#F2E7CD", { roughness: 0.85, emissive: "#F2E7CD", emissiveIntensity: 0.3 });
  group.add(cyl(0.008, 0.008, h * 1.4, 6, metal, 0, -h * 0.9, 0));
  group.add(cyl(w * 0.2, w * 0.5, h, 24, shade, 0, -h * 0.15, 0));
  group.add(cyl(w * 0.5, w * 0.52, h * 0.06, 24, metal, 0, -h * 0.64, 0));
  return group;
}

function buildPlant(object, variant = "fig") {
  const { w, h } = object.dims;
  const group = new THREE.Group();
  const pot = material(object.accent || "#A88362", { roughness: 0.78 });
  const leaf = material(object.color, { roughness: 0.9 });
  const stem = material("#6A5843", { roughness: 0.85 });
  const potH = h * (variant === "small" ? 0.42 : 0.2);
  const potR = w * (variant === "small" ? 0.36 : 0.28);
  group.add(cyl(potR, potR * 0.78, potH, 20, pot, 0, potH / 2, 0));
  group.add(cyl(potR * 0.86, potR * 0.86, 0.02, 20, material("#6B5A45"), 0, potH - 0.005, 0));
  if (variant === "small") {
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.17, 8, 6), leaf);
      leafMesh.scale.set(1.6, 0.35, 0.8);
      leafMesh.position.set(Math.cos(angle) * w * 0.2, potH + h * 0.22 + (i % 3) * 0.035, Math.sin(angle) * w * 0.2);
      leafMesh.rotation.y = angle;
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }
    return group;
  }
  const trunkH = h - potH;
  group.add(cyl(0.018, 0.03, trunkH * 0.72, 8, stem, 0, potH + trunkH * 0.36, 0));
  if (variant === "olive") {
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + 0.4;
      const radius = w * (0.18 + (i % 3) * 0.08);
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.17, 1), leaf);
      foliage.position.set(Math.cos(angle) * radius, potH + trunkH * (0.55 + (i % 4) * 0.09), Math.sin(angle) * radius);
      foliage.scale.set(1.2, 0.55, 1.2);
      foliage.castShadow = true;
      group.add(foliage);
    }
  } else {
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.22, 10, 7), leaf);
      leafMesh.scale.set(0.85, 0.28, 1.35);
      leafMesh.position.set(Math.cos(angle) * w * 0.16, potH + trunkH * (0.5 + (i % 3) * 0.12), Math.sin(angle) * w * 0.16);
      leafMesh.rotation.set(0.12 * (i % 2 ? 1 : -1), angle, 0.2);
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + 0.5;
      const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.16, 8, 6), leaf);
      leafMesh.scale.set(1.3, 0.24, 0.8);
      leafMesh.position.set(Math.cos(angle) * w * 0.24, potH + trunkH * (0.75 + (i % 2) * 0.1), Math.sin(angle) * w * 0.24);
      leafMesh.rotation.set(0.2, angle, 0.3);
      leafMesh.castShadow = true;
      group.add(leafMesh);
    }
  }
  return group;
}

function buildRug(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const base = material(object.color, { roughness: 1 });
  const border = material(object.accent || shift(object.color, -0.08), { roughness: 1 });
  group.add(box(w, Math.max(0.012, h), d, base, 0, Math.max(0.006, h / 2), 0));
  const inset = 0.07;
  const line = 0.035;
  group.add(box(w - inset * 2, h + 0.002, line, border, 0, h / 2 + 0.002, d / 2 - inset));
  group.add(box(w - inset * 2, h + 0.002, line, border, 0, h / 2 + 0.002, -d / 2 + inset));
  group.add(box(line, h + 0.002, d - inset * 2, border, w / 2 - inset, h / 2 + 0.002, 0));
  group.add(box(line, h + 0.002, d - inset * 2, border, -w / 2 + inset, h / 2 + 0.002, 0));
  return group;
}

function buildWallArt(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const frame = material(object.color, { roughness: 0.55 });
  const canvasMat = material(object.accent || "#E7DECD", { roughness: 0.95 });
  const accentMat = material(shift(object.accent || "#E7DECD", -0.18), { roughness: 0.9 });
  group.add(box(w, h, Math.max(0.03, d), frame, 0, 0, 0));
  group.add(box(w * 0.88, h * 0.86, 0.012, canvasMat, 0, 0, d / 2 + 0.008));
  group.add(box(w * 0.34, h * 0.5, 0.013, accentMat, -w * 0.15, -h * 0.02, d / 2 + 0.015, { z: 0.06 }));
  group.add(box(w * 0.2, h * 0.3, 0.013, material(shift(object.color, 0.12), { roughness: 0.9 }), w * 0.18, h * 0.16, d / 2 + 0.016));
  return group;
}

function buildMirror(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const frame = material(object.color, { roughness: 0.5 });
  const glass = material(object.accent || "#DDE3E2", { roughness: 0.08, metalness: 0.55 });
  const glow = material("#F5F7F5", { roughness: 0.2, emissive: "#E8EDEC", emissiveIntensity: 0.35 });
  group.add(box(w, h, d, frame, 0, 0, 0));
  group.add(box(w * 0.9, h * 0.94, 0.012, glass, 0, 0, d / 2 + 0.007));
  group.add(box(w * 0.36, h * 0.55, 0.013, glow, -w * 0.2, h * 0.12, d / 2 + 0.012, { z: -0.2 }));
  return group;
}

function buildClock(object) {
  const { w, d, h } = object.dims;
  const group = new THREE.Group();
  const rim = material(object.color, { roughness: 0.4, metalness: 0.35 });
  const face = material(object.accent || "#EDE5D4", { roughness: 0.75 });
  const hand = material("#2E2C27", { roughness: 0.5 });
  const radius = Math.min(w, h) / 2;
  group.add(cyl(radius, radius, d, 32, rim, 0, 0, 0, { x: Math.PI / 2 }));
  group.add(cyl(radius * 0.86, radius * 0.86, d * 0.35, 32, face, 0, 0, d * 0.34, { x: Math.PI / 2 }));
  // markers
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const r = radius * 0.7;
    group.add(box(0.008, i % 3 === 0 ? 0.03 : 0.016, 0.006, hand, Math.sin(angle) * r, Math.cos(angle) * r, d * 0.53, { z: -angle }));
  }
  group.add(box(0.012, radius * 0.52, 0.008, hand, 0, radius * 0.22, d * 0.54, { z: -0.5 }));
  group.add(box(0.011, radius * 0.36, 0.008, hand, radius * 0.12, radius * 0.12, d * 0.55, { z: 1.05 }));
  group.add(cyl(0.018, 0.018, 0.012, 12, hand, 0, 0, d * 0.56, { x: Math.PI / 2 }));
  return group;
}

export function buildFurniture(object) {
  const type = object.type;
  let group;
  switch (type) {
    case "sofa":
      group = buildSofa(object);
      break;
    case "armchair":
      group = buildArmchair(object);
      break;
    case "readingChair":
      group = buildArmchair(object, true);
      break;
    case "diningChair":
      group = buildDiningChair(object);
      break;
    case "ottoman":
      group = buildOttoman(object);
      break;
    case "queenBed":
    case "singleBed":
    case "daybed":
      group = buildBed(object);
      break;
    case "diningTable":
      group = buildDiningTable(object);
      break;
    case "coffeeTable":
      group = buildCoffeeTable(object);
      break;
    case "desk":
      group = buildDesk(object);
      break;
    case "sideTable":
      group = buildSideTable(object);
      break;
    case "roundTable":
      group = buildSideTable(object, true);
      break;
    case "wardrobe":
      group = buildWardrobe(object);
      break;
    case "bookshelf":
      group = buildBookshelf(object);
      break;
    case "sideboard":
      group = buildSideboard(object);
      break;
    case "kitchenCabinets":
      group = buildKitchenCabinets(object);
      break;
    case "kitchenIsland":
      group = buildKitchenIsland(object);
      break;
    case "floorLamp":
      group = buildLamp(object, true);
      break;
    case "tableLamp":
      group = buildLamp(object, false);
      break;
    case "pendant":
      group = buildPendant(object);
      break;
    case "plantFig":
      group = buildPlant(object, "fig");
      break;
    case "oliveTree":
      group = buildPlant(object, "olive");
      break;
    case "smallPlant":
      group = buildPlant(object, "small");
      break;
    case "rug":
      group = buildRug(object);
      break;
    case "wallArt":
      group = buildWallArt(object);
      break;
    case "mirror":
      group = buildMirror(object);
      break;
    case "clock":
      group = buildClock(object);
      break;
    default:
      group = new THREE.Group();
      break;
  }

  if (object.placement === "wall" || object.placement === "ceiling") {
    // Wall/ceiling items are modelled around their centre.
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }
  group.userData.objectId = object.id;
  group.userData.roomId = object.roomId;
  group.userData.kind = "object";
  group.traverse((child) => {
    child.userData.objectId = object.id;
    child.userData.roomId = object.roomId;
    child.userData.kind = "object";
  });
  return group;
}

export function disposeObject3D(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      // Shared materials are cached; only dispose ones not in cache.
      for (const mat of materials) {
        if (![...materialCache.values()].includes(mat)) mat.dispose();
      }
    }
    if (child.isCSS2DObject) child.element?.remove();
  });
}

export { material as furnitureMaterial, shift as shiftColor };
