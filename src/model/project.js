import { CATALOG_BY_ID, SURFACE_PALETTES } from "../data/catalog.js";
import { clamp, deepClone, uid } from "../util.js";
import { metersPerUnit } from "./units.js";

const WALLS = ["n", "e", "s", "w"];
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const WALL_INSET = 0.035;

function normalizeRoomWalls(raw) {
  const walls = {};
  for (const wall of WALLS) walls[wall] = raw?.[wall] !== false;
  return walls;
}

export function defaultMaterial(surface = "wall", index = 0) {
  const palette = SURFACE_PALETTES[surface] || SURFACE_PALETTES.wall;
  const entry = palette[index] || palette[0];
  return { name: entry.name, color: entry.color, kind: entry.kind };
}

export function makeDefaultMaterials() {
  return {
    wall: defaultMaterial("wall", 0),
    floor: defaultMaterial("floor", 0),
    ceiling: defaultMaterial("ceiling", 0),
  };
}

export function touchProject(project) {
  project.meta = { ...(project.meta || {}), updatedAt: new Date().toISOString() };
  return project;
}

export function normalizeProject(input) {
  if (!input || typeof input !== "object") throw new Error("This file is not a Planwalk project.");
  const project = deepClone(input);

  project.id = project.id || uid("project");
  project.name = String(project.name || "Untitled project");
  project.unitSystem = project.unitSystem === "imperial" ? "imperial" : "metric";
  project.version = 1;
  project.meta = {
    createdAt: project.meta?.createdAt || new Date().toISOString(),
    updatedAt: project.meta?.updatedAt || new Date().toISOString(),
    source: project.meta?.source || "import",
  };
  project.scale = {
    calibrated: Boolean(project.scale?.calibrated),
    metersPerUnit: Number(project.scale?.metersPerUnit) > 0 ? Number(project.scale.metersPerUnit) : null,
    reference: project.scale?.reference || null,
  };
  if (!project.scale.calibrated) project.scale.metersPerUnit = null;

  project.plan = {
    name: project.plan?.name || "Floor plan",
    src: typeof project.plan?.src === "string" ? project.plan.src : null,
    width: Number(project.plan?.width) > 0 ? Number(project.plan.width) : 12,
    height: Number(project.plan?.height) > 0 ? Number(project.plan.height) : 9,
    visible: project.plan?.visible !== false,
    kind: project.plan?.kind || "image",
  };

  if (!Array.isArray(project.rooms) || project.rooms.length === 0) {
    throw new Error("This project has no rooms to display.");
  }

  const seenIds = new Set();
  project.rooms = project.rooms.map((room, index) => {
    const normalized = { ...room };
    normalized.id = normalized.id && !seenIds.has(normalized.id) ? normalized.id : uid("room");
    seenIds.add(normalized.id);
    normalized.name = String(normalized.name || `Room ${index + 1}`);
    normalized.x = num(normalized.x, 0);
    normalized.y = num(normalized.y, 0);
    normalized.w = Math.max(0.2, num(normalized.w ?? normalized.width, 3));
    normalized.h = Math.max(0.2, num(normalized.h ?? normalized.depth, 3));
    normalized.ceilingHeight = clamp(num(normalized.ceilingHeight, 2.65), 2.1, 5);
    normalized.confidence = clamp(num(normalized.confidence, 0.7), 0, 1);
    normalized.measurement = ["calibrated", "estimated", "edited"].includes(normalized.measurement)
      ? normalized.measurement
      : "estimated";
    normalized.walls = normalizeRoomWalls(normalized.walls);
    const materials = normalized.materials || {};
    normalized.materials = {
      wall: normalizeMaterial(materials.wall, "wall", 0),
      floor: normalizeMaterial(materials.floor, "floor", 0),
      ceiling: normalizeMaterial(materials.ceiling, "ceiling", 0),
    };
    return normalized;
  });

  const roomIds = new Set(project.rooms.map((room) => room.id));

  const seenOpeningIds = new Set();
  project.openings = Array.isArray(project.openings)
    ? project.openings
        .filter((opening) => roomIds.has(opening.roomId))
        .map((opening) => {
          const room = project.rooms.find((r) => r.id === opening.roomId);
          const wall = WALLS.includes(opening.wall) ? opening.wall : "n";
          const wallLength = wall === "n" || wall === "s" ? room.w : room.h;
          const width = Math.max(0.25, num(opening.width, 0.9));
          const id = opening.id && !seenOpeningIds.has(opening.id) ? opening.id : uid("opening");
          seenOpeningIds.add(id);
          return {
            id,
            roomId: opening.roomId,
            type: opening.type === "window" ? "window" : "door",
            wall,
            offset: clamp(num(opening.offset, (wallLength - width) / 2), 0, Math.max(0, wallLength - width)),
            width: Math.min(width, wallLength),
            height: clamp(num(opening.height, opening.type === "window" ? 1.3 : 2.05), 0.4, 2.8),
            sill: clamp(num(opening.sill, opening.type === "window" ? 0.8 : 0), 0, 1.8),
            confidence: clamp(num(opening.confidence, 0.75), 0, 1),
          };
        })
    : [];

  const seenObjectIds = new Set();
  project.objects = Array.isArray(project.objects)
    ? project.objects
        .filter((object) => CATALOG_BY_ID[object.type] && roomIds.has(object.roomId))
        .map((object) => {
          const normalized = normalizeObject(object, project.rooms.find((r) => r.id === object.roomId));
          if (!normalized.id || seenObjectIds.has(normalized.id)) normalized.id = uid("obj");
          seenObjectIds.add(normalized.id);
          return normalized;
        })
    : [];

  project.plan.width = Math.max(1, project.plan.width);
  project.plan.height = Math.max(1, project.plan.height);

  return touchProject(project);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMaterial(material, surface, index) {
  const fallback = defaultMaterial(surface, index);
  if (!material) return fallback;
  return {
    name: String(material.name || fallback.name),
    color: HEX_COLOR.test(material.color || "") ? material.color : fallback.color,
    kind: String(material.kind || material.material || fallback.kind),
  };
}

export function normalizeObject(object, room) {
  const def = CATALOG_BY_ID[object.type];
  const dims = object.dims || {};
  const placement = def.placement || "floor";
  const size = {
    w: clamp(num(dims.w, def.dims.w), 0.05, 12),
    d: clamp(num(dims.d, def.dims.d), 0.02, 12),
    h: clamp(num(dims.h, def.dims.h), 0.02, 5),
  };
  const x = num(object.x, room ? room.x + room.w / 2 : 0);
  const y = num(object.y, room ? room.y + room.h / 2 : 0);

  let wall = WALLS.includes(object.wall) ? object.wall : null;
  if (placement === "wall") {
    wall = wall || (room ? nearestWall(room, x, y) : null);
  }

  let elevation;
  if (placement === "ceiling") {
    elevation = num(object.elevation, room ? room.ceilingHeight - size.h / 2 : 2.4);
  } else if (placement === "wall") {
    elevation = num(object.elevation, 1.5);
  } else {
    elevation = num(object.elevation, 0);
  }

  const normalized = {
    id: object.id || uid("obj"),
    type: object.type,
    roomId: object.roomId,
    name: object.name || def.name,
    x,
    y,
    rotation: num(object.rotation, 0),
    dims: size,
    color: HEX_COLOR.test(object.color || "") ? object.color : def.color,
    accent: HEX_COLOR.test(object.accent || "") ? object.accent : def.accent || null,
    placement: placement === "ceiling" ? "ceiling" : placement === "wall" ? "wall" : "floor",
    elevation: clamp(elevation, 0, 5),
    wall: placement === "wall" ? wall : null,
    texture: ["smooth", "fabric", "wood", "stone", "metal", "tile", "concrete", "carpet"].includes(object.texture)
      ? object.texture
      : "smooth",
    locked: Boolean(object.locked),
  };

  // Imported or legacy wall items may be off their wall. Snap them onto the
  // correct plane and keep them within the wall span so drag/nudge behaviour
  // stays predictable.
  if (normalized.placement === "wall" && room && normalized.wall) {
    const half = Math.min(size.w, normalized.wall === "n" || normalized.wall === "s" ? room.w : room.h) / 2;
    if (normalized.wall === "n" || normalized.wall === "s") {
      normalized.y = normalized.wall === "n" ? room.y + WALL_INSET : room.y + room.h - WALL_INSET;
      normalized.x = clamp(normalized.x, room.x + half, room.x + room.w - half);
    } else {
      normalized.x = normalized.wall === "w" ? room.x + WALL_INSET : room.x + room.w - WALL_INSET;
      normalized.y = clamp(normalized.y, room.y + half, room.y + room.h - half);
    }
  }

  return normalized;
}

export function findRoom(project, id) {
  return project?.rooms?.find((room) => room.id === id) || null;
}

export function findObject(project, id) {
  return project?.objects?.find((object) => object.id === id) || null;
}

export function objectsInRoom(project, roomId) {
  return (project?.objects || []).filter((object) => object.roomId === roomId);
}

export function roomArea(room) {
  return Math.max(0, room.w * room.h);
}

export function roomCenter(room) {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

export function projectBounds(project) {
  const rooms = project?.rooms || [];
  if (!rooms.length) return { minX: 0, minY: 0, maxX: 12, maxY: 9, w: 12, h: 9, cx: 6, cy: 4.5 };
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function projectArea(project) {
  return (project?.rooms || []).reduce((sum, room) => sum + roomArea(room), 0);
}

export function objectDisplayName(object) {
  return CATALOG_BY_ID[object.type]?.name || object.name || object.type;
}

export function objectCatalog(object) {
  return CATALOG_BY_ID[object.type] || null;
}

/** Footprint in plan units for a catalog/object (sizes are authored in meters). */
export function footprintUnits(object, project) {
  const mpu = metersPerUnit(project);
  return { w: object.dims.w / mpu, d: object.dims.d / mpu };
}

export function wallFacingRotation(wall) {
  // Object rotation 0 faces +z (south). Map room wall -> inward normal.
  switch (wall) {
    case "n":
      return 0; // north wall, faces south
    case "s":
      return Math.PI;
    case "w":
      return Math.PI / 2; // west wall, faces east
    case "e":
      return -Math.PI / 2;
    default:
      return 0;
  }
}

/** Center point + inward normal for an opening. */
export function openingFrame(opening, room) {
  const wall = opening.wall;
  const center = opening.offset + opening.width / 2;
  switch (wall) {
    case "n":
      return { x: room.x + center, y: room.y, nx: 0, ny: 1, wall };
    case "s":
      return { x: room.x + center, y: room.y + room.h, nx: 0, ny: -1, wall };
    case "w":
      return { x: room.x, y: room.y + center, nx: 1, ny: 0, wall };
    case "e":
      return { x: room.x + room.w, y: room.y + center, nx: -1, ny: 0, wall };
    default:
      return { x: room.x, y: room.y, nx: 1, ny: 0, wall };
  }
}

export function nearestWall(room, x, y) {
  const distances = [
    { wall: "n", d: Math.abs(y - room.y) },
    { wall: "s", d: Math.abs(room.y + room.h - y) },
    { wall: "w", d: Math.abs(x - room.x) },
    { wall: "e", d: Math.abs(room.x + room.w - x) },
  ];
  distances.sort((a, b) => a.d - b.d);
  return distances[0].wall;
}

export function planImageReference(project) {
  return project?.plan?.src || null;
}
