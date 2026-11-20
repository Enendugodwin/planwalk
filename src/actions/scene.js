import { CATALOG_BY_ID } from "../data/catalog.js";
import { store } from "../store.js";
import {
  footprintUnits,
  nearestWall,
  objectDisplayName,
  openingFrame,
  roomCenter,
  wallFacingRotation,
} from "../model/project.js";
import { metersPerUnit } from "../model/units.js";
import { clamp, deepClone, uid } from "../util.js";

const EPS = 0.001;

function rotCosSin(rotation) {
  return { c: Math.cos(rotation || 0), s: Math.sin(rotation || 0) };
}

/** Corners of a rotated object footprint in plan units. */
export function objectCorners(object, project) {
  const { w, d } = footprintUnits(object, project);
  const hw = w / 2;
  const hd = d / 2;
  const { c, s } = rotCosSin(object.rotation);
  const local = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([lx, lz]) => ({
    x: object.x + lx * c + lz * s,
    y: object.y - lx * s + lz * c,
  }));
}

function axesFor(object) {
  const { c, s } = rotCosSin(object.rotation);
  return [
    { x: c, y: -s },
    { x: s, y: c },
  ];
}

function projectCorners(corners, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of corners) {
    const value = point.x * axis.x + point.y * axis.y;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

function obbOverlap(a, b) {
  const ca = objectCornersLike(a);
  const cb = objectCornersLike(b);
  const axes = [...axesFor(a), ...axesFor(b)];
  for (const axis of axes) {
    const pa = projectCorners(ca, axis);
    const pb = projectCorners(cb, axis);
    if (pa.max <= pb.min + EPS || pb.max <= pa.min + EPS) return false;
  }
  return true;
}

// Objects passed to obbOverlap are enriched with corners by canPlaceObject.
function objectCornersLike(object) {
  if (object._corners) return object._corners;
  return object.corners || [];
}

function isRug(object) {
  return object.type === "rug";
}

function asCollisionCandidate(object, project) {
  return { ...object, corners: objectCorners(object, project) };
}

/**
 * Validate an object placement inside a room.
 * Returns { ok, reason, conflicts } where reason is "wall" or "overlap".
 */
export function canPlaceObject(project, object, { ignoreId = null } = {}) {
  const room = project.rooms.find((r) => r.id === object.roomId);
  if (!room) return { ok: false, reason: "room", conflicts: [] };
  if (object.placement !== "floor" || isRug(object)) return { ok: true, reason: null, conflicts: [] };

  const corners = objectCorners(object, project);
  const inside = corners.every(
    (p) =>
      p.x >= room.x - EPS &&
      p.x <= room.x + room.w + EPS &&
      p.y >= room.y - EPS &&
      p.y <= room.y + room.h + EPS
  );
  if (!inside) return { ok: false, reason: "wall", conflicts: [] };

  const candidate = { ...object, _corners: corners };
  const conflicts = [];
  for (const other of project.objects) {
    if (other.id === object.id || other.id === ignoreId) continue;
    if (other.placement !== "floor" || isRug(other)) continue;
    if (obbOverlap(candidate, asCollisionCandidate(other, project))) conflicts.push(other.id);
  }
  if (conflicts.length) return { ok: false, reason: "overlap", conflicts };
  return { ok: true, reason: null, conflicts: [] };
}

export function describeCollision(project, result) {
  if (result.reason === "wall") return "That position crosses a wall. Nudge it back inside the room.";
  if (result.reason === "overlap") {
    const names = result.conflicts
      .map((id) => project.objects.find((o) => o.id === id))
      .filter(Boolean)
      .map((o) => objectDisplayName(o).toLowerCase());
    return names.length
      ? `It would overlap the ${names.slice(0, 2).join(" and ")}${names.length > 2 ? " and others" : ""}.`
      : "It would overlap another piece.";
  }
  return "That placement does not fit.";
}

function makeCandidates(room, preferred, step) {
  const list = [];
  const seen = new Set();
  const add = (x, y) => {
    const rx = Math.round(x * 20) / 20;
    const ry = Math.round(y * 20) / 20;
    const key = `${rx},${ry}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ x: rx, y: ry });
  };
  const center = roomCenter(room);
  add(preferred?.x ?? center.x, preferred?.y ?? center.y);
  add(center.x, center.y);

  const margin = Math.min(0.35, Math.min(room.w, room.h) / 6);
  for (let ring = 1; ring <= 8; ring += 1) {
    const offset = ring * step;
    for (let ix = -ring; ix <= ring; ix += 1) {
      for (let iy = -ring; iy <= ring; iy += 1) {
        if (Math.max(Math.abs(ix), Math.abs(iy)) !== ring) continue;
        add(center.x + ix * step, center.y + iy * step);
      }
    }
  }
  // Wall-adjacent positions are useful for larger pieces.
  const xs = [room.x + margin, room.x + room.w - margin];
  const ys = [room.y + margin, room.y + room.h - margin];
  for (const x of xs) for (const y of ys) add(x, y);
  for (let x = room.x + margin; x <= room.x + room.w - margin; x += step) {
    add(x, room.y + margin);
    add(x, room.y + room.h - margin);
  }
  for (let y = room.y + margin; y <= room.y + room.h - margin; y += step) {
    add(room.x + margin, y);
    add(room.x + room.w - margin, y);
  }
  return list;
}

/** Find a non-overlapping floor position for a catalog item. */
export function findFreeSpot(project, room, item, opts = {}) {
  const mpu = metersPerUnit(project);
  const dims = opts.dims || item.dims;
  const probe = {
    id: "probe",
    type: opts.type || item.id,
    roomId: room.id,
    x: 0,
    y: 0,
    rotation: opts.rotation ?? 0,
    dims,
    placement: "floor",
  };
  const step = clamp(Math.min(room.w, room.h) / 18, 0.08, 0.35);
  const preferred = opts.preferred || null;
  const candidates = makeCandidates(room, preferred, step);
  for (const point of candidates) {
    const candidate = { ...probe, x: point.x, y: point.y };
    const result = canPlaceObject(project, candidate);
    if (result.ok) return { x: candidate.x, y: candidate.y, placed: true };
  }
  // Try the preferred point even if it overlaps, so the user has something.
  const center = preferred || roomCenter(room);
  return { x: center.x, y: center.y, placed: false };
}

function openingIntervals(project, roomId, wall) {
  return (project.openings || [])
    .filter((o) => o.roomId === roomId && o.wall === wall)
    .map((o) => [o.offset, o.offset + o.width]);
}

function overlapInterval(a, b) {
  return a[0] < b[1] - EPS && b[0] < a[1] - EPS;
}

function wallObjectsOn(project, roomId, wall) {
  return (project.objects || []).filter(
    (o) => o.roomId === roomId && o.placement === "wall" && o.wall === wall
  );
}

/** Choose a wall, offset, elevation and facing rotation for a wall-hung item. */
export function findWallSpot(project, room, item, opts = {}) {
  const mpu = metersPerUnit(project);
  const width = (opts.dims?.w || item.dims.w) / mpu;
  const near = opts.near || roomCenter(room);
  const preferredWall = opts.wall || nearestWall(room, near.x, near.y);
  const order = [preferredWall, "n", "e", "s", "w"].filter((w, i, arr) => arr.indexOf(w) === i);

  for (const wall of order) {
    const wallLength = wall === "n" || wall === "s" ? room.w : room.h;
    if (wallLength < width + 0.1) continue;
    const blocked = [...openingIntervals(project, room.id, wall)];
    for (const other of wallObjectsOn(project, room.id, wall)) {
      const otherWidth = other.dims.w / mpu;
      const along = wall === "n" || wall === "s" ? other.x - room.x : other.y - room.y;
      blocked.push([along - otherWidth / 2, along + otherWidth / 2]);
    }
    const candidates = [wallLength / 2];
    const step = 0.18;
    for (let o = 0.15 + width / 2; o <= wallLength - width / 2 - 0.15; o += step) {
      candidates.push(o);
    }
    const nearAlong =
      wall === "n" || wall === "s" ? near.x - room.x : near.y - room.y;
    candidates.sort((a, b) => Math.abs(a - nearAlong) - Math.abs(b - nearAlong));
    for (const centerAlong of candidates) {
      const interval = [centerAlong - width / 2, centerAlong + width / 2];
      if (interval[0] < 0.08 || interval[1] > wallLength - 0.08) continue;
      if (blocked.some((b) => overlapInterval(interval, b))) continue;
      const elevation =
        opts.elevation ??
        clamp((opts.dims?.h || item.dims.h) / 2 + 1.22, 1.1, 2.2);
      let x;
      let y;
      let rotation;
      if (wall === "n") {
        x = room.x + centerAlong;
        y = room.y + 0.035;
        rotation = wallFacingRotation("n");
      } else if (wall === "s") {
        x = room.x + centerAlong;
        y = room.y + room.h - 0.035;
        rotation = wallFacingRotation("s");
      } else if (wall === "w") {
        x = room.x + 0.035;
        y = room.y + centerAlong;
        rotation = wallFacingRotation("w");
      } else {
        x = room.x + room.w - 0.035;
        y = room.y + centerAlong;
        rotation = wallFacingRotation("e");
      }
      return { x, y, wall, rotation, elevation, placed: true };
    }
  }
  return {
    x: near.x,
    y: near.y,
    wall: preferredWall,
    rotation: wallFacingRotation(preferredWall),
    elevation: opts.elevation ?? 1.5,
    placed: false,
  };
}

export function makeCatalogObject(project, room, type, options = {}) {
  const def = CATALOG_BY_ID[type];
  if (!def) throw new Error(`Unknown catalog item: ${type}`);
  const mpu = metersPerUnit(project);
  const dims = { ...def.dims, ...(options.dims || {}) };
  const base = {
    id: options.id || uid("obj"),
    type,
    roomId: room.id,
    name: def.name,
    x: roomCenter(room).x,
    y: roomCenter(room).y,
    rotation: options.rotation ?? 0,
    dims,
    color: options.color || def.color,
    accent: options.accent ?? def.accent ?? null,
    texture: options.texture || "smooth",
    placement: def.placement,
    elevation: 0,
  };

  if (def.placement === "wall") {
    let elevation = options.elevation;
    let near = options.near;
    if (options.aboveId) {
      const above = project.objects.find((o) => o.id === options.aboveId);
      if (above) {
        near = { x: above.x, y: above.y };
        elevation = above.elevation + above.dims.h + dims.h / 2 + 0.5;
      }
    }
    const spot = findWallSpot(project, room, def, { dims, near, wall: options.wall, elevation });
    return { object: { ...base, ...spot, placement: "wall" }, placed: spot.placed };
  }

  if (def.placement === "ceiling") {
    const center = roomCenter(room);
    return {
      object: {
        ...base,
        x: options.preferred?.x ?? center.x,
        y: options.preferred?.y ?? center.y,
        elevation: room.ceilingHeight - dims.h / 2,
        placement: "ceiling",
      },
      placed: true,
    };
  }

  const spot = options.position
    ? { x: options.position.x, y: options.position.y, placed: true }
    : findFreeSpot(project, room, def, {
        dims,
        rotation: base.rotation,
        preferred: options.preferred,
      });

  return {
    object: {
      ...base,
      x: spot.x,
      y: spot.y,
      rotation: options.rotation ?? base.rotation,
    },
    placed: spot.placed,
  };
}

/** Add one object and return { object, placed }. */
export function addObject(type, roomId, options = {}) {
  const project = store.project;
  const room = project.rooms.find((r) => r.id === roomId) || store.selectedRoom;
  if (!room) return { object: null, placed: false, error: "Select a room first." };
  const def = CATALOG_BY_ID[type];
  if (!def) return { object: null, placed: false, error: "That item is not in the catalog." };

  let result;
  store.commit(`Add ${def.name.toLowerCase()}`, (draft) => {
    const draftRoom = draft.rooms.find((r) => r.id === room.id);
    result = makeCatalogObject(draft, draftRoom, type, options);
    draft.objects.push(result.object);
  });
  store.selectObject(result.object.id);
  return result;
}

export function duplicateObject(id) {
  const project = store.project;
  const object = project.objects.find((o) => o.id === id);
  if (!object) return null;
  const room = project.rooms.find((r) => r.id === object.roomId);
  const def = CATALOG_BY_ID[object.type];
  let newId = null;
  store.commit(`Duplicate ${objectDisplayName(object).toLowerCase()}`, (draft) => {
    const source = draft.objects.find((o) => o.id === id);
    const draftRoom = draft.rooms.find((r) => r.id === object.roomId);
    const clone = deepClone(source);
    clone.id = uid("obj");
    newId = clone.id;
    if (clone.placement === "floor") {
      const mpu = metersPerUnit(draft);
      const spot = findFreeSpot(draft, draftRoom, def, {
        dims: clone.dims,
        rotation: clone.rotation,
        preferred: { x: clone.x + 0.35 / mpu, y: clone.y + 0.2 / mpu },
      });
      clone.x = spot.x;
      clone.y = spot.y;
    } else {
      const offset = 0.25 / metersPerUnit(draft);
      const spot = findWallSpot(draft, draftRoom, def, {
        dims: clone.dims,
        near: { x: clone.x + offset, y: clone.y + offset },
        wall: clone.wall,
        elevation: clone.elevation,
      });
      Object.assign(clone, spot);
    }
    draft.objects.push(clone);
  });
  if (newId) store.selectObject(newId);
  return newId;
}

export function removeObject(id) {
  const object = store.project.objects.find((o) => o.id === id);
  if (!object) return false;
  const roomId = object.roomId;
  store.commit(`Remove ${objectDisplayName(object).toLowerCase()}`, (draft) => {
    draft.objects = draft.objects.filter((o) => o.id !== id);
  });
  const selected = store.selectedObject?.id;
  if (!selected) store.selectRoom(roomId);
  return true;
}

export function rotateObject(id, deltaRadians) {
  const object = store.project.objects.find((o) => o.id === id);
  if (!object) return { ok: false };
  let result = { ok: true, message: "" };
  store.commit(`Rotate ${objectDisplayName(object).toLowerCase()}`, (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    target.rotation = (target.rotation + deltaRadians) % (Math.PI * 2);
    if (target.placement === "floor") {
      const check = canPlaceObject(draft, target);
      if (!check.ok) result = { ok: true, collision: true, message: describeCollision(draft, check) };
    }
  });
  return result;
}

export function setObjectPosition(id, x, y, label = "Move item") {
  let outcome = { ok: true, message: "" };
  store.commit(label, (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    if (!target) return;
    const previous = { x: target.x, y: target.y };
    target.x = Number(x);
    target.y = Number(y);
    if (target.placement === "floor") {
      const check = canPlaceObject(draft, target);
      if (!check.ok) {
        target.x = previous.x;
        target.y = previous.y;
        outcome = { ok: false, message: describeCollision(draft, check) };
      }
    }
  });
  return outcome;
}

export function nudgeObject(id, dx, dy) {
  const object = store.project.objects.find((o) => o.id === id);
  if (!object) return { ok: false };
  const room = store.project.rooms.find((r) => r.id === object.roomId);
  if (!room) return { ok: false };
  const next = { x: object.x + dx, y: object.y + dy };
  // Keep wall-mounted items on their wall.
  if (object.placement === "wall") {
    if (object.wall === "n" || object.wall === "s") {
      next.x = clamp(next.x, room.x + 0.1, room.x + room.w - 0.1);
      if (object.wall === "n") next.y = room.y + 0.035;
      if (object.wall === "s") next.y = room.y + room.h - 0.035;
    } else {
      next.y = clamp(next.y, room.y + 0.1, room.y + room.h - 0.1);
      if (object.wall === "w") next.x = room.x + 0.035;
      if (object.wall === "e") next.x = room.x + room.w - 0.035;
    }
    if (Math.abs(next.x - object.x) < 1e-6 && Math.abs(next.y - object.y) < 1e-6) {
      return { ok: false, message: "Wall-mounted items move along their wall." };
    }
  }
  const check = canPlaceObject(store.project, { ...object, ...next }, { ignoreId: id });
  if (!check.ok) return { ok: false, message: describeCollision(store.project, check) };
  return setObjectPosition(id, next.x, next.y, "Nudge item");
}

export function setObjectField(id, field, value, label = "Update item") {
  store.commit(label, (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    if (!target) return;
    if (field === "dims.w" || field === "dims.d" || field === "dims.h") {
      const key = field.split(".")[1];
      target.dims[key] = clamp(Number(value) || target.dims[key], 0.02, 8);
    } else {
      target[field] = value;
    }
  });
}

export function faceNearestWindow(id) {
  const project = store.project;
  const object = project.objects.find((o) => o.id === id);
  if (!object) return false;
  const room = project.rooms.find((r) => r.id === object.roomId);
  const windows = project.openings
    .filter((o) => o.roomId === object.roomId && o.type === "window")
    .map((opening) => openingFrame(opening, room))
    .sort((a, b) => {
      const da = (a.x - object.x) ** 2 + (a.y - object.y) ** 2;
      const db = (b.x - object.x) ** 2 + (b.y - object.y) ** 2;
      return da - db;
    });
  if (!windows.length) return false;
  const target = windows[0];
  const rotation = Math.atan2(target.x - object.x, target.y - object.y);
  store.commit(`Turn ${objectDisplayName(object).toLowerCase()} toward the window`, (draft) => {
    const targetObject = draft.objects.find((o) => o.id === id);
    targetObject.rotation = rotation;
  });
  return true;
}

/** Nearest wall-mounted surface for a prompt like "clock above the sofa". */
export function wallMountForObject(project, room, anchor, type) {
  const def = CATALOG_BY_ID[type];
  if (!def) return null;
  const near = anchor ? { x: anchor.x, y: anchor.y } : roomCenter(room);
  return findWallSpot(project, room, def, {
    near,
    aboveId: anchor?.id,
    dims: def.dims,
  });
}
