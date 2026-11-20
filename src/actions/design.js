import { CATALOG_BY_ID } from "../data/catalog.js";
import { store } from "../store.js";
import { makeCatalogObject, canPlaceObject, describeCollision } from "./scene.js";
import { clamp } from "../util.js";
import { metersPerUnit, parseDisplayLength } from "../model/units.js";
import { objectDisplayName, roomArea } from "../model/project.js";

const SURFACES = new Set(["wall", "floor", "ceiling"]);

export function setSurfaceMaterial(roomId, surface, material) {
  if (!SURFACES.has(surface)) return;
  const room = store.project.rooms.find((r) => r.id === roomId);
  if (!room) return;
  store.commit(`Change ${room.name.toLowerCase()} ${surface}`, (draft) => {
    const target = draft.rooms.find((r) => r.id === roomId);
    target.materials[surface] = {
      name: material.name,
      color: material.color,
      kind: material.kind || target.materials[surface].kind,
    };
  });
}

export function setObjectColor(id, color, name = "Paint item") {
  store.commit(name, (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    if (target) target.color = color;
  });
}

export function setObjectAccent(id, color) {
  store.commit("Change item finish", (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    if (target) target.accent = color;
  });
}

export function setObjectTexture(id, texture) {
  const allowed = ["smooth", "fabric", "wood", "stone", "metal", "tile", "concrete", "carpet"];
  store.commit("Change item texture", (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    if (target) target.texture = allowed.includes(texture) ? texture : "smooth";
  });
}

export function setObjectRotation(id, rotation) {
  store.commit("Rotate item", (draft) => {
    const target = draft.objects.find((o) => o.id === id);
    if (target) target.rotation = ((Number(rotation) || 0) + Math.PI * 4) % (Math.PI * 2);
  });
}

export function updateRoomField(roomId, field, value) {
  const room = store.project.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false };
  if (field === "name") {
    const name = String(value || "").trim().slice(0, 60);
    if (!name) return { ok: false };
    store.commit("Rename room", (draft) => {
      const target = draft.rooms.find((r) => r.id === roomId);
      target.name = name;
    });
    return { ok: true };
  }
  if (field === "ceilingHeight") {
    const height = clamp(Number(value) || room.ceilingHeight, 2.1, 5);
    store.commit("Change ceiling height", (draft) => {
      const target = draft.rooms.find((r) => r.id === roomId);
      target.ceilingHeight = height;
    });
    return { ok: true };
  }
  return { ok: false };
}

/** Resize a room (w/h are plan units). Returns a warning when furniture no longer fits. */
export function setRoomDimensions(roomId, w, h) {
  let warning = "";
  store.commit("Correct room outline", (draft) => {
    const room = draft.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const minW = 0.6;
    const minH = 0.6;
    room.w = Math.max(minW, Number(w) || room.w);
    room.h = Math.max(minH, Number(h) || room.h);
    room.measurement = "edited";
    // Keep openings on their walls.
    for (const opening of draft.openings.filter((o) => o.roomId === roomId)) {
      const wallLength = opening.wall === "n" || opening.wall === "s" ? room.w : room.h;
      opening.width = Math.min(opening.width, Math.max(0.3, wallLength - 0.1));
      opening.offset = clamp(opening.offset, 0, Math.max(0, wallLength - opening.width));
    }
    const outside = draft.objects.filter(
      (o) => o.roomId === roomId && o.placement === "floor"
    ).filter((o) => !canPlaceObject(draft, o).ok);
    if (outside.length) {
      warning = `${outside.length} item${outside.length > 1 ? "s" : ""} no longer fit inside the new outline.`;
    }
  });
  return { ok: true, warning };
}

export function setRoomMeasurement(roomId, status) {
  store.commit("Update measurement status", (draft) => {
    const room = draft.rooms.find((r) => r.id === roomId);
    if (room) room.measurement = status;
  });
}

export function setRoomDimsFromDisplay(roomId, wDisplay, hDisplay) {
  const room = store.project.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false };
  const w = parseDisplayLength(wDisplay, store.project);
  const h = parseDisplayLength(hDisplay, store.project);
  if (!w || !h) return { ok: false, message: "Enter a valid dimension." };
  return setRoomDimensions(roomId, w, h);
}

export function setRoomAreaPreserved(roomId, field, displayValue) {
  const room = store.project.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false };
  const units = parseDisplayLength(displayValue, store.project);
  if (!units || units <= 0.1) return { ok: false, message: "Enter a valid dimension." };
  const roomNow = store.project.rooms.find((r) => r.id === roomId);
  const nextW = field === "w" ? units : roomNow.w;
  const nextH = field === "h" ? units : roomNow.h;
  return setRoomDimensions(roomId, nextW, nextH);
}

