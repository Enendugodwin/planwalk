import { defaultMaterial } from "../model/project.js";

const mat = (surface, index) => defaultMaterial(surface, index);

const materialSet = (wall, floor, ceiling) => ({
  wall: { ...wall },
  floor: { ...floor },
  ceiling: { ...ceiling },
});

const wall = (name, color) => ({ name, color, kind: "paint" });
const floor = (name, color, kind) => ({ name, color, kind });
const ceiling = (name, color) => ({ name, color, kind: "paint" });

/**
 * The built-in sample: a small, believable apartment drawn to scale.
 * One project unit = one meter, so the plan is already calibrated.
 */
export function createSampleProject() {
  const now = new Date().toISOString();

  return {
    version: 1,
    id: "sample-marlow",
    name: "Marlow apartment",
    unitSystem: "metric",
    scale: {
      calibrated: true,
      metersPerUnit: 1,
      reference: { label: "Sample plan — drawn to scale", meters: 12 },
    },
    plan: {
      name: "Marlow apartment — sample floor plan",
      src: null,
      width: 12,
      height: 9,
      visible: true,
      kind: "vector",
    },
    rooms: [
      {
        id: "r-living",
        name: "Living room",
        x: 0,
        y: 0,
        w: 6.6,
        h: 5.6,
        ceilingHeight: 2.75,
        confidence: 0.99,
        measurement: "calibrated",
        materials: materialSet(
          wall("Warm white", "#EFE8DA"),
          floor("Light oak", "#D8BC92", "wood"),
          ceiling("Chalk", "#F7F3EA")
        ),
      },
      {
        id: "r-kitchen",
        name: "Kitchen",
        x: 6.6,
        y: 0,
        w: 5.4,
        h: 3.4,
        ceilingHeight: 2.6,
        confidence: 0.98,
        measurement: "calibrated",
        materials: materialSet(
          wall("Oat", "#E4D9C4"),
          floor("Terrazzo", "#D9D2C3", "stone"),
          ceiling("Chalk", "#F7F3EA")
        ),
      },
      {
        id: "r-hall",
        name: "Entry hall",
        x: 6.6,
        y: 3.4,
        w: 5.4,
        h: 2.2,
        ceilingHeight: 2.4,
        confidence: 0.96,
        measurement: "calibrated",
        materials: materialSet(
          wall("Chalk", "#F6F2E8"),
          floor("Stone", "#CFC8B9", "stone"),
          ceiling("Chalk", "#F7F3EA")
        ),
      },
      {
        id: "r-bedroom",
        name: "Bedroom",
        x: 0,
        y: 5.6,
        w: 4.6,
        h: 3.4,
        ceilingHeight: 2.65,
        confidence: 0.98,
        measurement: "calibrated",
        materials: materialSet(
          wall("Oat", "#E4D9C4"),
          floor("Walnut", "#7E5A3E", "wood"),
          ceiling("Chalk", "#F7F3EA")
        ),
      },
      {
        id: "r-bath",
        name: "Bathroom",
        x: 4.6,
        y: 5.6,
        w: 2.4,
        h: 3.4,
        ceilingHeight: 2.4,
        confidence: 0.95,
        measurement: "calibrated",
        materials: materialSet(
          wall("Chalk", "#F6F2E8"),
          floor("Slate", "#A8A79F", "stone"),
          ceiling("Chalk", "#F7F3EA")
        ),
      },
      {
        id: "r-study",
        name: "Study",
        x: 7.0,
        y: 5.6,
        w: 5.0,
        h: 3.4,
        ceilingHeight: 2.7,
        confidence: 0.97,
        measurement: "calibrated",
        materials: materialSet(
          wall("Olive", "#8E9377"),
          floor("Oak", "#C3A273", "wood"),
          ceiling("Chalk", "#F7F3EA")
        ),
      },
    ],
    openings: [
      // Living room
      { id: "o-l-n-window", roomId: "r-living", type: "window", wall: "n", offset: 1.5, width: 2.0, height: 1.4, sill: 0.55, confidence: 0.99 },
      { id: "o-l-w-window", roomId: "r-living", type: "window", wall: "w", offset: 2.6, width: 1.5, height: 1.4, sill: 0.7, confidence: 0.98 },
      { id: "o-l-s-door", roomId: "r-living", type: "door", wall: "s", offset: 3.35, width: 0.92, height: 2.05, sill: 0, confidence: 0.99 },
      { id: "o-l-e-kitchen", roomId: "r-living", type: "door", wall: "e", offset: 0.9, width: 1.0, height: 2.1, sill: 0, confidence: 0.99 },
      { id: "o-l-e-hall", roomId: "r-living", type: "door", wall: "e", offset: 4.2, width: 1.0, height: 2.1, sill: 0, confidence: 0.98 },
      // Kitchen
      { id: "o-k-n-window", roomId: "r-kitchen", type: "window", wall: "n", offset: 4.1, width: 1.2, height: 1.15, sill: 1.05, confidence: 0.97 },
      { id: "o-k-e-window", roomId: "r-kitchen", type: "window", wall: "e", offset: 0.8, width: 1.5, height: 1.2, sill: 0.95, confidence: 0.96 },
      // Hall
      { id: "o-h-e-entry", roomId: "r-hall", type: "door", wall: "e", offset: 0.8, width: 1.0, height: 2.15, sill: 0, confidence: 0.99 },
      // Bedroom
      { id: "o-b-w-window", roomId: "r-bedroom", type: "window", wall: "w", offset: 1.0, width: 1.2, height: 1.4, sill: 0.7, confidence: 0.98 },
      { id: "o-b-s-window", roomId: "r-bedroom", type: "window", wall: "s", offset: 1.4, width: 1.8, height: 1.4, sill: 0.6, confidence: 0.98 },
      // Bathroom
      { id: "o-ba-n-door", roomId: "r-bath", type: "door", wall: "n", offset: 0.75, width: 0.85, height: 2.05, sill: 0, confidence: 0.9 },
      // Study
      { id: "o-s-e-window", roomId: "r-study", type: "window", wall: "e", offset: 1.2, width: 1.6, height: 1.4, sill: 0.7, confidence: 0.97 },
      { id: "o-s-n-door", roomId: "r-study", type: "door", wall: "n", offset: 1.5, width: 0.95, height: 2.05, sill: 0, confidence: 0.96 },
    ],
    objects: [
      // Living room
      {
        id: "obj-sofa", type: "sofa", roomId: "r-living", x: 2.2, y: 4.55, rotation: Math.PI,
        dims: { w: 2.1, d: 0.92, h: 0.82 }, color: "#7C8674", accent: "#5C6A54", placement: "floor", elevation: 0,
      },
      {
        id: "obj-rug-living", type: "rug", roomId: "r-living", x: 2.2, y: 3.75, rotation: 0,
        dims: { w: 3.4, d: 2.7, h: 0.02 }, color: "#C6B49A", accent: "#8E7B61", placement: "floor", elevation: 0,
      },
      {
        id: "obj-coffee", type: "coffeeTable", roomId: "r-living", x: 2.2, y: 3.1, rotation: 0,
        dims: { w: 1.12, d: 0.62, h: 0.4 }, color: "#9A7752", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-armchair", type: "armchair", roomId: "r-living", x: 4.6, y: 3.7, rotation: -Math.PI / 2,
        dims: { w: 0.86, d: 0.86, h: 0.88 }, color: "#B98A6B", accent: "#8B5F46", placement: "floor", elevation: 0,
      },
      {
        id: "obj-floor-lamp", type: "floorLamp", roomId: "r-living", x: 3.95, y: 4.9, rotation: 0,
        dims: { w: 0.36, d: 0.36, h: 1.66 }, color: "#3C3A34", accent: "#E4D6BA", placement: "floor", elevation: 0,
      },
      {
        id: "obj-plant-living", type: "plantFig", roomId: "r-living", x: 6.0, y: 0.55, rotation: 0,
        dims: { w: 0.58, d: 0.58, h: 1.55 }, color: "#596B4F", accent: "#A88362", placement: "floor", elevation: 0,
      },
      {
        id: "obj-art-living", type: "wallArt", roomId: "r-living", x: 2.2, y: 5.55, rotation: Math.PI,
        dims: { w: 1.2, d: 0.05, h: 0.8 }, color: "#8E7E68", accent: "#E7DECD", placement: "wall", elevation: 1.6, wall: "s",
      },
      {
        id: "obj-clock-living", type: "clock", roomId: "r-living", x: 0.05, y: 1.2, rotation: Math.PI / 2,
        dims: { w: 0.4, d: 0.06, h: 0.4 }, color: "#3B3A34", accent: "#EDE5D4", placement: "wall", elevation: 1.68, wall: "w",
      },
      // Kitchen
      {
        id: "obj-cabinets", type: "kitchenCabinets", roomId: "r-kitchen", x: 9.1, y: 0.36, rotation: 0,
        dims: { w: 3.4, d: 0.64, h: 2.06 }, color: "#48564B", accent: "#B08D57", placement: "floor", elevation: 0,
      },
      {
        id: "obj-dining", type: "diningTable", roomId: "r-kitchen", x: 9.1, y: 2.15, rotation: 0,
        dims: { w: 1.8, d: 0.9, h: 0.75 }, color: "#A47E55", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-chair-1", type: "diningChair", roomId: "r-kitchen", x: 8.2, y: 2.15, rotation: -Math.PI / 2,
        dims: { w: 0.48, d: 0.52, h: 0.86 }, color: "#A98963", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-chair-2", type: "diningChair", roomId: "r-kitchen", x: 10.0, y: 2.15, rotation: Math.PI / 2,
        dims: { w: 0.48, d: 0.52, h: 0.86 }, color: "#A98963", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-plant-kitchen", type: "smallPlant", roomId: "r-kitchen", x: 11.5, y: 0.5, rotation: 0,
        dims: { w: 0.32, d: 0.32, h: 0.46 }, color: "#68775B", accent: "#B08E6C", placement: "floor", elevation: 0,
      },
      // Hall
      {
        id: "obj-sideboard", type: "sideboard", roomId: "r-hall", x: 10.9, y: 3.66, rotation: 0,
        dims: { w: 1.52, d: 0.46, h: 0.78 }, color: "#9C7E5D", accent: "#5C4E3E", placement: "floor", elevation: 0,
      },
      {
        id: "obj-mirror-hall", type: "mirror", roomId: "r-hall", x: 9.4, y: 5.55, rotation: Math.PI,
        dims: { w: 0.7, d: 0.04, h: 1.36 }, color: "#9F8A6E", accent: "#DDE3E2", placement: "wall", elevation: 1.5, wall: "s",
      },
      // Bedroom
      {
        id: "obj-bed", type: "queenBed", roomId: "r-bedroom", x: 2.2, y: 7.3, rotation: 0,
        dims: { w: 1.62, d: 2.08, h: 1.12 }, color: "#D9D0BE", accent: "#9B8064", placement: "floor", elevation: 0,
      },
      {
        id: "obj-nightstand", type: "sideTable", roomId: "r-bedroom", x: 0.9, y: 6.35, rotation: 0,
        dims: { w: 0.46, d: 0.46, h: 0.55 }, color: "#8C6E4F", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-wardrobe", type: "wardrobe", roomId: "r-bedroom", x: 4.27, y: 7.9, rotation: -Math.PI / 2,
        dims: { w: 1.7, d: 0.6, h: 2.1 }, color: "#B39B7C", accent: "#6B5845", placement: "floor", elevation: 0,
      },
      {
        id: "obj-rug-bedroom", type: "rug", roomId: "r-bedroom", x: 2.2, y: 7.6, rotation: 0,
        dims: { w: 2.6, d: 2.4, h: 0.02 }, color: "#CEC3AD", accent: "#9B8A72", placement: "floor", elevation: 0,
      },
      {
        id: "obj-art-bedroom", type: "wallArt", roomId: "r-bedroom", x: 2.2, y: 5.64, rotation: 0,
        dims: { w: 1.1, d: 0.05, h: 0.78 }, color: "#8E7E68", accent: "#E7DECD", placement: "wall", elevation: 1.62, wall: "n",
      },
      {
        id: "obj-mirror-bedroom", type: "mirror", roomId: "r-bedroom", x: 0.04, y: 8.5, rotation: Math.PI / 2,
        dims: { w: 0.62, d: 0.04, h: 1.36 }, color: "#9F8A6E", accent: "#DDE3E2", placement: "wall", elevation: 1.5, wall: "w",
      },
      {
        id: "obj-plant-bedroom", type: "plantFig", roomId: "r-bedroom", x: 0.6, y: 8.35, rotation: 0,
        dims: { w: 0.58, d: 0.58, h: 1.55 }, color: "#596B4F", accent: "#A88362", placement: "floor", elevation: 0,
      },
      // Bathroom
      {
        id: "obj-plant-bath", type: "smallPlant", roomId: "r-bath", x: 6.4, y: 8.5, rotation: 0,
        dims: { w: 0.32, d: 0.32, h: 0.46 }, color: "#68775B", accent: "#B08E6C", placement: "floor", elevation: 0,
      },
      {
        id: "obj-mirror-bath", type: "mirror", roomId: "r-bath", x: 6.95, y: 7.0, rotation: -Math.PI / 2,
        dims: { w: 0.62, d: 0.04, h: 1.2 }, color: "#9F8A6E", accent: "#DDE3E2", placement: "wall", elevation: 1.45, wall: "e",
      },
      // Study
      {
        id: "obj-desk", type: "desk", roomId: "r-study", x: 10.25, y: 6.0, rotation: 0,
        dims: { w: 1.5, d: 0.68, h: 0.75 }, color: "#B08A60", accent: "#4A463F", placement: "floor", elevation: 0,
      },
      {
        id: "obj-desk-chair", type: "diningChair", roomId: "r-study", x: 10.25, y: 6.85, rotation: Math.PI,
        dims: { w: 0.48, d: 0.52, h: 0.86 }, color: "#8E6F58", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-bookshelf", type: "bookshelf", roomId: "r-study", x: 9.8, y: 8.82, rotation: Math.PI,
        dims: { w: 0.9, d: 0.35, h: 1.9 }, color: "#8F7050", accent: null, placement: "floor", elevation: 0,
      },
      {
        id: "obj-rug-study", type: "rug", roomId: "r-study", x: 9.8, y: 7.4, rotation: 0,
        dims: { w: 2.8, d: 2.2, h: 0.02 }, color: "#C6B49A", accent: "#8E7B61", placement: "floor", elevation: 0,
      },
      {
        id: "obj-plant-study", type: "oliveTree", roomId: "r-study", x: 7.45, y: 8.45, rotation: 0,
        dims: { w: 0.52, d: 0.52, h: 1.8 }, color: "#71805F", accent: "#A98B69", placement: "floor", elevation: 0,
      },
    ],
    meta: { createdAt: now, updatedAt: now, source: "sample" },
  };
}
