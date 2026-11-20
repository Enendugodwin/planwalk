import { CATALOG_BY_ID, NAMED_COLORS, findNamedColor } from "../data/catalog.js";
import { objectDisplayName } from "../model/project.js";
import { uid } from "../util.js";
import { generateStructured } from "./firebase.js";
import { DESIGN_SCHEMA, DESIGN_SYSTEM_PROMPT, designUserPrompt } from "./schemas.js";

const SURFACES = new Set(["wall", "floor", "ceiling"]);

function normalizeHex(value) {
  if (typeof value !== "string") return null;
  let hex = value.trim();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase();
  }
  return null;
}

function resolveColor(edit) {
  const named = findNamedColor(edit.colorName || "") ||
    NAMED_COLORS.find((color) => color.name.toLowerCase() === String(edit.colorName || "").toLowerCase());
  const hex = normalizeHex(edit.colorHex) || named?.hex || null;
  if (!hex) return null;
  return {
    hex,
    name: edit.colorName || named?.name || "Custom colour",
    material: named?.material || "paint",
  };
}

function buildContext(project, selection) {
  const selectedRoom = selection.kind === "room" ? selection.id : null;
  const selectedObject = selection.kind === "object" ? selection.id : null;
  return {
    selection: { roomId: selectedRoom, objectId: selectedObject },
    rooms: project.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      walls: room.materials.wall.name,
      floor: room.materials.floor.name,
      ceiling: room.materials.ceiling.name,
      objects: project.objects
        .filter((object) => object.roomId === room.id)
        .map((object) => ({
          id: object.id,
          type: object.type,
          name: objectDisplayName(object),
          placement: object.placement,
          color: object.color,
        })),
    })),
  };
}

function describeAdd(def, room, color, anchor) {
  const colour = color ? `${color.name.toLowerCase()} ` : "";
  if (anchor) {
    return `Hang a ${colour}${def.name.toLowerCase()} above the ${objectDisplayName(anchor).toLowerCase()} in ${room.name.toLowerCase()}`;
  }
  return `Add a ${colour}${def.name.toLowerCase()} to ${room.name.toLowerCase()}`;
}