/** Apply a validated structured edit plan in one undoable transaction. */
export function applyEditPlan(plan) {
  const project = store.project;
  const warnings = [];
  let applied = 0;
  let lastObjectId = null;
  let lastRoomId = null;

  store.commit(plan.summary || "Design edit", (draft) => {
    for (const edit of plan.edits || []) {
      if (!edit || typeof edit !== "object") continue;
      try {
        if (edit.type === "room-material") {
          const room = draft.rooms.find((r) => r.id === edit.roomId);
          if (!room || !SURFACES.has(edit.surface)) {
            warnings.push("One material edit targeted a room that no longer exists.");
            continue;
          }
          const fallback = room.materials[edit.surface];
          room.materials[edit.surface] = {
            name: edit.name || fallback.name,
            color: edit.color || fallback.color,
            kind: edit.kind || fallback.kind,
          };
          lastRoomId = room.id;
          applied += 1;
        } else if (edit.type === "object-color" || edit.type === "object-accent") {
          let changed = 0;
          for (const object of draft.objects) {
            if (!edit.objectIds?.includes(object.id)) continue;
            if (edit.type === "object-color") object.color = edit.color;
            else object.accent = edit.color;
            changed += 1;
            lastObjectId = object.id;
          }
          if (changed) applied += 1;
          else warnings.push("An item colour edit had no matching objects.");
        } else if (edit.type === "add-object") {
          const room = draft.rooms.find((r) => r.id === edit.roomId) || draft.rooms[0];
          const def = CATALOG_BY_ID[edit.catalogType];
          if (!room || !def) {
            warnings.push("A furniture edit referenced an item that isn't available.");
            continue;
          }
          const anchor = edit.anchorObjectId
            ? draft.objects.find((o) => o.id === edit.anchorObjectId)
            : null;
          const result = makeCatalogObject(draft, room, edit.catalogType, {
            id: edit.objectId,
            color: edit.color,
            accent: edit.accent,
            aboveId: anchor?.id,
            position: edit.position,
            preferred: edit.preferred,
            rotation: edit.rotation,
            wall: edit.wall,
            dims: edit.dims,
          });
          draft.objects.push(result.object);
          lastObjectId = result.object.id;
          applied += 1;
          if (!result.placed) {
            warnings.push(
              `No clear spot for the ${def.name.toLowerCase()} — it was placed near the room centre. Move it to finish.`
            );
          }
        } else if (edit.type === "remove-object") {
          const target = draft.objects.find((o) => o.id === edit.objectId);
          const roomId = target?.roomId || null;
          const before = draft.objects.length;
          draft.objects = draft.objects.filter((o) => o.id !== edit.objectId);
          if (draft.objects.length < before) {
            applied += 1;
            lastRoomId = roomId || draft.rooms[0]?.id || null;
          }
        } else if (edit.type === "rotate-object") {
          const object = draft.objects.find((o) => o.id === edit.objectId);
          if (!object) continue;
          if (edit.mode === "face-window") {
            const room = draft.rooms.find((r) => r.id === object.roomId);
            const windows = draft.openings.filter((o) => o.roomId === object.roomId && o.type === "window");
            if (room && windows.length) {
              const target = windows
                .map((opening) => ({
                  x:
                    opening.wall === "w"
                      ? room.x
                      : opening.wall === "e"
                        ? room.x + room.w
                        : room.x + opening.offset + opening.width / 2,
                  y:
                    opening.wall === "n"
                      ? room.y
                      : opening.wall === "s"
                        ? room.y + room.h
                        : room.y + opening.offset + opening.width / 2,
                }))
                .sort(
                  (a, b) =>
                    (a.x - object.x) ** 2 + (a.y - object.y) ** 2 -
                    ((b.x - object.x) ** 2 + (b.y - object.y) ** 2)
                )[0];
              object.rotation = Math.atan2(target.x - object.x, target.y - object.y);
              applied += 1;
              lastObjectId = object.id;
            }
          } else if (edit.degrees !== undefined) {
            object.rotation = (object.rotation + (Number(edit.degrees) * Math.PI) / 180) % (Math.PI * 2);
            applied += 1;
            lastObjectId = object.id;
          }
        } else if (edit.type === "move-object") {
          const object = draft.objects.find((o) => o.id === edit.objectId);
          if (!object) continue;
          object.x = Number(edit.x);
          object.y = Number(edit.y);
          const check = canPlaceObject(draft, object);
          if (!check.ok) warnings.push(describeCollision(draft, check));
          applied += 1;
          lastObjectId = object.id;
        } else if (edit.type === "set-ceiling-height") {
          const room = draft.rooms.find((r) => r.id === edit.roomId);
          if (!room) continue;
          room.ceilingHeight = clamp(Number(edit.height) || room.ceilingHeight, 2.1, 5);
          applied += 1;
          lastRoomId = room.id;
        }
      } catch (error) {
        console.warn("[planwalk] edit failed", edit, error);
        warnings.push("One edit could not be applied.");
      }
    }
  });

  if (lastObjectId) store.selectObject(lastObjectId);
  else if (lastRoomId) store.selectRoom(lastRoomId);

  return { ok: applied > 0, applied, warnings };
}

export function projectSummaryForAI(project) {
  const mpu = metersPerUnit(project);
  return {
    rooms: project.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      widthMeters: +(room.w * mpu).toFixed(2),
      depthMeters: +(room.h * mpu).toFixed(2),
      ceilingMeters: +room.ceilingHeight.toFixed(2),
      walls: room.materials.wall.name,
      floor: room.materials.floor.name,
      objects: project.objects
        .filter((o) => o.roomId === room.id)
        .map((o) => ({ id: o.id, type: o.type, name: objectDisplayName(o) })),
    })),
    openings: project.openings.map((o) => ({
      roomId: o.roomId,
      type: o.type,
      wall: o.wall,
      widthMeters: +(o.width * mpu).toFixed(2),
    })),
  };
}

export function areaLabelForRoom(room, project) {
  return roomArea(room) * metersPerUnit(project) ** 2;
}
