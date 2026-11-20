/**
 * Starter catalog. Dimensions are real-world meters (w = x, d = z, h = y).
 * The 3D builders live in src/three/furniture.js.
 */

export const CATALOG = [
  // Seating ---------------------------------------------------------
  {
    id: "sofa",
    name: "Sofa",
    category: "Seating",
    icon: "sofa",
    dims: { w: 2.1, d: 0.92, h: 0.82 },
    color: "#7C8674",
    placement: "floor",
    tags: ["sofa", "couch", "settee", "seating"],
  },
  {
    id: "armchair",
    name: "Armchair",
    category: "Seating",
    icon: "armchair",
    dims: { w: 0.86, d: 0.86, h: 0.88 },
    color: "#B98A6B",
    placement: "floor",
    tags: ["armchair", "chair", "accent chair", "lounge chair"],
  },
  {
    id: "readingChair",
    name: "Reading chair",
    category: "Seating",
    icon: "armchair",
    dims: { w: 0.78, d: 0.84, h: 1.04 },
    color: "#8E6F58",
    placement: "floor",
    tags: ["reading chair", "wingback", "chair", "armchair"],
  },
  {
    id: "diningChair",
    name: "Dining chair",
    category: "Seating",
    icon: "armchair",
    dims: { w: 0.48, d: 0.52, h: 0.86 },
    color: "#A98963",
    placement: "floor",
    tags: ["dining chair", "chair", "seat"],
  },
  {
    id: "ottoman",
    name: "Ottoman",
    category: "Seating",
    icon: "sofa",
    dims: { w: 0.62, d: 0.62, h: 0.42 },
    color: "#B48469",
    placement: "floor",
    tags: ["ottoman", "pouf", "footstool", "stool"],
  },

  // Beds ------------------------------------------------------------
  {
    id: "queenBed",
    name: "Queen bed",
    category: "Beds",
    icon: "bed",
    dims: { w: 1.62, d: 2.08, h: 1.12 },
    color: "#D9D0BE",
    accent: "#9B8064",
    placement: "floor",
    tags: ["queen bed", "double bed", "bed", "bedroom"],
  },
  {
    id: "singleBed",
    name: "Single bed",
    category: "Beds",
    icon: "bed",
    dims: { w: 0.98, d: 2.02, h: 1.0 },
    color: "#CFC9BA",
    accent: "#8E7B66",
    placement: "floor",
    tags: ["single bed", "twin bed", "bed", "guest bed"],
  },
  {
    id: "daybed",
    name: "Daybed",
    category: "Beds",
    icon: "bed",
    dims: { w: 1.9, d: 0.92, h: 0.78 },
    color: "#B8B29F",
    accent: "#7E7663",
    placement: "floor",
    tags: ["daybed", "chaise", "bed", "sofa bed"],
  },

  // Tables ----------------------------------------------------------
  {
    id: "diningTable",
    name: "Dining table",
    category: "Tables",
    icon: "table",
    dims: { w: 1.82, d: 0.92, h: 0.75 },
    color: "#A47E55",
    placement: "floor",
    tags: ["dining table", "table", "kitchen table"],
  },
  {
    id: "coffeeTable",
    name: "Coffee table",
    category: "Tables",
    icon: "table",
    dims: { w: 1.12, d: 0.62, h: 0.4 },
    color: "#9A7752",
    placement: "floor",
    tags: ["coffee table", "table", "low table"],
  },
  {
    id: "desk",
    name: "Desk",
    category: "Tables",
    icon: "table",
    dims: { w: 1.34, d: 0.64, h: 0.75 },
    color: "#B08A60",
    accent: "#4A463F",
    placement: "floor",
    tags: ["desk", "writing desk", "work table", "study"],
  },
  {
    id: "sideTable",
    name: "Side table",
    category: "Tables",
    icon: "table",
    dims: { w: 0.46, d: 0.46, h: 0.55 },
    color: "#8C6E4F",
    placement: "floor",
    tags: ["side table", "nightstand", "bedside table", "end table"],
  },
  {
    id: "roundTable",
    name: "Round side table",
    category: "Tables",
    icon: "table",
    dims: { w: 0.52, d: 0.52, h: 0.5 },
    color: "#7D6249",
    placement: "floor",
    tags: ["round table", "side table", "bistro table"],
  },

  // Storage ---------------------------------------------------------
  {
    id: "wardrobe",
    name: "Wardrobe",
    category: "Storage",
    icon: "storage",
    dims: { w: 1.7, d: 0.6, h: 2.1 },
    color: "#B39B7C",
    accent: "#6B5845",
    placement: "floor",
    tags: ["wardrobe", "closet", "armoire", "storage"],
  },
  {
    id: "bookshelf",
    name: "Bookshelf",
    category: "Storage",
    icon: "storage",
    dims: { w: 0.9, d: 0.35, h: 1.9 },
    color: "#8F7050",
    placement: "floor",
    tags: ["bookshelf", "bookcase", "shelves", "storage"],
  },
  {
    id: "sideboard",
    name: "Sideboard",
    category: "Storage",
    icon: "storage",
    dims: { w: 1.52, d: 0.46, h: 0.78 },
    color: "#9C7E5D",
    accent: "#5C4E3E",
    placement: "floor",
    tags: ["sideboard", "console", "credenza", "storage"],
  },
  {
    id: "kitchenCabinets",
    name: "Kitchen cabinetry",
    category: "Storage",
    icon: "room",
    dims: { w: 2.6, d: 0.64, h: 2.06 },
    color: "#48564B",
    accent: "#B08D57",
    placement: "floor",
    tags: ["kitchen cabinets", "cabinets", "cabinetry", "kitchen", "handles", "pulls"],
  },
  {
    id: "kitchenIsland",
    name: "Kitchen island",
    category: "Storage",
    icon: "table",
    dims: { w: 1.8, d: 0.86, h: 0.92 },
    color: "#456052",
    accent: "#D9D2C2",
    placement: "floor",
    tags: ["kitchen island", "island", "counter"],
  },

  // Lighting --------------------------------------------------------
  {
    id: "floorLamp",
    name: "Floor lamp",
    category: "Lighting",
    icon: "lamp",
    dims: { w: 0.36, d: 0.36, h: 1.66 },
    color: "#3C3A34",
    accent: "#E4D6BA",
    placement: "floor",
    tags: ["floor lamp", "lamp", "light", "reading lamp"],
  },
  {
    id: "tableLamp",
    name: "Table lamp",
    category: "Lighting",
    icon: "lamp",
    dims: { w: 0.28, d: 0.28, h: 0.56 },
    color: "#8E7A5C",
    accent: "#EADFC8",
    placement: "floor",
    tags: ["table lamp", "lamp", "light", "bedside lamp"],
  },
  {
    id: "pendant",
    name: "Pendant light",
    category: "Lighting",
    icon: "lighting",
    dims: { w: 0.32, d: 0.32, h: 0.3 },
    color: "#B08D57",
    accent: "#F2E7CD",
    placement: "ceiling",
    tags: ["pendant", "pendant light", "ceiling light", "light"],
  },

  // Plants ----------------------------------------------------------
  {
    id: "plantFig",
    name: "Fiddle-leaf fig",
    category: "Plants",
    icon: "plant",
    dims: { w: 0.58, d: 0.58, h: 1.55 },
    color: "#596B4F",
    accent: "#A88362",
    placement: "floor",
    tags: ["plant", "fig", "fiddle leaf", "tree", "greenery"],
  },
  {
    id: "oliveTree",
    name: "Olive tree",
    category: "Plants",
    icon: "plant",
    dims: { w: 0.52, d: 0.52, h: 1.8 },
    color: "#71805F",
    accent: "#A98B69",
    placement: "floor",
    tags: ["olive tree", "tree", "plant", "greenery"],
  },
  {
    id: "smallPlant",
    name: "Small plant",
    category: "Plants",
    icon: "plant",
    dims: { w: 0.32, d: 0.32, h: 0.46 },
    color: "#68775B",
    accent: "#B08E6C",
    placement: "floor",
    tags: ["plant", "small plant", "greenery", "pot"],
  },

  // Decor -----------------------------------------------------------
  {
    id: "rug",
    name: "Rug",
    category: "Decor",
    icon: "rug",
    dims: { w: 2.4, d: 1.7, h: 0.02 },
    color: "#C6B49A",
    accent: "#8E7B61",
    placement: "floor",
    tags: ["rug", "carpet", "mat"],
  },
  {
    id: "wallArt",
    name: "Wall art",
    category: "Decor",
    icon: "art",
    dims: { w: 1.1, d: 0.05, h: 0.78 },
    color: "#8E7E68",
    accent: "#E7DECD",
    placement: "wall",
    tags: ["wall art", "art", "painting", "picture", "frame"],
  },
  {
    id: "mirror",
    name: "Mirror",
    category: "Decor",
    icon: "mirror",
    dims: { w: 0.62, d: 0.05, h: 1.36 },
    color: "#9F8A6E",
    accent: "#DDE3E2",
    placement: "wall",
    tags: ["mirror", "looking glass", "wall decor"],
  },
  {
    id: "clock",
    name: "Round clock",
    category: "Decor",
    icon: "clock",
    dims: { w: 0.38, d: 0.06, h: 0.38 },
    color: "#3B3A34",
    accent: "#EDE5D4",
    placement: "wall",
    tags: ["clock", "wall clock", "timepiece", "decor"],
  },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((item) => [item.id, item]));