/** Validate every AI-proposed edit against the current scene IDs. */
function validateAIData(data, project) {
  const edits = [];
  const warnings = [];
  const rooms = new Map(project.rooms.map((room) => [room.id, room]));
  const objects = new Map(project.objects.map((object) => [object.id, object]));

  for (const raw of Array.isArray(data.edits) ? data.edits : []) {
    if (!raw || typeof raw !== "object") continue;
    const type = String(raw.type || "").trim();

    if (type === "room-material") {
      const room = rooms.get(raw.roomId);
      const surface = String(raw.surface || "").toLowerCase();
      if (!room || !SURFACES.has(surface)) {
        warnings.push("A room material proposal referenced an unknown room.");
        continue;
      }
      const color = resolveColor(raw);
      if (!color) {
        warnings.push("A material proposal had no usable colour.");
        continue;
      }
      const kind =
        surface === "floor"
          ? ["wood", "stone", "concrete", "carpet", "tile"].includes(color.material)
            ? color.material
            : color.material === "fabric"
              ? "carpet"
              : "wood"
          : surface === "wall"
            ? ["plaster", "wood", "stone", "tile", "fabric"].includes(color.material)
              ? color.material
              : "paint"
            : ["plaster", "wood"].includes(color.material)
              ? color.material
              : "paint";
      const label =
        surface === "floor"
          ? `Set the ${room.name.toLowerCase()} floor to ${color.name.toLowerCase()}`
          : surface === "ceiling"
            ? `Paint the ${room.name.toLowerCase()} ceiling ${color.name.toLowerCase()}`
            : `Paint the ${room.name.toLowerCase()} walls ${color.name.toLowerCase()}`;
      edits.push({
        type: "room-material",
        roomId: room.id,
        surface,
        name: color.name,
        color: color.hex,
        kind,
        description: label,
      });
      continue;
    }

    if (type === "add-object") {
      const room = rooms.get(raw.roomId);
      const def = CATALOG_BY_ID[raw.catalogType];
      if (!room || !def) {
        warnings.push("A furniture proposal used an item or room we couldn't verify.");
        continue;
      }
      const color = resolveColor(raw);
      const anchor = raw.anchorObjectId ? objects.get(raw.anchorObjectId) : null;
      const objectId = uid("obj");
      edits.push({
        type: "add-object",
        objectId,
        roomId: room.id,
        catalogType: def.id,
        color: color?.hex,
        anchorObjectId: anchor?.id || null,
        description: describeAdd(def, room, color, anchor),
      });
      continue;
    }

    if (type === "object-color" || type === "object-accent") {
      const ids = Array.isArray(raw.objectIds) ? raw.objectIds.filter((id) => objects.has(id)) : [];
      if (!ids.length) {
        warnings.push("An item finish proposal had no matching objects.");
        continue;
      }
      const color = resolveColor(raw);
      if (!color) {
        warnings.push("An item finish proposal had no usable colour.");
        continue;
      }
      const names = [...new Set(ids.map((id) => objectDisplayName(objects.get(id)).toLowerCase()))];
      edits.push({
        type,
        objectIds: ids,
        color: color.hex,
        description:
          type === "object-accent"
            ? `Add ${color.name.toLowerCase()} handles to the ${names.join(" and ")}`
            : `Recolour the ${names.join(" and ")} ${color.name.toLowerCase()}`,
      });
      continue;
    }

    if (type === "rotate-object") {
      const object = objects.get(raw.objectId);
      if (!object) {
        warnings.push("A rotation proposal referenced an item that isn't in the room.");
        continue;
      }
      const degrees = Number(raw.degrees);
      const faceWindow = raw.mode === "face-window";
      edits.push({
        type: "rotate-object",
        objectId: object.id,
        mode: faceWindow ? "face-window" : "angle",
        degrees: Number.isFinite(degrees) ? degrees : 90,
        description: faceWindow
          ? `Turn the ${objectDisplayName(object).toLowerCase()} toward the window`
          : `Rotate the ${objectDisplayName(object).toLowerCase()} ${Number.isFinite(degrees) ? degrees : 90}°`,
      });
      continue;
    }

    if (type === "remove-object") {
      const object = objects.get(raw.objectId);
      if (!object) {
        warnings.push("A removal proposal referenced an item that isn't here.");
        continue;
      }
      edits.push({
        type: "remove-object",
        objectId: object.id,
        description: `Remove the ${objectDisplayName(object).toLowerCase()}`,
      });
    }
  }

  return { edits, warnings };
}

/**
 * Cloud or on-device design interpretation. The caller is responsible for
 * consent. All edits are checked against current IDs before they reach the
 * preview.
 */
export async function interpretPromptAI(text, project, selection) {
  const context = buildContext(project, selection);
  const prompt = `${DESIGN_SYSTEM_PROMPT}\n\n${designUserPrompt(text, context)}`;
  const { data, inferenceSource } = await generateStructured({
    prompt,
    schema: DESIGN_SCHEMA,
  });

  const confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0.5));
  if (data.needsClarification && data.clarificationQuestion) {
    return {
      source: "ai",
      inferenceSource,
      confidence,
      summary: data.clarificationQuestion,
      explanation: "The model needs one detail before proposing changes.",
      edits: [],
      clarification: {
        question: data.clarificationQuestion,
        options: [],
      },
      originalText: text,
      noMatch: false,
      warnings: [],
    };
  }

  const { edits, warnings } = validateAIData(data, project);
  if (!edits.length) {
    return {
      source: "ai",
      inferenceSource,
      confidence,
      summary: "No verified edit proposed",
      explanation:
        "The model's suggestion couldn't be verified against this scene, so nothing was applied. Try naming the room and material directly.",
      edits: [],
      clarification: null,
      originalText: text,
      noMatch: true,
      warnings,
    };
  }

  const descriptions = edits.map((edit) => edit.description).filter(Boolean);
  return {
    source: "ai",
    inferenceSource,
    confidence,
    summary:
      descriptions.length <= 2
        ? descriptions.join(" · ")
        : `${descriptions[0]} +${descriptions.length - 1} more`,
    explanation:
      String(data.summary || "").trim() ||
      `${edits.length} verified change${edits.length > 1 ? "s" : ""} ready to preview.`,
    edits,
    clarification: null,
    originalText: text,
    noMatch: false,
    warnings,
  };
}

export function inferenceSourceLabel(source) {
  const key = String(source || "").toLowerCase();
  if (key === "on_device") return "On this device";
  if (key === "in_cloud") return "Cloud fallback";
  return "Inference source not reported";
}
