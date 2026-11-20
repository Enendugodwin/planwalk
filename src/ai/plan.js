import { SURFACE_PALETTES } from "../data/catalog.js";
import { clamp, uid } from "../util.js";
import { generateStructured } from "./firebase.js";
import { PLAN_SCHEMA, PLAN_SYSTEM_PROMPT, planUserPrompt } from "./schemas.js";

export function planUnitsFromImage(width, height) {
  return { planWidth: Math.max(1, width / 100), planHeight: Math.max(1, height / 100) };
}

const OUTDOOR_ROOM = /(porch|patio|balcony|deck|terrace|garage|carport|driveway|yard|garden|pool|lanai)/i;
const WALLS = ["n", "e", "s", "w"];

function normalizeWalls(raw) {
  const walls = {};
  for (const wall of WALLS) walls[wall] = raw?.[wall] !== false;
  return walls;
}

async function prepareImageForAI(dataUrl, maxDim = 1600) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  return {
    data: jpeg.split(",")[1],
    mimeType: "image/jpeg",
    width,
    height,
    dataUrl: jpeg,
  };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The plan image could not be loaded."));
    image.src = src;
  });
}

export function validatePlanAI(data) {
  const warnings = [];
  const rooms = [];
  const roomIndexMap = new Map();
  const rawRooms = Array.isArray(data?.rooms) ? data.rooms : [];
  let skippedOutdoor = 0;

  rawRooms.slice(0, 24).forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const x = clamp(Number(raw.x), 0, 0.99);
    const y = clamp(Number(raw.y), 0, 0.99);
    const width = clamp(Number(raw.width), 0.02, 1 - x);
    const height = clamp(Number(raw.height), 0.02, 1 - y);
    if (![x, y, width, height].every(Number.isFinite)) {
      warnings.push(`Room ${index + 1} had unusable coordinates.`);
      return;
    }
    if (width < 0.025 || height < 0.025) {
      warnings.push(`Room ${index + 1} was too small to use.`);
      return;
    }
    const name = String(raw.name || `Room ${index + 1}`).slice(0, 48);
    if (OUTDOOR_ROOM.test(name)) {
      skippedOutdoor += 1;
      return;
    }
    roomIndexMap.set(index, rooms.length);
    rooms.push({
      name,
      x,
      y,
      width,
      height,
      confidence: clamp(Number(raw.confidence) || 0.5, 0, 1),
      walls: normalizeWalls(raw.walls),
    });
  });

  if (rawRooms.length > 24) {
    warnings.push("The plan had more spaces than this version can review at once; only the first 24 were kept.");
  }
  if (skippedOutdoor) {
    warnings.push(
      `${skippedOutdoor} outdoor area${skippedOutdoor === 1 ? "" : "s"} (porch, patio, garage or similar) ${
        skippedOutdoor === 1 ? "was" : "were"
      } left out of the 3D model.`
    );
  }
  if (!rooms.length) throw new Error("The model didn't return any usable interior room outlines.");

  const openings = [];
  const rawOpenings = Array.isArray(data?.openings) ? data.openings : [];
  for (const raw of rawOpenings.slice(0, 80)) {
    if (!raw || typeof raw !== "object") continue;
    const rawIndex = Math.round(Number(raw.roomIndex));
    const roomIndex = roomIndexMap.get(rawIndex);
    if (!Number.isInteger(roomIndex)) continue;
    const type = raw.type === "window" ? "window" : "door";
    const wall = WALLS.includes(raw.wall) ? raw.wall : "n";
    const offset = clamp(Number(raw.offset) || 0, 0, 1);
    const width = clamp(Number(raw.width) || 0.2, 0.02, 1);
    openings.push({
      roomIndex,
      type,
      wall,
      offset,
      width,
      confidence: clamp(Number(raw.confidence) || 0.55, 0, 1),
    });
  }

  return { rooms, openings, warnings };
}

export async function interpretPlanImage({ dataUrl, width, height }) {
  const prepared = await prepareImageForAI(dataUrl);
  const prompt = `${PLAN_SYSTEM_PROMPT}\n\n${planUserPrompt(width, height)}`;
  const { data, inferenceSource } = await generateStructured({
    prompt,
    image: { data: prepared.data, mimeType: prepared.mimeType },
    schema: PLAN_SCHEMA,
    // Floor-plan recognition is materially better with the cloud vision model.
    preferCloud: true,
  });
  const result = validatePlanAI(data);
  return {
    ...result,
    inferenceSource,
    preparedImage: prepared,
  };
}