export const CATEGORIES = ["All", "Seating", "Beds", "Tables", "Storage", "Lighting", "Plants", "Decor"];

export const LIBRARY_ICON = {
  Seating: "armchair",
  Beds: "bed",
  Tables: "table",
  Storage: "storage",
  Lighting: "lamp",
  Plants: "plant",
  Decor: "decor",
};

export const FURNITURE_COLORS = [
  { name: "Sage", color: "#7F8B74" },
  { name: "Navy", color: "#3B4659" },
  { name: "Rust", color: "#A6603F" },
  { name: "Oat", color: "#CFC2A8" },
  { name: "Walnut", color: "#7E5A3E" },
  { name: "Charcoal", color: "#3D3C37" },
  { name: "Clay", color: "#B47F66" },
  { name: "Olive", color: "#7C8360" },
  { name: "Cream", color: "#E6DDCA" },
  { name: "Dusty blue", color: "#8699A4" },
];

export const SURFACE_PALETTES = {
  wall: [
    { name: "Warm white", color: "#EFE8DA", kind: "paint" },
    { name: "Chalk", color: "#F6F2E8", kind: "paint" },
    { name: "Oat", color: "#E4D9C4", kind: "paint" },
    { name: "Sage", color: "#AEB7A2", kind: "paint" },
    { name: "Olive", color: "#8E9377", kind: "paint" },
    { name: "Dusty blue", color: "#A4B4BF", kind: "paint" },
    { name: "Clay rose", color: "#D8BFB1", kind: "paint" },
    { name: "Terracotta", color: "#B9785C", kind: "paint" },
    { name: "Charcoal", color: "#4A4A44", kind: "paint" },
    { name: "Navy", color: "#38445A", kind: "paint" },
  ],
  floor: [
    { name: "Light oak", color: "#D8BC92", kind: "wood" },
    { name: "Oak", color: "#C3A273", kind: "wood" },
    { name: "Walnut", color: "#7E5A3E", kind: "wood" },
    { name: "Ash", color: "#D7C7AD", kind: "wood" },
    { name: "Stone", color: "#CFC8B9", kind: "stone" },
    { name: "Terrazzo", color: "#D9D2C3", kind: "stone" },
    { name: "Slate", color: "#A8A79F", kind: "stone" },
    { name: "Concrete", color: "#B9B4A9", kind: "concrete" },
    { name: "Tile", color: "#E3DDD2", kind: "tile" },
    { name: "Carpet", color: "#CEC3AD", kind: "carpet" },
  ],
  ceiling: [
    { name: "Chalk", color: "#F7F3EA", kind: "paint" },
    { name: "Warm white", color: "#EFE8DA", kind: "paint" },
    { name: "Plaster", color: "#EAE3D5", kind: "plaster" },
    { name: "Timber", color: "#C9AE8B", kind: "wood" },
  ],
};

