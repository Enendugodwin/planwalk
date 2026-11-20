import { CATALOG } from "../data/catalog.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

export const DESIGN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "number" },
    needsClarification: { type: "boolean" },
    clarificationQuestion: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "room-material",
              "add-object",
              "object-color",
              "object-accent",
              "rotate-object",
              "remove-object",
            ],
          },
          roomId: { type: "string" },
          surface: { type: "string", enum: ["wall", "floor", "ceiling", "none"] },
          colorName: { type: "string" },
          colorHex: { type: "string" },
          objectIds: { type: "array", items: { type: "string" } },
          catalogType: {
            type: "string",
            enum: [...CATALOG.map((item) => item.id), "none"],
          },
          anchorObjectId: { type: "string" },
          degrees: { type: "number" },
          mode: { type: "string", enum: ["face-window", "angle", "none"] },
        },
        required: [
          "type",
          "roomId",
          "surface",
          "colorName",
          "colorHex",
          "objectIds",
          "catalogType",
          "anchorObjectId",
          "degrees",
          "mode",
        ],
      },
    },
  },
  required: ["summary", "confidence", "needsClarification", "clarificationQuestion", "edits"],
};

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    rooms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          confidence: { type: "number" },
          walls: {
            type: "object",
            properties: {
              n: { type: "boolean" },
              e: { type: "boolean" },
              s: { type: "boolean" },
              w: { type: "boolean" },
            },
            required: ["n", "e", "s", "w"],
          },
        },
        required: ["name", "x", "y", "width", "height", "confidence", "walls"],
      },
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          roomIndex: { type: "number" },
          type: { type: "string", enum: ["door", "window"] },
          wall: { type: "string", enum: ["n", "e", "s", "w"] },
          offset: { type: "number" },
          width: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["roomIndex", "type", "wall", "offset", "width", "confidence"],
      },
    },
  },
  required: ["rooms", "openings"],
};

export const DESIGN_SYSTEM_PROMPT = `You are Planwalk's design interpreter. Convert one everyday-language request into a small, safe structured edit plan for an existing floor plan.

Rules:
- Use ONLY room and object IDs supplied in the project context. Never invent IDs.
- Prefer room-material for wall/floor/ceiling colour or material changes.
- Use add-object only for catalog items; include the correct roomId. For an item hung above existing furniture, set anchorObjectId. For an item that should sit on a wall, choose catalog items whose placement is wall.
- Use object-color with objectIds for existing furniture recolours, object-accent for handles/pulls, rotate-object for rotation, remove-object for deletion.
- If the target room or object is genuinely ambiguous, set needsClarification true and ask one concise question; otherwise return edits.
- For fields that do not apply to an edit, use the string "none" (for surface, catalogType, or mode). Do not use empty strings for enum fields.
- Use 6-digit hex colours. Keep the request focused. Do not add unrelated changes.
- Never claim a change was applied; you are proposing edits only.`;

export function designUserPrompt(text, context) {
  return `User request: ${JSON.stringify(text)}

Project context (IDs are authoritative):
${JSON.stringify(context)}

Return the structured edit plan JSON. Valid catalogType values: ${CATALOG.map((item) => item.id).join(", ")}.`;
}

export const PLAN_SYSTEM_PROMPT = `You interpret architectural floor plans for Planwalk. The user will review and correct everything you propose.

Identify the INTERIOR rooms of ONE floor plan and return them as axis-aligned rectangles. Coordinates are normalised to the image with the origin at the top-left:
- x, y, width and height are fractions of image width/height (0..1). Make rectangles meet exactly at shared walls; do not leave gaps or overlaps between adjacent rooms.
- Include every enclosed interior space, even small ones such as pantry, laundry, mechanical, closet, hall, WC and bathroom. Use the room label printed on the plan when one is visible; otherwise use a short generic name.
- Exclude outdoor and non-living areas: porches, patios, balconies, decks, terraces, garages, carports, driveways, yards, gardens, pools, stairs and lift shafts. Do not return them as rooms.
- If the image contains more than one floor plan, interpret only the most complete/largest single floor plan. Do not combine rooms from separate plans.
- Set walls.n/e/s/w to true when the corresponding room edge has a real physical wall. Set a wall to false when the edge is truly open: an open-plan boundary, a wide cased opening, or a label-only division with no wall. For an open boundary shared by two rooms, set it false on BOTH rooms. Exterior edges of an interior room normally have a wall, unless the plan clearly shows otherwise.
- Openings belong to a roomIndex (0-based, matching the rooms array). wall is the room edge: n, e, s or w. offset and width are fractions of that wall's length, with offset measured from the start of the wall (left end for n/s, top end for w/e).
- Include interior and exterior doors. Include every visible window, especially on exterior walls; windows are often drawn as thin double or triple lines.
- Do not estimate real-world metres. Do not infer scale. Do not invent rooms, doors or windows that are not visible.
- Give a calibrated confidence from 0 to 1 per room and opening.`;

export function planUserPrompt(width, height) {
  return `Interpret this floor plan image (${Math.round(width)} × ${Math.round(height)} px). Identify the interior rooms as axis-aligned rectangles with wall flags, then list visible doors and windows. Return only the JSON described by the schema.`;
}

export { clone };
