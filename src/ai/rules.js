import { CATALOG, CATALOG_BY_ID, findNamedColor } from "../data/catalog.js";
import { objectDisplayName } from "../model/project.js";
import { uid } from "../util.js";

const ADD_VERBS = /\b(add|put|place|create|include|bring|install|hang|set)\b/;
const REMOVE_VERBS = /\b(remove|delete|take out|get rid of|drop|clear)\b/;
const ROTATE_VERBS = /\b(rotate|turn|angle|face|facing|orient|reposition)\b/;
const HANDLE_WORDS = /\b(handles?|pulls?|knobs?)\b/;
const ALL_WORDS = /\b(all|every|entire|whole|throughout)\b/;
const DEFAULT_ROOM_ALIASES = {
  living: ["living room", "living", "lounge", "sitting room", "family room"],
  kitchen: ["kitchen", "cookhouse"],
  bedroom: ["bedroom", "bed room", "main bedroom", "master bedroom"],
  bathroom: ["bathroom", "bath", "washroom", "wc"],
  hall: ["entry hall", "hall", "hallway", "entry", "entrance", "foyer"],
  study: ["study", "office", "den", "workspace"],
};

const FURNITURE_ALIASES = [
  ["kitchen cabinets", "kitchenCabinets"],
  ["kitchen cabinetry", "kitchenCabinets"],
  ["kitchen island", "kitchenIsland"],
  ["queen bed", "queenBed"],
  ["double bed", "queenBed"],
  ["king bed", "queenBed"],
  ["single bed", "singleBed"],
  ["twin bed", "singleBed"],
  ["reading chair", "readingChair"],
  ["wingback chair", "readingChair"],
  ["accent chair", "readingChair"],
  ["dining chair", "diningChair"],
  ["coffee table", "coffeeTable"],
  ["dining table", "diningTable"],
  ["side table", "sideTable"],
  ["round table", "roundTable"],
  ["bedside table", "sideTable"],
  ["nightstand", "sideTable"],
  ["floor lamp", "floorLamp"],
  ["table lamp", "tableLamp"],
  ["pendant light", "pendant"],
  ["pendant lamp", "pendant"],
  ["wall art", "wallArt"],
  ["fiddle leaf", "plantFig"],
  ["fiddle-leaf", "plantFig"],
  ["olive tree", "oliveTree"],
  ["small plant", "smallPlant"],
  ["armchair", "armchair"],
  ["arm chair", "armchair"],
  ["bookshelf", "bookshelf"],
  ["bookcase", "bookshelf"],
  ["cabinets", "kitchenCabinets"],
  ["cabinetry", "kitchenCabinets"],
  ["cabinet", "kitchenCabinets"],
  ["wardrobe", "wardrobe"],
  ["closet", "wardrobe"],
  ["sideboard", "sideboard"],
  ["ottoman", "ottoman"],
  ["pouf", "ottoman"],
  ["daybed", "daybed"],
  ["chaise", "daybed"],
  ["mirror", "mirror"],
  ["clock", "clock"],
  ["sofa", "sofa"],
  ["couch", "sofa"],
  ["settee", "sofa"],
  ["chair", "diningChair"],
  ["desk", "desk"],
  ["table", "diningTable"],
  ["lamp", "floorLamp"],
  ["light", "floorLamp"],
  ["rug", "rug"],
  ["carpet", "rug"],
  ["plant", "plantFig"],
  ["tree", "oliveTree"],
  ["art", "wallArt"],
  ["painting", "wallArt"],
  ["picture", "wallArt"],
  ["bed", "queenBed"],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function includesTerm(text, term) {
  const re = new RegExp(`(^|[^a-z])${escapeRe(term)}(s|es)?([^a-z]|$)`);
  return re.test(text);
}

function normalize(text) {
  return ` ${String(text || "").toLowerCase().replace(/[–—]/g, "-")} `;
}

function matchRooms(project, text) {
  const haystack = normalize(text).replace(/-/g, " ");
  const matches = new Map();
  for (const room of project.rooms) {
    const terms = new Set();
    const nameLower = room.name.toLowerCase();
    terms.add(nameLower);
    for (const word of nameLower.split(/[^a-z0-9]+/)) {
      if (word.length >= 4 && !["room", "entry", "main"].includes(word)) terms.add(word);
    }
    for (const [key, aliases] of Object.entries(DEFAULT_ROOM_ALIASES)) {
      if (nameLower.includes(key)) {
        if (key === "hall") {
          terms.add("hall");
          terms.add("hallway");
        } else if (key === "study") {
          terms.add("study");
          terms.add("office");
        } else {
          for (const alias of aliases) terms.add(alias);
        }
      }
    }
    for (const term of terms) {
      if (!term) continue;
      if (includesTerm(haystack, term)) {
        const previous = matches.get(room.id);
        if (!previous || term.length > previous.term.length) {
          matches.set(room.id, { room, term });
        }
      }
    }
  }
  return [...matches.values()].sort((a, b) => b.term.length - a.term.length);
}

function detectSurfaces(text) {
  const surfaces = [];
  if (/\b(walls?|wallpaper)\b/.test(text)) surfaces.push("wall");
  if (/\b(floors?|flooring)\b/.test(text)) surfaces.push("floor");
  if (/\b(ceilings?)\b/.test(text)) surfaces.push("ceiling");
  return surfaces;
}

function detectFurniture(text) {
  const haystack = normalize(text).replace(/-/g, " ");
  const found = [];
  for (const [alias, type] of FURNITURE_ALIASES) {
    if (!includesTerm(haystack, alias)) continue;
    if (found.some((entry) => entry.type === type)) continue;
    found.push({ type, alias, index: haystack.indexOf(alias) });
  }
  return found.sort((a, b) => a.index - b.index);
}

function isAddRoomReference(text) {
  return /\b(in|into|to|inside)\s+the\s+[a-z][a-z\s-]{2,}/.test(text);
}

function materialsFor(color, surface) {
  let kind = "paint";
  if (surface === "floor") {
    if (["wood", "stone", "concrete", "carpet", "fabric", "tile"].includes(color.material)) {
      kind = color.material === "fabric" ? "carpet" : color.material;
    } else {
      kind = "wood";
    }
  } else if (surface === "wall") {
    if (["plaster", "wood", "stone", "tile", "fabric"].includes(color.material)) {
      kind = color.material;
    }
  } else if (surface === "ceiling") {
    if (["plaster", "wood"].includes(color.material)) {
      kind = color.material;
    }
  }
  return { name: color.name, color: color.hex, kind };
}

function describeMaterial(room, surface, color, allRooms) {
  const paint = color.name.toLowerCase();
  if (surface === "floor") {
    return allRooms
      ? `Set every floor to ${paint}`
      : `Set the ${room.name.toLowerCase()} floor to ${paint}`;
  }
  if (surface === "ceiling") {
    return allRooms
      ? `Paint all ceilings ${paint}`
      : `Paint the ${room.name.toLowerCase()} ceiling ${paint}`;
  }
  return allRooms
    ? `Paint all walls ${paint}`
    : `Paint the ${room.name.toLowerCase()} walls ${paint}`;
}

function surfaceEdit(room, surface, color, allRooms) {
  return {
    type: "room-material",
    roomId: room.id,
    surface,
    name: color.name,
    color: color.hex,
    kind: materialsFor(color, surface).kind,
    description: describeMaterial(room, surface, color, allRooms),
  };
}

function objectColorEdit(object, color) {
  return {
    type: "object-color",
    objectIds: [object.id],
    color: color.hex,
    description: `Recolour the ${objectDisplayName(object).toLowerCase()} ${color.name.toLowerCase()}`,
  };
}

function objectsOfType(project, roomIds, type) {
  const set = new Set(roomIds);
  return project.objects.filter((o) => set.has(o.roomId) && o.type === type);
}

function chooseTargetObjects(project, roomIds, type, selectedObject) {
  if (selectedObject && (!type || selectedObject.type === type) && roomIds.includes(selectedObject.roomId)) {
    return [selectedObject];
  }
  if (!type) return [];
  return objectsOfType(project, roomIds, type);
}

function parseDegrees(text) {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*(?:°|deg|degree|degrees)/);
  return match ? Number(match[1]) : null;
}