/**
 * Texture choices are deliberately separate from colour. A surface keeps its
 * colour when the user switches from paint to timber or stone.
 */
export const SURFACE_TEXTURES = {
  wall: [
    { kind: "paint", name: "Paint", detail: "Smooth matte finish" },
    { kind: "plaster", name: "Plaster", detail: "Subtle troweled grain" },
    { kind: "wood", name: "Wood", detail: "Panelled timber grain" },
    { kind: "stone", name: "Stone", detail: "Masonry texture" },
    { kind: "tile", name: "Tile", detail: "Square tile grid" },
    { kind: "fabric", name: "Fabric", detail: "Woven wall covering" },
  ],
  floor: [
    { kind: "wood", name: "Wood", detail: "Timber planks" },
    { kind: "stone", name: "Stone", detail: "Stone flags" },
    { kind: "concrete", name: "Concrete", detail: "Poured concrete" },
    { kind: "tile", name: "Tile", detail: "Square tile grid" },
    { kind: "carpet", name: "Carpet", detail: "Soft loop pile" },
  ],
  ceiling: [
    { kind: "paint", name: "Paint", detail: "Smooth ceiling" },
    { kind: "plaster", name: "Plaster", detail: "Subtle troweled grain" },
    { kind: "wood", name: "Timber", detail: "Boarded timber" },
  ],
};