function pick(list, index) {
  return { ...list[index % list.length] };
}

/** Convert validated normalized room/openings data into plan-unit geometry. */
export function layoutFromNormalized({ rooms, openings }, imageWidth, imageHeight) {
  const { planWidth, planHeight } = planUnitsFromImage(imageWidth, imageHeight);
  const builtRooms = rooms.map((room, index) => {
    const w = Math.max(0.2, room.width * planWidth);
    const h = Math.max(0.2, room.height * planHeight);
    return {
      id: uid("room"),
      name: room.name,
      x: room.x * planWidth,
      y: room.y * planHeight,
      w,
      h,
      ceilingHeight: 2.65,
      confidence: room.confidence,
      measurement: "estimated",
      walls: normalizeWalls(room.walls),
      materials: {
        wall: pick(SURFACE_PALETTES.wall, [0, 2, 0, 3, 4, 0][index] ?? index),
        floor: pick(SURFACE_PALETTES.floor, [0, 4, 6, 1, 3, 0][index] ?? index),
        ceiling: pick(SURFACE_PALETTES.ceiling, 0),
      },
    };
  });

  const builtOpenings = [];
  for (const opening of openings) {
    const room = builtRooms[opening.roomIndex];
    if (!room) continue;
    const wallLength = opening.wall === "n" || opening.wall === "s" ? room.w : room.h;
    const width = clamp(opening.width * wallLength, 0.2, wallLength - 0.05);
    const offset = clamp(opening.offset * wallLength, 0, Math.max(0, wallLength - width));
    builtOpenings.push({
      id: uid("opening"),
      roomId: room.id,
      type: opening.type,
      wall: opening.wall,
      offset,
      width,
      height: opening.type === "window" ? 1.35 : 2.05,
      sill: opening.type === "window" ? 0.85 : 0,
      confidence: opening.confidence,
    });
  }

  return { rooms: builtRooms, openings: builtOpenings, planWidth, planHeight };
}

export function starterLayout(imageWidth, imageHeight) {
  const { planWidth, planHeight } = planUnitsFromImage(imageWidth, imageHeight);
  const inset = 0.06;
  return {
    rooms: [
      {
        id: uid("room"),
        name: "Main space",
        x: planWidth * inset,
        y: planHeight * inset,
        w: planWidth * (1 - inset * 2),
        h: planHeight * (1 - inset * 2),
        ceilingHeight: 2.65,
        confidence: 0.25,
        measurement: "estimated",
        walls: normalizeWalls(),
        materials: {
          wall: pick(SURFACE_PALETTES.wall, 0),
          floor: pick(SURFACE_PALETTES.floor, 0),
          ceiling: pick(SURFACE_PALETTES.ceiling, 0),
        },
      },
    ],
    openings: [],
    planWidth,
    planHeight,
  };
}

export function makeManualRoom({ planWidth, planHeight, index = 0 }) {
  const w = planWidth * 0.28;
  const h = planHeight * 0.24;
  const x = planWidth * (0.12 + (index % 3) * 0.26);
  const y = planHeight * (0.12 + (Math.floor(index / 3) % 3) * 0.26);
  return {
    id: uid("room"),
    name: `Room ${index + 1}`,
    x,
    y,
    w,
    h,
    ceilingHeight: 2.65,
    confidence: 0.4,
    measurement: "edited",
    walls: normalizeWalls(),
    materials: {
      wall: pick(SURFACE_PALETTES.wall, 0),
      floor: pick(SURFACE_PALETTES.floor, 0),
      ceiling: pick(SURFACE_PALETTES.ceiling, 0),
    },
  };
}

export function buildUploadedProject({
  name,
  dataUrl,
  imageWidth,
  imageHeight,
  rooms,
  openings,
  metersPerUnit = null,
  scaleReference = null,
}) {
  const { planWidth, planHeight } = planUnitsFromImage(imageWidth, imageHeight);
  const now = new Date().toISOString();
  return {
    version: 1,
    id: uid("project"),
    name: name || "Uploaded floor plan",
    unitSystem: "metric",
    scale: {
      calibrated: Boolean(metersPerUnit),
      metersPerUnit: metersPerUnit || null,
      reference: scaleReference,
    },
    plan: {
      name: name || "Uploaded floor plan",
      src: dataUrl,
      width: planWidth,
      height: planHeight,
      visible: true,
      kind: "image",
      imageWidth,
      imageHeight,
    },
    rooms,
    openings,
    objects: [],
    meta: { createdAt: now, updatedAt: now, source: "upload" },
  };
}