function optionRooms(project) {
  return project.rooms.map((room) => ({
    label: room.name,
    roomId: room.id,
  }));
}

/**
 * Deterministic first pass. Returns a preview-shaped design plan; the caller
 * may escalate to Firebase AI when this pass is not confident.
 */
export function interpretPromptRules(text, project, selection = {}, opts = {}) {
  const raw = String(text || "").trim();
  if (!raw) {
    return noMatch("Describe a change in a few words — for example “sage walls in the bedroom”.");
  }
  const normalized = normalize(raw);
  const selectedObject =
    selection.kind === "object" ? project.objects.find((o) => o.id === selection.id) : null;
  const selectedRoom =
    selection.kind === "room"
      ? project.rooms.find((r) => r.id === selection.id)
      : selectedObject
        ? project.rooms.find((r) => r.id === selectedObject.roomId)
        : null;

  const globalRooms = matchRooms(project, raw);
  const globalAll = ALL_WORDS.test(normalized) && detectSurfaces(normalized).length > 0;
  const forcedRoom = opts.forcedRoomId
    ? project.rooms.find((room) => room.id === opts.forcedRoomId)
    : null;

  const segments = raw
    .split(/\s*(?:,|;|\.| and then | and )\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const edits = [];
  let usedDefaultRoom = false;
  let carriedRooms = forcedRoom ? [forcedRoom] : globalAll ? project.rooms : globalRooms.map((m) => m.room);
  let lastAddedId = null;
  let lastAddedType = null;
  let unresolvedAdd = null;
  let note = "";

  const resolveRooms = (segment) => {
    const local = matchRooms(project, segment);
    if (local.length) {
      carriedRooms = local.map((m) => m.room);
      return carriedRooms;
    }
    if (forcedRoom) return [forcedRoom];
    if (globalAll) return project.rooms;
    if (carriedRooms.length) return carriedRooms;
    if (selectedRoom) {
      usedDefaultRoom = true;
      return [selectedRoom];
    }
    return [];
  };

  for (const segment of segments) {
    const seg = normalize(segment);
    const surfaces = detectSurfaces(seg);
    const color = findNamedColor(seg);
    const furniture = detectFurniture(seg);
    const targetRooms = resolveRooms(segment);
    const allRooms = globalAll || (ALL_WORDS.test(seg) && surfaces.length > 0);

    const unknownRoom = seg.match(
      /\b(?:in|into|to|inside)\s+the\s+(nursery|garage|attic|balcony|terrace|basement|loft|guest room|kids room|dining room|utility room|laundry room)\b/
    );
    if (unknownRoom && !matchRooms(project, segment).length && !forcedRoom) {
      return clarify(
        raw,
        `I couldn't find the ${unknownRoom[1]} in this project. Which room did you mean?`,
        optionRooms(project),
        "No room in the current plan matches that name."
      );
    }

    // Handles / pulls are a finish detail on cabinetry, not a new object.
    if (HANDLE_WORDS.test(seg) && (color || /brass|gold|black|nickel|chrome/.test(seg))) {
      const handleColor = color || findNamedColor("brass");
      const cabinets = targetRooms.flatMap((room) => objectsOfType(project, [room.id], "kitchenCabinets"));
      if (cabinets.length) {
        edits.push({
          type: "object-accent",
          objectIds: cabinets.map((c) => c.id),
          color: handleColor.hex,
          description: `Add ${handleColor.name.toLowerCase()} handles to the kitchen cabinetry`,
        });
        // If the same segment also paints the cabinets, keep that edit too.
        const cabinetColor = findNamedColor(
          segment.replace(HANDLE_WORDS, " ").replace(/\b(brass|gold)\b/gi, " ")
        );
        if (cabinetColor) {
          edits.push({
            type: "object-color",
            objectIds: cabinets.map((c) => c.id),
            color: cabinetColor.hex,
            description: `Finish the kitchen cabinetry in ${cabinetColor.name.toLowerCase()}`,
          });
        }
        continue;
      }
    }

    // Material changes -------------------------------------------------
    if (surfaces.length && color) {
      if (!targetRooms.length) {
        return clarify(raw, "Which room should I update?", optionRooms(project), "No room matched that request.");
      }
      for (const surface of surfaces) {
        const rooms = allRooms ? project.rooms : targetRooms;
        for (const room of rooms) {
          edits.push(surfaceEdit(room, surface, color, allRooms));
        }
      }
      continue;
    }

    // Furniture / decor -----------------------------------------------
    if (furniture.length) {
      const isAdd = ADD_VERBS.test(seg);
      const isRemove = REMOVE_VERBS.test(seg);
      const isRotate = ROTATE_VERBS.test(seg);
      const item = furniture[0];
      const def = CATALOG_BY_ID[item.type];

      if (isRemove) {
        if (!targetRooms.length) {
          return clarify(raw, "Which room is that item in?", optionRooms(project), "No room matched that request.");
        }
        const targets = chooseTargetObjects(project, targetRooms.map((r) => r.id), item.type, selectedObject);
        if (!targets.length) {
          return noMatch(
            `I couldn't find ${/^[aeiou]/i.test(def.name) ? "an" : "a"} ${def.name.toLowerCase()} in ${targetRooms[0].name}.`,
            "Try naming the room or add the item first."
          );
        }
        for (const object of targets) {
          edits.push({
            type: "remove-object",
            objectId: object.id,
            description: `Remove the ${def.name.toLowerCase()} from ${targetRooms[0].name.toLowerCase()}`,
          });
        }
        continue;
      }

      if (isRotate && !isAdd) {
        const target = chooseTargetObjects(
          project,
          targetRooms.map((r) => r.id),
          item.type,
          selectedObject
        )[0];
        if (!target) {
          return noMatch(`There's no ${def.name.toLowerCase()} to turn in this room yet.`);
        }
        const degrees = parseDegrees(seg);
        const faceWindow = /(window|view|light)/.test(seg);
        edits.push({
          type: "rotate-object",
          objectId: target.id,
          mode: faceWindow ? "face-window" : "angle",
          degrees: degrees ?? (faceWindow ? undefined : 90),
          description: faceWindow
            ? `Turn the ${def.name.toLowerCase()} toward the window`
            : `Rotate the ${def.name.toLowerCase()} ${degrees ?? 90}°`,
        });
        continue;
      }

      if (isAdd) {
        if (!targetRooms.length) {
          unresolvedAdd = { item, def, color, raw };
          continue;
        }
        if (allRooms) {
          return clarify(raw, "Which room should the new piece go in?", optionRooms(project), "Multi-room placement isn't automatic.");
        }
        const room = targetRooms[0];
        const anchor = furniture.length > 1
          ? furniture.slice(1).map((f) => objectsOfType(project, [room.id], f.type)[0]).find(Boolean)
          : null;
        const objectId = uid("obj");
        const wallItem = def.placement === "wall";
        edits.push({
          type: "add-object",
          objectId,
          roomId: room.id,
          catalogType: item.type,
          color: color?.hex,
          anchorObjectId: anchor?.id || null,
          rotation: undefined,
          description: anchor
            ? `Hang a ${color ? color.name.toLowerCase() + " " : ""}${def.name.toLowerCase()} above the ${objectDisplayName(anchor).toLowerCase()} in ${room.name.toLowerCase()}`
            : `Add a ${color ? color.name.toLowerCase() + " " : ""}${def.name.toLowerCase()} to ${room.name.toLowerCase()}`,
        });
        lastAddedId = objectId;
        lastAddedType = item.type;
        if (color && /handle|pull|knob/.test(seg)) {
          edits.push({
            type: "object-accent",
            objectIds: [objectId],
            color: color.hex,
            description: `Add ${color.name.toLowerCase()} handles`,
          });
        }
        continue;
      }

      // Recolour existing items.
      if (color) {
        if (!targetRooms.length) {
          return clarify(raw, "Which room should I restyle?", optionRooms(project), "No room matched that request.");
        }
        const targets = chooseTargetObjects(project, targetRooms.map((r) => r.id), item.type, selectedObject);
        if (!targets.length) {
          return noMatch(
            `There's no ${def.name.toLowerCase()} in ${targetRooms[0].name} yet.`,
            `Try “add a ${def.name.toLowerCase()} to ${targetRooms[0].name.toLowerCase()}” first.`
          );
        }
        for (const object of targets) edits.push(objectColorEdit(object, color));
        continue;
      }
    }

    // "Rotate it toward the window" after an add in the same request.
    if (lastAddedId && ROTATE_VERBS.test(seg) && /window|view/.test(seg)) {
      const def = CATALOG_BY_ID[lastAddedType];
      edits.push({
        type: "rotate-object",
        objectId: lastAddedId,
        mode: "face-window",
        description: `Turn the ${def.name.toLowerCase()} toward the window`,
      });
      continue;
    }

    // Rotate the selected item with a pronoun.
    if (ROTATE_VERBS.test(seg) && /\b(it|this|that|selected)\b/.test(seg) && selectedObject) {
      const degrees = parseDegrees(seg);
      const faceWindow = /window|view/.test(seg);
      edits.push({
        type: "rotate-object",
        objectId: selectedObject.id,
        mode: faceWindow ? "face-window" : "angle",
        degrees: degrees ?? 90,
        description: faceWindow
          ? `Turn the ${objectDisplayName(selectedObject).toLowerCase()} toward the window`
          : `Rotate the ${objectDisplayName(selectedObject).toLowerCase()} ${degrees ?? 90}°`,
      });
      continue;
    }

    // Colour-only phrasing, e.g. "make it sage".
    if (color && !furniture.length && !surfaces.length && /paint|make|colour|color|change/.test(seg) && targetRooms.length) {
      for (const room of targetRooms) {
        edits.push(surfaceEdit(room, "wall", color, false));
      }
    }
  }

  // A trailing "rotate it toward the window" may have been consumed before
  // the add segment was processed; add it now if the prompt contains both.
  if (lastAddedId && /rotate|turn/.test(normalized) && /window/.test(normalized)) {
    const already = edits.some((e) => e.type === "rotate-object" && e.objectId === lastAddedId);
    if (!already) {
      const def = CATALOG_BY_ID[lastAddedType];
      edits.push({
        type: "rotate-object",
        objectId: lastAddedId,
        mode: "face-window",
        description: `Turn the ${def.name.toLowerCase()} toward the window`,
      });
    }
  }

  if (unresolvedAdd && !edits.length) {
    return clarify(
      raw,
      `Which room should the ${unresolvedAdd.def.name.toLowerCase()} go in?`,
      optionRooms(project),
      "I couldn't match a room from that request."
    );
  }

  if (!edits.length) {
    if (/nursery|garage|attic|balcony|terrace|basement|loft/.test(normalized) && isAddRoomReference(normalized)) {
      return clarify(raw, "Which room did you mean?", optionRooms(project), "That room isn't part of this project yet.");
    }
    return noMatch(
      "I couldn't turn that into a safe edit yet.",
      "Try naming a room and a change — for example “paint the bedroom walls sage green” or “add a reading chair”."
    );
  }

  const unique = dedupeEdits(edits);
  const descriptions = unique.map((e) => e.description).filter(Boolean);
  const summary = descriptions.length <= 2 ? descriptions.join(" · ") : `${descriptions[0]} +${descriptions.length - 1} more`;
  const confidence = usedDefaultRoom ? 0.68 : 0.92;

  if (usedDefaultRoom) note = "Using the room you have selected.";
  if (globalAll) note = "Applying to every room.";

  return {
    source: "rules",
    inferenceSource: null,
    confidence,
    summary,
    explanation: note || `${unique.length} change${unique.length > 1 ? "s" : ""} ready to preview.`,
    edits: unique,
    clarification: null,
    originalText: raw,
    noMatch: false,
  };
}

function dedupeEdits(edits) {
  const seen = new Set();
  const out = [];
  for (const edit of edits) {
    let key;
    if (edit.type === "room-material") key = `mat:${edit.roomId}:${edit.surface}`;
    else if (edit.type === "add-object") key = `add:${edit.objectId}`;
    else if (edit.type === "object-color") key = `color:${edit.objectIds?.join(",")}`;
    else if (edit.type === "object-accent") key = `accent:${edit.objectIds?.join(",")}`;
    else if (edit.type === "rotate-object") key = `rot:${edit.objectId}`;
    else if (edit.type === "remove-object") key = `rm:${edit.objectId}`;
    else key = JSON.stringify(edit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edit);
  }
  return out;
}

function clarify(originalText, question, options, explanation) {
  return {
    source: "rules",
    inferenceSource: null,
    confidence: 0.4,
    summary: question,
    explanation: explanation || "",
    edits: [],
    clarification: { question, options },
    originalText,
    noMatch: false,
  };
}

function noMatch(explanation, hint = "") {
  return {
    source: "ui",
    inferenceSource: null,
    confidence: 0,
    summary: "No edit proposed",
    explanation: [explanation, hint].filter(Boolean).join(" "),
    edits: [],
    clarification: null,
    originalText: "",
    noMatch: true,
  };
}

export function promptExamples(project) {
  const first = project.rooms[0]?.name || "living room";
  return [
    { label: "Try sage walls", text: `Make the ${first.toLowerCase()} walls sage green.` },
    { label: "Add a reading chair", text: `Add a reading chair to the ${first.toLowerCase()}.` },
    { label: "Switch to oak floors", text: `Change all floors to oak.` },
    { label: "Add a round clock", text: "Add a round clock above the sofa in the living room." },
  ];
}
