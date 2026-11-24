import { store } from "../store.js";
import { nearestWall, roomArea } from "../model/project.js";
import {
  formatArea,
  formatCeiling,
  isCalibrated,
  metersPerUnit,
  scaleBar,
} from "../model/units.js";
import { canPlaceObject, describeCollision, nudgeObject, removeObject } from "../actions/scene.js";
import { clamp, hexToRgba } from "../util.js";
import { toast } from "./toast.js";

const PAPER = "#fbf9f4";
const INK = "#37342d";
const ACCENT = "#a95e3f";
const DANGER = "#a03f2c";

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

export class Plan2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.image = null;
    this.imageSrc = undefined;
    this.hover = null;
    this.drag = null;
    this._raf = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointercancel", this._onPointerUp);
    canvas.addEventListener("pointerleave", () => {
      if (!this.drag) {
        this.hover = null;
        this.draw();
      }
    });
    canvas.addEventListener("keydown", this._onKeyDown);

    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);

    this.unsubscribe = store.subscribe((state, reason) => {
      if (["project", "project-reset", "history", "project-meta", "selection", "live"].includes(reason)) {
        this._ensureImage();
        this.draw();
      }
    });

    this._ensureImage();
    this._resize();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.draw();
  }

  _ensureImage() {
    const src = store.project.plan?.src || null;
    if (src === this.imageSrc) return;
    this.imageSrc = src;
    this.image = null;
    if (!src) return;
    const image = new Image();
    image.onload = () => {
      if (this.imageSrc === src) {
        this.image = image;
        this.draw();
      }
    };
    image.src = src;
  }

  _view() {
    const project = store.project;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 220;
    const pad = 13;
    const pw = Math.max(1, project.plan?.width || 12);
    const ph = Math.max(1, project.plan?.height || 9);
    const scale = Math.max(0.01, Math.min((w - pad * 2) / pw, (h - pad * 2) / ph));
    return {
      w,
      h,
      pad,
      pw,
      ph,
      scale,
      ox: (w - pw * scale) / 2,
      oy: (h - ph * scale) / 2,
    };
  }

  _toScreen(x, y, view) {
    return { x: view.ox + x * view.scale, y: view.oy + y * view.scale };
  }

  _toWorld(px, py, view) {
    return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
  }

  _findObjectAt(world, view) {
    const project = store.project;
    const mpu = metersPerUnit(project);
    const tolerance = 4 / view.scale;
    const objects = [...project.objects].sort((a, b) => {
      const rank = (o) => (o.type === "rug" ? 0 : o.placement === "wall" || o.placement === "ceiling" ? 2 : 1);
      return rank(a) - rank(b);
    });
    for (let i = objects.length - 1; i >= 0; i -= 1) {
      const object = objects[i];
      const dx = world.x - object.x;
      const dy = world.y - object.y;
      if (object.placement === "wall" || object.placement === "ceiling") {
        const radius = Math.max(object.dims.w, object.dims.h) / mpu / 2 + tolerance;
        if (Math.hypot(dx, dy) <= radius) return object;
        continue;
      }
      const c = Math.cos(object.rotation || 0);
      const s = Math.sin(object.rotation || 0);
      const lx = dx * c - dy * s;
      const lz = dx * s + dy * c;
      const hw = object.dims.w / mpu / 2 + tolerance;
      const hd = object.dims.d / mpu / 2 + tolerance;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) return object;
    }
    return null;
  }

  _findRoomAt(world) {
    const rooms = store.project.rooms;
    for (let i = rooms.length - 1; i >= 0; i -= 1) {
      const room = rooms[i];
      if (
        world.x >= room.x &&
        world.x <= room.x + room.w &&
        world.y >= room.y &&
        world.y <= room.y + room.h
      ) {
        return room;
      }
    }
    return null;
  }

  _pointerWorld(event) {
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const view = this._view();
    return { world: this._toWorld(px, py, view), px, py, view };
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    const { world, px, py, view } = this._pointerWorld(event);
    const object = this._findObjectAt(world, view);
    if (object) {
      store.selectObject(object.id);
      try {
        this.canvas.setPointerCapture?.(event.pointerId);
      } catch {
        /* synthetic or already-cancelled pointer */
      }
      this.drag = {
        id: object.id,
        roomId: object.roomId,
        start: world,
        orig: { x: object.x, y: object.y },
        px,
        py,
        moved: false,
        invalid: null,
        pointerId: event.pointerId,
      };
      return;
    }
    const room = this._findRoomAt(world);
    if (room) store.selectRoom(room.id);
  }

  _onPointerMove(event) {
    const { world, px, py, view } = this._pointerWorld(event);
    if (this.drag) {
      if (!this.drag.moved) {
        if (Math.hypot(px - this.drag.px, py - this.drag.py) < 3) return;
        this.drag.moved = true;
        store.beginTransient("Move item");
      }
      const project = store.project;
      const mpu = metersPerUnit(project);
      const object = project.objects.find((o) => o.id === this.drag.id);
      if (!object) return;
      const snap = 0.05 / mpu;
      const candidate = {
        ...object,
        x: Math.round((this.drag.orig.x + world.x - this.drag.start.x) / snap) * snap,
        y: Math.round((this.drag.orig.y + world.y - this.drag.start.y) / snap) * snap,
      };
      if (object.placement === "wall") {
        const room = project.rooms.find((r) => r.id === object.roomId);
        if (!room) return;
        const wall = object.wall || nearestWall(room, candidate.x, candidate.y);
        const wallLength = wall === "n" || wall === "s" ? room.w : room.h;
        const half = Math.min(object.dims.w / mpu, wallLength) / 2;
        const horizontal = Math.abs(Math.sin(object.rotation)) < 0.5;
        if (horizontal) candidate.x = clamp(candidate.x, room.x + half, room.x + room.w - half);
        else candidate.y = clamp(candidate.y, room.y + half, room.y + room.h - half);
        // Wall items stay on their wall.
        if (wall === "n") candidate.y = room.y + 0.035;
        if (wall === "s") candidate.y = room.y + room.h - 0.035;
        if (wall === "w") candidate.x = room.x + 0.035;
        if (wall === "e") candidate.x = room.x + room.w - 0.035;
        store.updateTransient((draft) => {
          const target = draft.objects.find((o) => o.id === this.drag.id);
          if (target) {
            target.x = candidate.x;
            target.y = candidate.y;
            target.wall = wall;
          }
        });
      } else {
        const check = canPlaceObject(project, candidate, { ignoreId: object.id });
        if (check.ok) {
          this.drag.invalid = null;
          store.updateTransient((draft) => {
            const target = draft.objects.find((o) => o.id === this.drag.id);
            if (target) {
              target.x = candidate.x;
              target.y = candidate.y;
            }
          });
        } else {
          this.drag.invalid = { result: check, world: { x: candidate.x, y: candidate.y } };
        }
      }
      this.draw();
      return;
    }

    const object = this._findObjectAt(world, view);
    const room = object ? null : this._findRoomAt(world);
    const next = object ? { kind: "object", id: object.id } : room ? { kind: "room", id: room.id } : null;
    const changed = JSON.stringify(next) !== JSON.stringify(this.hover);
    this.hover = next;
    this.canvas.style.cursor = this.drag ? "grabbing" : next ? "pointer" : "crosshair";
    if (changed) this.draw();
  }

  _onPointerUp(event) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    try {
      this.canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture may already be gone */
    }
    if (drag.moved) {
      store.endTransient({ commit: true });
      if (drag.invalid) {
        const object = store.project.objects.find((o) => o.id === drag.id);
        toast("Placement blocked", {
          detail: describeCollision(store.project, drag.invalid.result),
          tone: "error",
        });
      }
    }
    this.draw();
  }

  _onKeyDown(event) {
    const object = store.selectedObject;
    if (!object) return;
    const mpu = metersPerUnit(store.project);
    const step = (event.shiftKey ? 0.25 : 0.05) / mpu;
    const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (keys[event.key]) {
      event.preventDefault();
      const result = nudgeObject(object.id, keys[event.key][0], keys[event.key][1]);
      if (!result.ok && result.message) toast("Nudge blocked", { detail: result.message, tone: "error" });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeObject(object.id);
      toast("Item removed", { actionLabel: "Undo", onAction: () => store.undo() });
      return;
    }
    if (event.key === "Escape") {
      store.selectRoom(object.roomId);
    }
  }

  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._draw();
    });
  }

  _draw() {
    const project = store.project;
    const ctx = this.ctx;
    const view = this._view();
    if (!ctx || !project) return;
    const mpu = metersPerUnit(project);
    const selectedRoom = store.selectedRoom;
    const selectedObject = store.selectedObject;

    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, view.w, view.h);

    // Subtle 1-unit grid, scaled sensibly.
    let grid = mpu > 0 && isCalibrated(project) ? 1 / mpu : 1;
    while (grid * view.scale < 14) grid *= 2;
    while (grid * view.scale > 46) grid /= 2;
    if (grid * view.scale > 7) {
      ctx.strokeStyle = "rgba(180, 171, 154, 0.18)";
      ctx.lineWidth = 1;
      for (let x = -20; x <= view.pw + 20; x += grid) {
        const p = this._toScreen(x, 0, view);
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, view.h);
        ctx.stroke();
      }
      for (let y = -20; y <= view.ph + 20; y += grid) {
        const p = this._toScreen(0, y, view);
        ctx.beginPath();
        ctx.moveTo(0, p.y);
        ctx.lineTo(view.w, p.y);
        ctx.stroke();
      }
    }

    if (project.plan?.visible !== false && this.image) {
      ctx.save();
      ctx.globalAlpha = 0.58;
      ctx.drawImage(this.image, view.ox, view.oy, view.pw * view.scale, view.ph * view.scale);
      ctx.restore();
    }

    // Floor fills.
    for (const room of project.rooms) {
      const p1 = this._toScreen(room.x, room.y, view);
      const selected = room.id === selectedRoom?.id;
      ctx.fillStyle = selected ? "rgba(169, 94, 63, 0.14)" : hexToRgba(room.materials.floor.color, 0.14);
      ctx.fillRect(p1.x, p1.y, room.w * view.scale, room.h * view.scale);
    }

    // Hover room tint.
    if (this.hover?.kind === "room") {
      const room = project.rooms.find((r) => r.id === this.hover.id);
      if (room) {
        const p1 = this._toScreen(room.x, room.y, view);
        ctx.fillStyle = "rgba(120, 110, 92, 0.06)";
        ctx.fillRect(p1.x, p1.y, room.w * view.scale, room.h * view.scale);
      }
    }

    // Room outlines. Open-plan edges are dashed so they do not read as walls.
    for (const room of project.rooms) {
      const p1 = this._toScreen(room.x, room.y, view);
      const w = room.w * view.scale;
      const h = room.h * view.scale;
      const selected = room.id === selectedRoom?.id;
      const walls = room.walls || { n: true, e: true, s: true, w: true };
      const edges = [
        { wall: "n", x1: p1.x, y1: p1.y, x2: p1.x + w, y2: p1.y },
        { wall: "e", x1: p1.x + w, y1: p1.y, x2: p1.x + w, y2: p1.y + h },
        { wall: "s", x1: p1.x, y1: p1.y + h, x2: p1.x + w, y2: p1.y + h },
        { wall: "w", x1: p1.x, y1: p1.y, x2: p1.x, y2: p1.y + h },
      ];
      ctx.lineJoin = "round";
      for (const edge of edges) {
        const open = walls[edge.wall] === false;
        if (!open && !selected) {
          // A coloured wall band makes the surface colour legible in plan view.
          ctx.strokeStyle = room.materials.wall.color;
          ctx.lineWidth = 5.5;
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(edge.x1, edge.y1);
          ctx.lineTo(edge.x2, edge.y2);
          ctx.stroke();
        }
        ctx.strokeStyle = selected ? ACCENT : INK;
        ctx.lineWidth = open ? (selected ? 1.8 : 1.2) : selected ? 2.6 : 1.65;
        ctx.setLineDash(open ? [5, 4] : []);
        ctx.globalAlpha = open ? 0.45 : 1;
        ctx.beginPath();
        ctx.moveTo(edge.x1, edge.y1);
        ctx.lineTo(edge.x2, edge.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Openings carved after all wall strokes so shared walls read correctly.
    for (const opening of project.openings || []) {
      const room = project.rooms.find((r) => r.id === opening.roomId);
      if (!room) continue;
      this._drawOpening(opening, room, view);
    }

    // Furniture, rugs first, wall decor last.
    const objects = [...project.objects].sort((a, b) => {
      const rank = (o) => (o.type === "rug" ? 0 : o.placement === "wall" || o.placement === "ceiling" ? 2 : 1);
      return rank(a) - rank(b);
    });
    for (const object of objects) {
      this._drawObject(object, view, object.id === selectedObject?.id);
    }

    // Room labels.
    for (const room of project.rooms) {
      this._drawRoomLabel(room, view, room.id === selectedRoom?.id);
    }

    // Selected object dimensions.
    if (selectedObject) this._drawObjectMeasure(selectedObject, view);

    // Compass.
    this._drawCompass(view);

    // Scale bar.
    this._drawScaleBar(view, project);

    if (this.drag?.invalid) {
      const p = this._toScreen(this.drag.invalid.world.x, this.drag.invalid.world.y, view);
      ctx.strokeStyle = DANGER;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = DANGER;
      ctx.font = "600 8px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("blocked", p.x, p.y - 17);
    }
  }

  _drawOpening(opening, room, view) {
    const ctx = this.ctx;
    let start;
    let end;
    const horizontal = opening.wall === "n" || opening.wall === "s";
    if (opening.wall === "n") {
      start = { x: room.x, y: room.y };
      end = { x: room.x + room.w, y: room.y };
    } else if (opening.wall === "s") {
      start = { x: room.x, y: room.y + room.h };
      end = { x: room.x + room.w, y: room.y + room.h };
    } else if (opening.wall === "w") {
      start = { x: room.x, y: room.y };
      end = { x: room.x, y: room.y + room.h };
    } else {
      start = { x: room.x + room.w, y: room.y };
      end = { x: room.x + room.w, y: room.y + room.h };
    }
    const dir = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const inward = opening.wall === "n" ? { x: 0, y: 1 } : opening.wall === "s" ? { x: 0, y: -1 } : opening.wall === "w" ? { x: 1, y: 0 } : { x: -1, y: 0 };
    const gapStart = { x: start.x + dir.x * opening.offset, y: start.y + dir.y * opening.offset };
    const gapEnd = { x: gapStart.x + dir.x * opening.width, y: gapStart.y + dir.y * opening.width };
    const s1 = this._toScreen(gapStart.x, gapStart.y, view);
    const s2 = this._toScreen(gapEnd.x, gapEnd.y, view);

    ctx.save();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    if (opening.type === "window") {
      const normal = { x: inward.x * 2.2, y: inward.y * 2.2 };
      ctx.strokeStyle = "#5b7c86";
      ctx.lineWidth = 1.2;
      for (const off of [-1.3, 1.3]) {
        ctx.beginPath();
        ctx.moveTo(s1.x + normal.x + normal.y * off * 0.6, s1.y + normal.y + normal.x * off * 0.6);
        ctx.lineTo(s2.x + normal.x + normal.y * off * 0.6, s2.y + normal.y + normal.x * off * 0.6);
        ctx.stroke();
      }
      const mid = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(mid.x - (horizontal ? 0 : 3), mid.y - (horizontal ? 3 : 0));
      ctx.lineTo(mid.x + (horizontal ? 0 : 3), mid.y + (horizontal ? 3 : 0));
      ctx.stroke();
    } else {
      const widthPx = Math.hypot(s2.x - s1.x, s2.y - s1.y);
      const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
      const inAngle = Math.atan2(inward.y, inward.x);
      let delta = inAngle - angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      ctx.strokeStyle = "rgba(90, 83, 71, 0.75)";
      ctx.lineWidth = 1.1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(s1.x, s1.y, widthPx, angle, angle + delta, delta < 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      const leafAngle = angle + delta * 0.55;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s1.x + Math.cos(leafAngle) * widthPx, s1.y + Math.sin(leafAngle) * widthPx);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(s1.x, s1.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _objectCornersScreen(object, view) {
    const mpu = metersPerUnit(store.project);
    const w = object.dims.w / mpu;
    const d = object.dims.d / mpu;
    const c = Math.cos(object.rotation || 0);
    const s = Math.sin(object.rotation || 0);
    return [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ].map(([lx, lz]) =>
      this._toScreen(object.x + lx * c + lz * s, object.y - lx * s + lz * c, view)
    );
  }

  _drawObject(object, view, selected) {
    const ctx = this.ctx;
    const mpu = metersPerUnit(store.project);
    const p = this._toScreen(object.x, object.y, view);

    if (object.placement === "wall" || object.placement === "ceiling") {
      const horizontal = Math.abs(Math.sin(object.rotation || 0)) < 0.5;
      const length = Math.max(5, object.dims.w * view.scale / mpu);
      ctx.save();
      ctx.strokeStyle = object.type === "clock" ? "#37342d" : hexToRgba(object.color, 0.95);
      ctx.lineWidth = object.type === "wallArt" ? 5 : 3.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - (horizontal ? length / 2 : 0), p.y - (horizontal ? 0 : length / 2));
      ctx.lineTo(p.x + (horizontal ? length / 2 : 0), p.y + (horizontal ? 0 : length / 2));
      ctx.stroke();
      if (object.type === "clock") {
        ctx.fillStyle = PAPER;
        ctx.strokeStyle = "#37342d";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3.4, length / 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (selected) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(6, length / 2 + 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }

    const corners = this._objectCornersScreen(object, view);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(object.color, object.type === "rug" ? 0.28 : 0.58);
    ctx.fill();
    ctx.strokeStyle = selected ? ACCENT : "rgba(55, 52, 45, 0.46)";
    ctx.lineWidth = selected ? 2 : 1;
    if (object.type === "rug") ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // A few silhouette cues make the plan legible.
    ctx.strokeStyle = "rgba(55, 52, 45, 0.3)";
    ctx.lineWidth = 1;
    const center = this._toScreen(object.x, object.y, view);
    const wpx = object.dims.w / mpu * view.scale;
    const dpx = object.dims.d / mpu * view.scale;
    if (object.type === "sofa" || object.type === "armchair" || object.type === "readingChair") {
      ctx.beginPath();
      ctx.moveTo(center.x - wpx * 0.42, center.y + dpx * 0.24);
      ctx.lineTo(center.x + wpx * 0.42, center.y + dpx * 0.24);
      ctx.stroke();
    } else if (object.type === "queenBed" || object.type === "singleBed" || object.type === "daybed") {
      ctx.fillStyle = "rgba(251, 249, 244, 0.72)";
      const pillow = Math.min(wpx * 0.32, 14);
      ctx.fillRect(center.x - wpx * 0.28, center.y - dpx * 0.36, wpx * 0.24, pillow * 0.55);
      if (object.type === "queenBed") ctx.fillRect(center.x + wpx * 0.04, center.y - dpx * 0.36, wpx * 0.24, pillow * 0.55);
    } else if (object.type === "diningTable" || object.type === "coffeeTable" || object.type === "desk") {
      ctx.beginPath();
      ctx.moveTo(center.x - wpx * 0.35, center.y);
      ctx.lineTo(center.x + wpx * 0.35, center.y);
      ctx.stroke();
    }

    if (selected) {
      for (const corner of corners) {
        ctx.fillStyle = PAPER;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 3.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawRoomLabel(room, view, selected) {
    const ctx = this.ctx;
    const center = this._toScreen(room.x + room.w / 2, room.y + room.h / 2, view);
    const maxWidth = room.w * view.scale - 6;
    if (maxWidth < 32) return;
    const showMeta = maxWidth >= 58;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 9.5px Inter, system-ui, sans-serif";
    const name = truncate(ctx, room.name, Math.min(maxWidth - 10, 130));
    ctx.font = "500 8px 'JetBrains Mono', monospace";
    const area = formatArea(roomArea(room), store.project);
    const tiny = !isCalibrated(store.project)
      ? " est."
      : room.measurement === "edited"
        ? " · edit"
        : "";
    const meta = `${area}${tiny}`;
    const width = Math.max(
      ctx.measureText(name).width,
      showMeta ? ctx.measureText(meta).width : 0
    ) + 12;
    const height = showMeta ? 27 : 16;
    ctx.fillStyle = selected ? "rgba(169, 94, 63, 0.92)" : "rgba(251, 249, 244, 0.82)";
    ctx.strokeStyle = selected ? ACCENT : "rgba(200, 191, 173, 0.8)";
    ctx.lineWidth = 1;
    roundRect(ctx, center.x - width / 2, center.y - height / 2, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = selected ? "#fffaf4" : INK;
    ctx.font = "600 9.5px Inter, system-ui, sans-serif";
    ctx.fillText(name, center.x, center.y - (showMeta ? 4 : 0));
    if (showMeta) {
      ctx.fillStyle = selected ? "rgba(255, 250, 244, 0.78)" : "rgba(95, 90, 80, 0.9)";
      ctx.font = "500 8px 'JetBrains Mono', monospace";
      ctx.fillText(meta, center.x, center.y + 6.5);
    }
    ctx.restore();
  }

  _drawObjectMeasure(object, view) {
    const ctx = this.ctx;
    const mpu = metersPerUnit(store.project);
    const p = this._toScreen(object.x, object.y, view);
    const label = `${formatCeiling(object.dims.w, store.project)} × ${formatCeiling(object.dims.d, store.project)}`;
    ctx.save();
    ctx.font = "500 8.5px 'JetBrains Mono', monospace";
    const width = ctx.measureText(label).width + 12;
    const y = p.y + Math.max(14, object.dims.d / mpu * view.scale * 0.55 + 12);
    const x = clamp(p.x, width / 2 + 3, view.w - width / 2 - 3);
    ctx.fillStyle = "rgba(251, 249, 244, 0.94)";
    ctx.strokeStyle = "rgba(200, 191, 173, 0.9)";
    ctx.lineWidth = 1;
    roundRect(ctx, x - width / 2, y - 7, width, 14, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(55, 52, 45, 0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y + 0.5);
    ctx.restore();
    ctx.fillStyle = ACCENT;
  }

  _drawScaleBar(view, project) {
    const ctx = this.ctx;
    const { px, label } = scaleBar(view.scale, project, 58);
    const x = 10;
    const y = view.h - 12;
    ctx.save();
    ctx.font = "500 8px 'JetBrains Mono', monospace";
    const textWidth = ctx.measureText(label).width;
    const boxWidth = Math.max(px, textWidth) + 16;
    ctx.fillStyle = "rgba(251, 249, 244, 0.88)";
    ctx.strokeStyle = "rgba(200, 191, 173, 0.7)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y - 26, boxWidth, 26, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(55, 52, 45, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 8);
    ctx.lineTo(x + 8 + px, y - 8);
    ctx.moveTo(x + 8, y - 11);
    ctx.lineTo(x + 8, y - 5);
    ctx.moveTo(x + 8 + px, y - 11);
    ctx.lineTo(x + 8 + px, y - 5);
    ctx.stroke();
    ctx.fillStyle = "rgba(95, 90, 80, 0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 8, y - 17);
    ctx.restore();
  }

  _drawCompass(view) {
    const ctx = this.ctx;
    const x = view.w - 20;
    const y = 18;
    ctx.save();
    ctx.strokeStyle = "rgba(95, 90, 80, 0.55)";
    ctx.fillStyle = "rgba(95, 90, 80, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x - 2.5, y - 2);
    ctx.lineTo(x + 2.5, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.font = "600 7.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", x, y + 13);
    ctx.restore();
  }

  dispose() {
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

let instance = null;

export function mountPlan2D(canvas) {
  if (!instance) instance = new Plan2D(canvas);
  return instance;
}

export function getPlan2D() {
  return instance;
}