export const OBJECT_TEXTURES = [
  { kind: "smooth", name: "Smooth", detail: "Keep the original finish" },
  { kind: "fabric", name: "Woven", detail: "Linen-like fabric grain" },
  { kind: "wood", name: "Wood", detail: "Timber grain" },
  { kind: "stone", name: "Stone", detail: "Stone texture" },
  { kind: "metal", name: "Metal", detail: "Brushed metal" },
];

/** Named colours understood by the rule-based prompt parser. */
export const NAMED_COLORS = [
  { name: "Warm white", hex: "#EFE8DA", material: "paint", aliases: ["warm white", "warm-white"] },
  { name: "Chalk", hex: "#F6F2E8", material: "paint", aliases: ["chalk", "soft white", "white"] },
  { name: "Off-white", hex: "#F1ECE2", material: "paint", aliases: ["off white", "off-white", "ivory"] },
  { name: "Cream", hex: "#E8DFCB", material: "paint", aliases: ["cream", "creamy"] },
  { name: "Oat", hex: "#E4D9C4", material: "paint", aliases: ["oat", "oatmeal", "beige"] },
  { name: "Sage green", hex: "#AEB7A2", material: "paint", aliases: ["sage green", "sage"] },
  { name: "Olive", hex: "#8E9377", material: "paint", aliases: ["olive", "olive green"] },
  { name: "Forest green", hex: "#5F725C", material: "paint", aliases: ["forest green", "dark green", "green"] },
  { name: "Eucalyptus", hex: "#9FAF9C", material: "paint", aliases: ["eucalyptus", "mint"] },
  { name: "Navy", hex: "#38445A", material: "paint", aliases: ["navy", "navy blue", "midnight blue"] },
  { name: "Dusty blue", hex: "#A4B4BF", material: "paint", aliases: ["dusty blue", "powder blue", "blue"] },
  { name: "Sky", hex: "#BBCBD3", material: "paint", aliases: ["sky blue", "light blue"] },
  { name: "Terracotta", hex: "#B9785C", material: "paint", aliases: ["terracotta", "terra cotta"] },
  { name: "Clay", hex: "#B26A4C", material: "paint", aliases: ["clay", "rust", "rust red"] },
  { name: "Blush", hex: "#D8BEB2", material: "paint", aliases: ["blush", "rose", "pink"] },
  { name: "Charcoal", hex: "#4A4A44", material: "paint", aliases: ["charcoal", "graphite"] },
  { name: "Matte black", hex: "#2A2926", material: "paint", aliases: ["matte black", "black"] },
  { name: "Brass", hex: "#B08D57", material: "metal", aliases: ["brass", "antique brass"] },
  { name: "Gold", hex: "#C2A26A", material: "metal", aliases: ["gold", "gilded"] },
  { name: "Walnut", hex: "#7E5A3E", material: "wood", aliases: ["walnut", "dark wood"] },
  { name: "Oak", hex: "#C3A273", material: "wood", aliases: ["oak", "natural oak", "wood", "natural wood"] },
  { name: "Light oak", hex: "#D8BC92", material: "wood", aliases: ["light oak", "pale oak", "blonde oak", "light wood"] },
  { name: "Ash", hex: "#D7C7AD", material: "wood", aliases: ["ash", "ash wood"] },
  { name: "Stone", hex: "#CFC8B9", material: "stone", aliases: ["stone", "limestone"] },
  { name: "Terrazzo", hex: "#D9D2C3", material: "stone", aliases: ["terrazzo"] },
  { name: "Marble", hex: "#E8E4DA", material: "stone", aliases: ["marble", "carrara"] },
  { name: "Concrete", hex: "#B9B4A9", material: "concrete", aliases: ["concrete", "cement"] },
  { name: "Slate", hex: "#A8A79F", material: "stone", aliases: ["slate", "grey", "gray"] },
  { name: "Linen", hex: "#DED6C7", material: "fabric", aliases: ["linen", "flax"] },
  { name: "Bouclé", hex: "#EDE6D8", material: "fabric", aliases: ["boucle", "bouclé", "boucle cream"] },
  { name: "Leather", hex: "#9A6444", material: "fabric", aliases: ["leather", "cognac", "tan leather"] },
  { name: "Mustard", hex: "#C49A4C", material: "fabric", aliases: ["mustard", "ochre"] },
  { name: "Burgundy", hex: "#6E3F3B", material: "fabric", aliases: ["burgundy", "wine"] },
  { name: "Nickel", hex: "#B7B8B3", material: "metal", aliases: ["nickel", "brushed nickel"] },
  { name: "Chrome", hex: "#C9CCCB", material: "metal", aliases: ["chrome", "polished chrome"] },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find the longest named colour present in a prompt. */
export function findNamedColor(text) {
  const haystack = ` ${String(text || "").toLowerCase()} `;
  let best = null;
  for (const entry of NAMED_COLORS) {
    const aliases = [entry.name.toLowerCase(), ...entry.aliases];
    for (const alias of aliases) {
      const re = new RegExp(`(^|[^a-z])${escapeRe(alias)}([^a-z]|$)`);
      if (re.test(haystack) && (!best || alias.length > best.match.length)) {
        best = { ...entry, color: entry.hex, match: alias };
      }
    }
  }
  return best;
}

export function colorForName(name) {
  const lower = String(name || "").toLowerCase();
  return NAMED_COLORS.find((c) => c.name.toLowerCase() === lower) || null;
}

export function catalogLabel(typeId) {
  return CATALOG_BY_ID[typeId]?.name || typeId;
}
