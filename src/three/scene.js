import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { store } from "../store.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { buildFurniture } from "./furniture.js";
import { canPlaceObject, describeCollision } from "../actions/scene.js";
import {
  findObject,
  findRoom,
  nearestWall,
  openingFrame,
  projectArea,
  projectBounds,
  roomArea,
  roomCenter,
} from "../model/project.js";
import {
  displayLengthNumber,
  formatArea,
  formatCeiling,
  formatLength,
  isCalibrated,
  measurementLabel,
  metersPerUnit,
} from "../model/units.js";
import { clamp, escapeHtml } from "../util.js";

const ACCENT = 0xa95e3f;
const WALL_THICKNESS = 0.15;
const EYE_HEIGHT = 1.62;

const textureCache = new Map();

function makeSurfaceTexture(kind) {
  if (textureCache.has(kind)) return textureCache.get(kind);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  if (kind === "wood") {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "#f8f3e9");
    grad.addColorStop(0.5, "#efe7d9");
    grad.addColorStop(1, "#f7f0e3");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const plank = 64;
    for (let y = 0; y < size; y += plank) {
      ctx.fillStyle = `rgba(104, 79, 52, ${0.06 + ((y / plank) % 3) * 0.02})`;
      ctx.fillRect(0, y, size, 2);
      const offset = ((y / plank) % 2) * 120;
      for (let x = -120; x < size; x += 240) {
        ctx.fillStyle = "rgba(104, 79, 52, 0.05)";
        ctx.fillRect(x + offset, y, 2, plank);
      }
      for (let i = 0; i < 5; i += 1) {
        ctx.strokeStyle = `rgba(122, 94, 62, ${0.03 + i * 0.004})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const yy = y + 14 + i * 9;
        ctx.moveTo(0, yy);
        for (let x = 0; x <= size; x += 48) {
          ctx.lineTo(x, yy + Math.sin((x + y) * 0.02) * 2.2);
        }
        ctx.stroke();
      }
    }
  } else if (kind === "stone" || kind === "concrete") {
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const base = 236 + Math.random() * 12;
      imageData.data[i] = base;
      imageData.data[i + 1] = base;
      imageData.data[i + 2] = base - 2;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    if (kind === "stone") {
      for (let i = 0; i < 20; i += 1) {
        ctx.strokeStyle = `rgba(120, 112, 98, ${0.04 + Math.random() * 0.04})`;
        ctx.beginPath();
        let x = Math.random() * size;
        let y = Math.random() * size;
        ctx.moveTo(x, y);
        for (let s = 0; s < 4; s += 1) {
          x += (Math.random() - 0.5) * 90;
          y += (Math.random() - 0.5) * 90;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  } else if (kind === "tile") {
    const step = 128;
    ctx.fillStyle = "#fbf8f2";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i <= size; i += step) {
      ctx.fillStyle = "rgba(150, 142, 126, 0.18)";
      ctx.fillRect(i, 0, 2, size);
      ctx.fillRect(0, i, size, 2);
    }
  } else if (kind === "carpet") {
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const v = 240 + Math.random() * 12;
      imageData.data[i] = v;
      imageData.data[i + 1] = v - 1;
      imageData.data[i + 2] = v - 4;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  } else if (kind === "plaster") {
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const v = 242 + Math.random() * 10;
      imageData.data[i] = v;
      imageData.data[i + 1] = v - 1;
      imageData.data[i + 2] = v - 3;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    for (let i = 0; i < 30; i += 1) {
      ctx.strokeStyle = `rgba(130, 120, 104, ${0.018 + Math.random() * 0.025})`;
      ctx.lineWidth = 2 + Math.random() * 5;
      ctx.beginPath();
      const y = Math.random() * size;
      ctx.moveTo(-20, y);
      ctx.bezierCurveTo(size * 0.3, y + 18, size * 0.7, y - 18, size + 20, y + 4);
      ctx.stroke();
    }
  } else if (kind === "fabric") {
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const v = 240 + Math.random() * 8;
      imageData.data[i] = v;
      imageData.data[i + 1] = v - 1;
      imageData.data[i + 2] = v - 3;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    for (let i = 0; i < size; i += 4) {
      ctx.fillStyle = `rgba(112, 104, 90, ${i % 8 === 0 ? 0.055 : 0.025})`;
      ctx.fillRect(i, 0, 1, size);
      ctx.fillRect(0, i, size, 1);
    }
  } else if (kind === "metal") {
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "#f2f2ef");
    grad.addColorStop(0.5, "#dfe0dc");
    grad.addColorStop(1, "#f1f1ed");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 110; i += 1) {
      const y = Math.random() * size;
      ctx.strokeStyle = `rgba(90, 92, 88, ${0.018 + Math.random() * 0.035})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#faf7f0";
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(kind, texture);
  return texture;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

class Stage {
  constructor(container) {
    this.container = container;
    this.showMeasurements = true;
    this.showCeilings = false;
    this.ceilingAuto = false;
    this.mode = "orbit";
    this.moveMode = false;
    this.moveDrag = null;
    this.selectedKey = "";
    this.walking = { locked: false, yaw: 0, pitch: 0, keys: new Set(), dragging: false, lastX: 0, lastY: 0 };
    this.pointerDown = null;
    this.animation = null;
    this.clock = new THREE.Clock();
    this.disposables = [];
    this.labels = [];
    this.measureLines = null;
    this.roomLabelEls = new Map();
    this.wallMaterials = [];
    this.wallClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.55);

    this._buildOverlay();
    this._initRenderer();
    this._initScene();
    this._onResize();
    this._initEvents();

    this.unsubscribe = store.subscribe((state, reason) => this.update(state, reason));
    this.update(store.state, "init");
    this._animate();
  }

  _buildOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "stage-topbar";
    overlay.innerHTML = `
      <div class="view-switch" role="group" aria-label="View mode">
        <button type="button" data-mode="orbit" aria-pressed="true" aria-label="Orbit view">${icon("orbit", 14)}<span>Orbit</span></button>
        <button type="button" data-mode="walk" aria-pressed="false" aria-label="Walkthrough view">${icon("walk", 14)}<span>Walk</span></button>
        <button type="button" data-mode="top" aria-pressed="false" aria-label="Top-down view">${icon("top", 14)}<span>Top</span></button>
      </div>
      <div class="stage-tools">
        <button type="button" class="stage-tool" data-tool="move" aria-pressed="false" aria-label="Move objects in the 3D view" title="Move objects in the 3D view">${icon("move", 13)}<span>Move</span></button>
        <button type="button" class="stage-tool" data-tool="measure" aria-pressed="true" aria-label="Toggle measurement overlays" title="Toggle measurement overlays">${icon("ruler", 13)}<span>Dims</span></button>
        <button type="button" class="stage-tool" data-tool="ceiling" aria-pressed="false" aria-label="Toggle ceilings" title="Toggle ceilings">${icon("layers", 13)}<span>Ceilings</span></button>
      </div>
    `;
    this.container.appendChild(overlay);

    const pill = document.createElement("div");
    pill.className = "selection-pill";
    pill.hidden = true;
    this.container.appendChild(pill);

    const bottom = document.createElement("div");
    bottom.className = "stage-bottom";
    bottom.innerHTML = `
      <div class="scale-card">
        ${icon("scale", 13)}
        <span id="stage-extents">—</span>
        <span class="scale-bar" aria-hidden="true"></span>
        <strong id="stage-unit">m</strong>
      </div>
      <div class="walk-hint" id="stage-hint"></div>
    `;
    this.container.appendChild(bottom);

    this.overlay = overlay;
    this.pill = pill;
    this.hint = bottom.querySelector("#stage-hint");
    this.extentsEl = bottom.querySelector("#stage-extents");
    this.unitEl = bottom.querySelector("#stage-unit");
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0xe9e3d6, 1);
    this.renderer.domElement.setAttribute("aria-label", "3D model. Click a room or object to select it.");
    this.renderer.domElement.tabIndex = -1;
    this.container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = "stage-labels";
    this.container.appendChild(this.labelRenderer.domElement);

    this._resize = () => this._onResize();
    this.resizeObserver = new ResizeObserver(this._resize);
    this.resizeObserver.observe(this.container);
    this._onResize();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9e3d6);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
    this.camera.position.set(12, 10, 14);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(6, 0.6, 4.5);
    this.controls.update();

    const hemi = new THREE.HemisphereLight(0xfff9ef, 0x8f8778, 1.05);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.27);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff1dc, 1.95);
    sun.position.set(14, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);
    this.sun = sun;

    const fill = new THREE.DirectionalLight(0xdfe8ee, 0.55);
    fill.position.set(-12, 8, -10);
    this.scene.add(fill);

    this.ground = new THREE.Group();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xeee8dc, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.36;
    ground.receiveShadow = true;
    this.ground.add(ground);

    const grid = new THREE.GridHelper(80, 80, 0xd2c9b8, 0xe1d9ca);
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    grid.position.y = -0.34;
    this.ground.add(grid);
    this.scene.add(this.ground);
    this.groundMat = groundMat;

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.floorGroup = new THREE.Group();
    this.wallGroup = new THREE.Group();
    this.ceilingGroup = new THREE.Group();
    this.objectGroup = new THREE.Group();
    this.selectionGroup = new THREE.Group();
    this.measureGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();
    this.root.add(this.floorGroup, this.wallGroup, this.ceilingGroup, this.objectGroup, this.selectionGroup, this.measureGroup, this.labelGroup);

    this.raycaster = new THREE.Raycaster();
  }

  _onResize() {
    if (!this.camera) return;
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const wasHidden = (this._lastWidth || 0) < 10;
    this._lastWidth = width;
    if (wasHidden && width > 10 && this.boundsMeters && (this.mode === "orbit" || this.mode === "top")) {
      this._frameCamera(true);
    }
  }

  _initEvents() {
    this.overlay.addEventListener("click", (event) => {
      const viewBtn = event.target.closest("[data-mode]");
      if (viewBtn) {
        store.setViewMode(viewBtn.dataset.mode);
        return;
      }
      const tool = event.target.closest("[data-tool]");
      if (tool) {
        if (tool.dataset.tool === "move") {
          this._setMoveMode(!this.moveMode);
        } else if (tool.dataset.tool === "measure") {
          this.showMeasurements = !this.showMeasurements;
          tool.setAttribute("aria-pressed", String(this.showMeasurements));
          this._syncMeasureVisibility();
        } else if (tool.dataset.tool === "ceiling") {
          this.showCeilings = !this.showCeilings;
          this.ceilingAuto = false;
          tool.setAttribute("aria-pressed", String(this.showCeilings));
          this._updateCeilingVisibility();
        }
      }
    });

    this.hint.addEventListener("click", (event) => {
      if (event.target.closest("[data-exit-walk]")) {
        this._exitWalk();
      }
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
      if (this.mode === "walk") {
        this.walking.dragging = true;
        this.walking.lastX = event.clientX;
        this.walking.lastY = event.clientY;
        if (!this.walking.locked) {
          try {
            canvas.requestPointerLock?.();
          } catch {
            /* drag-look fallback below */
          }
        }
        return;
      }
      if (this.moveMode && event.button === 0) {
        const object = this._objectAtPointer(event);
        if (object) {
          this._startObjectDrag(event, object);
          return;
        }
      }
      this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    });

    canvas.addEventListener("pointerup", (event) => {
      if (this.mode === "walk") {
        this.walking.dragging = false;
        return;
      }
      if (this.moveDrag) {
        this._finishObjectDrag(event);
        return;
      }
      if (!this.pointerDown) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      const elapsed = performance.now() - this.pointerDown.time;
      this.pointerDown = null;
      if (dx * dx + dy * dy <= 30 && elapsed < 900) this._pick(event);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (this.mode === "walk") {
        if (this.walking.locked) return;
        if (this.walking.dragging) {
          const dx = event.clientX - this.walking.lastX;
          const dy = event.clientY - this.walking.lastY;
          this.walking.lastX = event.clientX;
          this.walking.lastY = event.clientY;
          this._look(dx, dy);
        }
        return;
      }
      if (this.moveDrag) {
        this._dragObject(event);
        return;
      }
      if (!this.pointerDown) {
        this._hover(event);
      }
    });

    canvas.addEventListener("pointercancel", (event) => {
      if (this.moveDrag) this._finishObjectDrag(event);
    });

    canvas.addEventListener("pointerleave", () => {
      this.walking.dragging = false;
      if (this.mode !== "walk") {
        canvas.style.cursor = this.moveMode ? "move" : "grab";
      }
    });

    canvas.addEventListener("click", (event) => {
      if (this.mode === "walk" && !this.walking.locked) {
        try {
          canvas.requestPointerLock?.();
        } catch {
          /* ignore */
        }
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.walking.locked = document.pointerLockElement === canvas;
      this._updateHint();
    });

    document.addEventListener("mousemove", (event) => {
      if (this.mode === "walk" && this.walking.locked) {
        this._look(event.movementX || 0, event.movementY || 0);
      }
    });

    window.addEventListener("keydown", (event) => this._onKeyDown(event));
    window.addEventListener("keyup", (event) => this._onKeyUp(event));
    window.addEventListener("blur", () => this.walking.keys.clear());

    this.controls.addEventListener("start", () => {
      this.renderer.domElement.style.cursor = this.moveMode ? "move" : "grabbing";
    });
    this.controls.addEventListener("end", () => {
      this.renderer.domElement.style.cursor = this.moveMode
        ? "move"
        : this.mode === "walk"
          ? "crosshair"
          : "grab";
    });
  }

  _setMoveMode(active) {
    this.moveMode = Boolean(active) && this.mode !== "walk";
    const button = this.overlay.querySelector('[data-tool="move"]');
    button?.setAttribute("aria-pressed", String(this.moveMode));
    this.controls.enabled = !this.moveMode && (this.mode === "orbit" || this.mode === "top");
    this.renderer.domElement.style.cursor = this.moveMode ? "move" : this.mode === "walk" ? "crosshair" : "grab";
    this._updateHint();
  }

  _pointerNdc(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  _objectAtPointer(event) {
    this.raycaster.setFromCamera(this._pointerNdc(event), this.camera);
    const hits = this.raycaster.intersectObject(this.objectGroup, true);
    for (const hit of hits) {
      const id = hit.object.userData?.objectId;
      if (!id) continue;
      const object = this.project?.objects?.find((item) => item.id === id);
      if (object) return object;
    }
    return null;
  }

  _groundPoint(event, y = 0) {
    this.raycaster.setFromCamera(this._pointerNdc(event), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  _startObjectDrag(event, object) {
    const mpu = metersPerUnit(this.project);
    const planeY =
      object.placement === "floor"
        ? 0
        : object.placement === "ceiling"
          ? this.project.rooms.find((room) => room.id === object.roomId)?.ceilingHeight || object.elevation || 0
          : object.elevation || 0;
    const start = this._groundPoint(event, planeY);
    if (!start) return;
    store.selectObject(object.id);
    this.moveDrag = {
      id: object.id,
      pointerId: event.pointerId,
      planeY,
      startWorld: { x: start.x, z: start.z },
      startClient: { x: event.clientX, y: event.clientY },
      orig: { x: object.x, y: object.y },
      last: null,
      invalid: null,
      moved: false,
      transient: false,
      mpu,
    };
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
    this.renderer.domElement.style.cursor = "grabbing";
    event.preventDefault();
  }

  _dragObject(event) {
    const drag = this.moveDrag;
    if (!drag) return;
    if (!drag.moved) {
      const dx = event.clientX - drag.startClient.x;
      const dy = event.clientY - drag.startClient.y;
      if (dx * dx + dy * dy < 9) return;
      drag.moved = true;
    }
    const point = this._groundPoint(event, drag.planeY);
    if (!point) return;
    const project = this.project;
    const object = project.objects.find((item) => item.id === drag.id);
    if (!object) return;
    const mpu = drag.mpu;
    const room = project.rooms.find((item) => item.id === object.roomId);
    if (!room) return;

    let candidate = {
      ...object,
      x: drag.orig.x + (point.x - drag.startWorld.x) / mpu,
      y: drag.orig.y + (point.z - drag.startWorld.z) / mpu,
    };

    if (object.placement === "wall") {
      const wall = object.wall || nearestWall(room, candidate.x, candidate.y);
      candidate.wall = wall;
      if (wall === "n" || wall === "s") {
        candidate.x = clamp(candidate.x, room.x + 0.1, room.x + room.w - 0.1);
        candidate.y = wall === "n" ? room.y + 0.035 : room.y + room.h - 0.035;
      } else {
        candidate.y = clamp(candidate.y, room.y + 0.1, room.y + room.h - 0.1);
        candidate.x = wall === "w" ? room.x + 0.035 : room.x + room.w - 0.035;
      }
    } else {
      const check = canPlaceObject(project, candidate, { ignoreId: object.id });
      if (!check.ok) {
        drag.invalid = check;
        return;
      }
    }

    drag.invalid = null;
    drag.last = { x: candidate.x, y: candidate.y, wall: candidate.wall || object.wall };
    if (!drag.transient) {
      store.beginTransient("Move item");
      drag.transient = true;
    }
    store.updateTransient((draft) => {
      const target = draft.objects.find((item) => item.id === drag.id);
      if (!target) return;
      target.x = candidate.x;
      target.y = candidate.y;
      if (candidate.wall) target.wall = candidate.wall;
    });
  }

  _finishObjectDrag(event) {
    const drag = this.moveDrag;
    if (!drag) return;
    this.moveDrag = null;
    this.renderer.domElement.releasePointerCapture?.(drag.pointerId);
    if (drag.transient) store.endTransient({ commit: true });
    if (drag.invalid) {
      toast("Placement blocked", {
        detail: describeCollision(store.project, drag.invalid),
        tone: "error",
      });
    }
    this.renderer.domElement.style.cursor = this.moveMode ? "move" : "grab";
    event?.preventDefault?.();
  }

  _onKeyDown(event) {
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;
    if (typing) return;
    if (document.querySelector(".modal-backdrop")) return;

    if (event.key === "Escape") {
      if (this.mode === "walk" && !this.walking.locked) {
        event.preventDefault();
        this._exitWalk(true);
      }
      return;
    }

    if (this.mode === "walk") {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
        event.preventDefault();
        this.walking.keys.add(key);
      }
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === "v") store.setViewMode("orbit");
    if (event.key.toLowerCase() === "w") store.setViewMode("walk");
    if (event.key.toLowerCase() === "t") store.setViewMode("top");
  }

  _onKeyUp(event) {
    this.walking.keys.delete(event.key.toLowerCase());
  }

  _exitWalk() {
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.walking.locked = false;
    this.walking.keys.clear();
    if (this.ceilingAuto) {
      this.showCeilings = false;
      this.ceilingAuto = false;
      this.overlay.querySelector('[data-tool="ceiling"]')?.setAttribute("aria-pressed", "false");
    }
    store.setViewMode("orbit");
  }

  _look(dx, dy) {
    this.walking.yaw -= dx * 0.0022;
    this.walking.pitch = clamp(this.walking.pitch - dy * 0.0022, -1.1, 1.1);
    this.camera.rotation.set(this.walking.pitch, this.walking.yaw, 0, "YXZ");
  }

  _updateSelectionPill() {
    const state = store.state;
    const room = store.selectedRoom;
    const object = store.selectedObject;
    if (!room) {
      this.pill.hidden = true;
      return;
    }
    this.pill.hidden = false;
    const unit = isCalibrated(state.project) && state.project.unitSystem === "imperial" ? "ft²" : null;
    const calibrated = room.measurement === "calibrated";
    if (object) {
      const dims = object.dims;
      const w = formatCeiling(dims.w, state.project);
      const d = formatCeiling(dims.d, state.project);
      this.pill.innerHTML = `
        <span style="opacity:.55">${icon("cube", 13)}</span>
        <strong>${escapeHtml(object.name || object.type)}</strong>
        <span class="meta">${w} × ${d} · ${escapeHtml(room.name)}</span>
        <span class="tag" data-tone="${object.placement === "wall" ? "info" : "ok"}">${icon(object.placement === "wall" ? "layers" : "check", 10)} ${object.placement === "wall" ? "Wall-mounted" : "Floor"}</span>
      `;
    } else {
      const area = formatArea(roomArea(room), state.project);
      this.pill.innerHTML = `
        <span style="opacity:.55">${icon("room", 13)}</span>
        <strong>${escapeHtml(room.name)}</strong>
        <span class="meta">${area} · ${formatCeiling(room.ceilingHeight, state.project)} ceiling</span>
        <span class="tag" data-tone="${calibrated ? "ok" : "warn"}">${icon(calibrated ? "check" : "warn", 10)} ${measurementLabel(room.measurement)}</span>
      `;
    }
  }

  _updateExtents() {
    const project = store.project;
    const bounds = projectBounds(project);
    const mpu = metersPerUnit(project);
    const extents = `${formatLength(bounds.w, project, { precision: 1 })} × ${formatLength(bounds.h, project, { precision: 1 })}`;
    this.extentsEl.textContent = `${extents} · ${formatArea(projectArea(project), project)}`;
    this.unitEl.textContent = isCalibrated(project)
      ? project.unitSystem === "imperial"
        ? "ft"
        : "m"
      : "u";
  }

  _updateHint() {
    if (this.mode === "walk") {
      this.hint.innerHTML = this.walking.locked
        ? `<span class="desktop-only">${icon("keyboard", 13)}</span><span>Mouse look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Esc</kbd> release</span><button type="button" data-exit-walk>Exit</button>`
        : `<span class="desktop-only">${icon("walk", 13)}</span><span>Click the model to look · <kbd>Esc</kbd> to exit</span><button type="button" data-exit-walk>Exit walk</button>`;
    } else if (this.moveMode) {
      this.hint.innerHTML = `<span class="desktop-only">${icon("move", 13)}</span><span>Drag an item to move it · wall decor slides along its wall · toggle <strong>Move</strong> off to orbit</span>`;
    } else if (this.mode === "top") {
      this.hint.innerHTML = `<span class="desktop-only">${icon("top", 13)}</span><span>Drag to pan · scroll to zoom · click to select</span>`;
    } else {
      this.hint.innerHTML = `<span class="desktop-only">${icon("orbit", 13)}</span><span>Drag to orbit · scroll to zoom · click a room or item</span>`;
    }
  }

  update(state, reason = "change") {
    this.state = state;
    this.project = state.project;
    const modeChanged = this.mode !== state.viewMode;
    this.mode = state.viewMode;

    if (["project-reset", "project", "history", "init"].includes(reason)) {
      this._rebuild({ resetCamera: reason === "project-reset" || reason === "init" });
    } else if (reason === "live") {
      this._syncObjectTransforms();
      this._rebuildSelection();
      this._renderLabels();
    } else if (reason === "selection") {
      this._rebuildSelection();
      this._renderLabels();
    } else if (reason === "project-meta") {
      this._updateExtents();
      this._updateSelectionPill();
      this._rebuildSelection();
      this._renderLabels();
    }

    if (modeChanged || reason === "view") {
      this._applyMode({ resetCamera: reason === "view" || modeChanged });
    }

    this._updateViewButtons();
    this._updateSelectionPill();
    this._updateExtents();
    this._updateHint();
  }

  _updateViewButtons() {
    for (const button of this.overlay.querySelectorAll("[data-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.mode));
    }
  }

  _clearGroup(group) {
    for (const child of [...group.children]) {
      child.traverse?.((node) => {
        if (node.isCSS2DObject) {
          node.element?.remove();
          node.removeFromParent();
        }
      });
      group.remove(child);
      child.traverse?.((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const mat of mats) {
            if (mat.userData?.owned) {
              mat.map?.dispose();
              mat.dispose();
            }
          }
        }
      });
    }
  }

  _clearAll() {
    for (const group of [
      this.floorGroup,
      this.wallGroup,
      this.ceilingGroup,
      this.objectGroup,
      this.selectionGroup,
      this.measureGroup,
      this.labelGroup,
    ]) {
      this._clearGroup(group);
    }
    this.labels = [];
    this.roomLabelEls.clear();
    this.furnitureGroups = new Map();
    this.roomFloorMeshes = new Map();
  }

  _rebuild({ resetCamera = false } = {}) {
    if (!this.project?.rooms?.length) return;
    const preservedCamera = resetCamera
      ? null
      : { position: this.camera.position.clone(), target: this.controls.target.clone() };
    this._clearAll();
    if (this.roomLights) {
      for (const light of this.roomLights) light.removeFromParent();
      this.roomLights = [];
    }

    const mpu = metersPerUnit(this.project);
    const bounds = projectBounds(this.project);
    const bm = {
      minX: bounds.minX * mpu,
      minY: bounds.minY * mpu,
      maxX: bounds.maxX * mpu,
      maxY: bounds.maxY * mpu,
      w: bounds.w * mpu,
      h: bounds.h * mpu,
      cx: bounds.cx * mpu,
      cy: bounds.cy * mpu,
    };
    this.boundsMeters = bm;

    this._buildFloor(bm, mpu);
    this._buildWalls(mpu, bm);
    this._buildCeilings(mpu);
    this._buildFurniture(mpu);

    const roomLights = [];
    for (const room of this.project.rooms.slice(0, 8)) {
      const c = roomCenter(room);
      const light = new THREE.PointLight(0xfff1d8, Math.min(9, room.w * room.h * 0.4 + 2.5), Math.max(6, Math.max(room.w, room.h) * mpu * 1.4), 2);
      light.position.set(c.x * mpu, room.ceilingHeight * 0.92, c.y * mpu);
      this.root.add(light);
      roomLights.push(light);
    }
    this.roomLights = roomLights;

    this._rebuildSelection();
    this._renderLabels();
    this._updateCeilingVisibility();
    this._syncMeasureVisibility();
    this._updateWallClipping();
    this._updateLabelVisibility();

    if (preservedCamera) {
      this.camera.position.copy(preservedCamera.position);
      this.controls.target.copy(preservedCamera.target);
      this.controls.update();
    } else {
      this._frameCamera(true);
    }
    this._updateExtents();
    this._updateHint();
  }

  _buildFloor(bm, mpu) {
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xd7cfbf, roughness: 0.95 });
    slabMat.userData.owned = true;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bm.w + 0.7, 0.22, bm.h + 0.7), slabMat);
    slab.position.set(bm.cx, -0.17, bm.cy);
    slab.receiveShadow = true;
    slab.castShadow = true;
    slab.userData.kind = "ground";
    this.floorGroup.add(slab);

    for (const room of this.project.rooms) {
      const w = room.w * mpu;
      const h = room.h * mpu;
      const kind = room.materials.floor.kind || "wood";
      const texture = makeSurfaceTexture(["wood", "stone", "tile", "carpet", "concrete"].includes(kind) ? kind : "wood").clone();
      texture.needsUpdate = true;
      texture.repeat.set(Math.max(1, w / 1.4), Math.max(1, h / 1.4));
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(room.materials.floor.color),
        map: texture,
        roughness: kind === "carpet" ? 1 : 0.72,
        metalness: 0,
      });
      mat.userData.owned = true;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, h), mat);
      mesh.position.set((room.x + room.w / 2) * mpu, -0.028, (room.y + room.h / 2) * mpu);
      mesh.receiveShadow = true;
      mesh.userData.kind = "room";
      mesh.userData.roomId = room.id;
      this.floorGroup.add(mesh);
      this.roomFloorMeshes.set(room.id, mesh);
    }
  }

  _collectWallRuns(mpu) {
    const lines = new Map();
    const line = (orientation, coord) => {
      const key = `${orientation}:${coord.toFixed(4)}`;
      if (!lines.has(key)) {
        lines.set(key, { orientation, coord, intervals: [], openings: [], rooms: new Map() });
      }
      return lines.get(key);
    };

    for (const room of this.project.rooms) {
      const x1 = room.x * mpu;
      const y1 = room.y * mpu;
      const x2 = (room.x + room.w) * mpu;
      const y2 = (room.y + room.h) * mpu;
      const add = (orientation, coord, a, b) => {
        const l = line(orientation, coord);
        l.intervals.push({ a: Math.min(a, b), b: Math.max(a, b), room });
        l.rooms.set(room.id, room);
      };
      const walls = room.walls || {};
      if (walls.n !== false) add("h", y1, x1, x2);
      if (walls.s !== false) add("h", y2, x1, x2);
      if (walls.w !== false) add("v", x1, y1, y2);
      if (walls.e !== false) add("v", x2, y1, y2);
    }

    for (const opening of this.project.openings || []) {
      const room = this.project.rooms.find((r) => r.id === opening.roomId);
      if (!room) continue;
      const frame = openingFrame(opening, room);
      const orientation = opening.wall === "n" || opening.wall === "s" ? "h" : "v";
      const coord = orientation === "h" ? frame.y * mpu : frame.x * mpu;
      const at = (orientation === "h" ? frame.x : frame.y) * mpu;
      const l = line(orientation, coord);
      if (l.openings.some((o) => o.id === opening.id)) continue;
      l.openings.push({
        id: opening.id,
        at,
        width: opening.width * mpu,
        height: opening.height,
        sill: opening.sill,
        type: opening.type,
        roomId: opening.roomId,
      });
    }

    const runs = [];
    for (const l of lines.values()) {
      l.intervals.sort((a, b) => a.a - b.a);
      const boundaries = [...new Set(l.intervals.flatMap((i) => [i.a, i.b]))].sort((a, b) => a - b);
      const segments = [];
      for (let i = 0; i < boundaries.length - 1; i += 1) {
        const a = boundaries[i];
        const b = boundaries[i + 1];
        if (b - a < 1e-4) continue;
        const mid = (a + b) / 2;
        const covering = l.intervals.filter((int) => int.a <= mid + 1e-5 && int.b >= mid - 1e-5);
        if (!covering.length) continue;
        segments.push({ a, b, rooms: covering.map((c) => c.room) });
      }
      const merged = [];
      for (const seg of segments) {
        const last = merged[merged.length - 1];
        if (last && Math.abs(last.b - seg.a) < 1e-4) {
          last.b = seg.b;
          for (const room of seg.rooms) last.rooms.set(room.id, room);
        } else {
          merged.push({ a: seg.a, b: seg.b, rooms: new Map(seg.rooms.map((r) => [r.id, r])) });
        }
      }
      for (const run of merged) {
        const rooms = [...run.rooms.values()];
        const height = Math.max(...rooms.map((r) => r.ceilingHeight));
        const mid = (run.a + run.b) / 2;
        const openings = l.openings
          .filter((o) => o.at + o.width / 2 > run.a + 0.01 && o.at - o.width / 2 < run.b - 0.01)
          .sort((a, b) => a.at - b.at);
        const roomId =
          [...run.rooms.values()].find((r) => {
            if (l.orientation === "h") {
              const z = run.a;
              const x = mid / mpu;
              return x >= r.x - 0.01 && x <= r.x + r.w + 0.01;
            }
            const y = mid / mpu;
            return run.a >= r.y * mpu - 0.01 && run.b <= (r.y + r.h) * mpu + 0.01;
          })?.id || rooms[0]?.id;
        runs.push({ ...l, ...run, height, openings, roomId });
      }
    }
    return runs;
  }

  _buildWalls(mpu, bm) {
    this.wallMaterials = [];
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.92 });
    wallMat.userData.owned = true;
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xe6ddcd, roughness: 0.82 });
    trimMat.userData.owned = true;
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xbfa382, roughness: 0.62 });
    doorMat.userData.owned = true;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9e1d2, roughness: 0.7 });
    frameMat.userData.owned = true;
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xb9d1d5,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.32,
      transmission: 0.15,
      side: THREE.DoubleSide,
    });
    glassMat.userData.owned = true;
    const sillMat = new THREE.MeshStandardMaterial({ color: 0xf1eadc, roughness: 0.6 });
    sillMat.userData.owned = true;
    this.wallMaterials = [wallMat, trimMat, doorMat, frameMat, glassMat, sillMat];

    const runs = this._collectWallRuns(mpu);
    const roomByWall = new Map();

    const roomsAt = (orientation, coord, a, b, side) => {
      const found = [];
      for (const room of this.project.rooms) {
        let edge;
        let spanStart;
        let spanEnd;
        if (orientation === "h") {
          edge = (side === "south" ? room.y : room.y + room.h) * mpu;
          spanStart = room.x * mpu;
          spanEnd = (room.x + room.w) * mpu;
        } else {
          edge = (side === "east" ? room.x : room.x + room.w) * mpu;
          spanStart = room.y * mpu;
          spanEnd = (room.y + room.h) * mpu;
        }
        if (Math.abs(edge - coord) > 0.02) continue;
        const overlap = Math.min(b, spanEnd) - Math.max(a, spanStart);
        if (overlap > 0.01) found.push({ room, overlap });
      }
      found.sort((left, right) => right.overlap - left.overlap);
      return found[0]?.room || null;
    };

    const wallMaterialFor = (room) => {
      const key = room ? `${room.id}|${room.materials.wall.color}|${room.materials.wall.kind}` : "fallback";
      if (roomByWall.has(key)) return roomByWall.get(key);
      if (!room) return wallMat;
      const kind = room.materials.wall.kind || "paint";
      const textured = !["paint", "smooth"].includes(kind);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(room.materials.wall.color),
        roughness: kind === "stone" ? 0.96 : kind === "tile" ? 0.62 : kind === "fabric" ? 0.98 : 0.9,
        metalness: 0,
      });
      if (textured) {
        const texture = makeSurfaceTexture(kind).clone();
        texture.needsUpdate = true;
        texture.repeat.set(2.5, 1.6);
        mat.map = texture;
      }
      mat.userData.owned = true;
      this.wallMaterials.push(mat);
      roomByWall.set(key, mat);
      return mat;
    };

    const addSegment = (run, a, b, y0, y1, thickness = WALL_THICKNESS) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return null;
      const length = b - a;
      const height = y1 - y0;
      const geom =
        run.orientation === "h"
          ? new THREE.BoxGeometry(length, height, thickness)
          : new THREE.BoxGeometry(thickness, height, length);
      const primaryRoom = this.project.rooms.find((room) => room.id === run.roomId) || null;
      const primaryMat = wallMaterialFor(primaryRoom);
      let material = primaryMat;
      if (run.orientation === "h") {
        const south = roomsAt("h", run.coord, a, b, "south");
        const north = roomsAt("h", run.coord, a, b, "north");
        material = [
          primaryMat,
          primaryMat,
          primaryMat,
          primaryMat,
          wallMaterialFor(south),
          wallMaterialFor(north),
        ];
      } else {
        const east = roomsAt("v", run.coord, a, b, "east");
        const west = roomsAt("v", run.coord, a, b, "west");
        material = [
          wallMaterialFor(east),
          wallMaterialFor(west),
          primaryMat,
          primaryMat,
          primaryMat,
          primaryMat,
        ];
      }
      const mesh = new THREE.Mesh(geom, material);
      if (run.orientation === "h") {
        mesh.position.set((a + b) / 2, y0 + height / 2, run.coord);
      } else {
        mesh.position.set(run.coord, y0 + height / 2, (a + b) / 2);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.kind = "room";
      mesh.userData.roomId = primaryRoom?.id || run.roomId;
      this.wallGroup.add(mesh);
      return mesh;
    };

    const addBaseboard = (run, a, b) => {
      const length = b - a;
      if (length < 0.02) return;
      const geom =
        run.orientation === "h"
          ? new THREE.BoxGeometry(length, 0.09, WALL_THICKNESS + 0.035)
          : new THREE.BoxGeometry(WALL_THICKNESS + 0.035, 0.09, length);
      const mesh = new THREE.Mesh(geom, trimMat);
      if (run.orientation === "h") mesh.position.set((a + b) / 2, 0.045, run.coord);
      else mesh.position.set(run.coord, 0.045, (a + b) / 2);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.kind = "room";
      mesh.userData.roomId = run.roomId;
      this.wallGroup.add(mesh);
    };

    const addFrameBox = (run, at, y, w, h, depth, mat) => {
      const geometry =
        run.orientation === "h" ? new THREE.BoxGeometry(w, h, depth) : new THREE.BoxGeometry(depth, h, w);
      const mesh = new THREE.Mesh(geometry, mat);
      if (run.orientation === "h") mesh.position.set(at, y, run.coord);
      else mesh.position.set(run.coord, y, at);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.kind = "room";
      mesh.userData.roomId = run.roomId;
      this.wallGroup.add(mesh);
      return mesh;
    };

    for (const run of runs) {
      const openings = run.openings
        .map((opening) => {
          const half = Math.min(opening.width, 6) / 2;
          return { ...opening, gapStart: clamp(opening.at - half, run.a + 0.02, run.b - 0.02), gapEnd: clamp(opening.at + half, run.a + 0.02, run.b - 0.02) };
        })
        .filter((o) => o.gapEnd - o.gapStart > 0.08)
        .sort((a, b) => a.gapStart - b.gapStart);

      let cursor = run.a;
      for (const opening of openings) {
        if (opening.gapStart > cursor) {
          addSegment(run, cursor, opening.gapStart, 0, run.height);
          addBaseboard(run, cursor, opening.gapStart);
        }
        const gapWidth = opening.gapEnd - opening.gapStart;
        const sill = clamp(opening.sill, 0, Math.max(0, run.height - 0.3));
        const top = clamp(sill + opening.height, sill + 0.3, run.height);
        if (sill > 0.01) addSegment(run, opening.gapStart, opening.gapEnd, 0, sill);
        if (run.height - top > 0.01) addSegment(run, opening.gapStart, opening.gapEnd, top, run.height);

        if (opening.type === "door") {
          addFrameBox(run, opening.gapStart + 0.025, top / 2, 0.05, top, WALL_THICKNESS + 0.03, frameMat);
          addFrameBox(run, opening.gapEnd - 0.025, top / 2, 0.05, top, WALL_THICKNESS + 0.03, frameMat);
          addFrameBox(run, (opening.gapStart + opening.gapEnd) / 2, top - 0.025, gapWidth, 0.05, WALL_THICKNESS + 0.03, frameMat);
          // Door leaf, hinged and slightly open.
          const leaf = new THREE.Group();
          leaf.position.set(
            run.orientation === "h" ? opening.gapStart + 0.03 : run.coord,
            0,
            run.orientation === "h" ? run.coord : opening.gapStart + 0.03
          );
          leaf.rotation.y = run.orientation === "h" ? -0.42 : Math.PI / 2 - 0.42;
          const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(gapWidth * 0.93, Math.min(top - 0.06, opening.height) - 0.02, 0.042), doorMat);
          leafMesh.position.set(gapWidth * 0.465, Math.min(top - 0.06, opening.height) / 2, 0);
          leafMesh.castShadow = true;
          leafMesh.receiveShadow = true;
          leaf.add(leafMesh);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), frameMat);
          knob.position.set(gapWidth * 0.83, 1.02, 0.035);
          leaf.add(knob);
          leaf.traverse((child) => {
            child.userData.kind = "room";
            child.userData.roomId = run.roomId;
          });
          this.wallGroup.add(leaf);
        } else {
          const frameDepth = WALL_THICKNESS + 0.06;
          addFrameBox(run, opening.gapStart + 0.02, sill + opening.height / 2, 0.05, opening.height, frameDepth, frameMat);
          addFrameBox(run, opening.gapEnd - 0.02, sill + opening.height / 2, 0.05, opening.height, frameDepth, frameMat);
          addFrameBox(run, (opening.gapStart + opening.gapEnd) / 2, sill + opening.height - 0.02, gapWidth, 0.04, frameDepth, frameMat);
          addFrameBox(run, (opening.gapStart + opening.gapEnd) / 2, sill + 0.02, gapWidth, 0.04, frameDepth, frameMat);
          addFrameBox(run, (opening.gapStart + opening.gapEnd) / 2, sill + opening.height / 2, 0.035, opening.height, frameDepth, frameMat);
          const glass = addFrameBox(
            run,
            (opening.gapStart + opening.gapEnd) / 2,
            sill + opening.height / 2,
            Math.max(0.05, gapWidth - 0.08),
            Math.max(0.05, opening.height - 0.08),
            0.018,
            glassMat
          );
          glass.castShadow = false;
          // sill board protruding into the room
          addFrameBox(run, (opening.gapStart + opening.gapEnd) / 2, sill - 0.02, gapWidth + 0.12, 0.045, WALL_THICKNESS + 0.16, sillMat);
        }
        cursor = Math.max(cursor, opening.gapEnd);
      }
      if (cursor < run.b) {
        addSegment(run, cursor, run.b, 0, run.height);
        addBaseboard(run, cursor, run.b);
      }
    }

    // A soft contact shadow under the building.
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x2c281f, transparent: true, opacity: 0.06, depthWrite: false });
    shadowMat.userData.owned = true;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(bm.w + 2.2, bm.h + 2.2), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(bm.cx, -0.31, bm.cy);
    this.floorGroup.add(shadow);
  }

  _buildCeilings(mpu) {
    for (const room of this.project.rooms) {
      const kind = room.materials.ceiling.kind || "paint";
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(room.materials.ceiling.color),
        roughness: kind === "wood" ? 0.82 : 0.95,
        side: THREE.DoubleSide,
      });
      if (!["paint", "smooth"].includes(kind)) {
        const texture = makeSurfaceTexture(kind).clone();
        texture.needsUpdate = true;
        texture.repeat.set(Math.max(1, (room.w * mpu) / 1.6), Math.max(1, (room.h * mpu) / 1.6));
        mat.map = texture;
      }
      mat.userData.owned = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(room.w * mpu, room.h * mpu), mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set((room.x + room.w / 2) * mpu, room.ceilingHeight, (room.y + room.h / 2) * mpu);
      mesh.receiveShadow = true;
      mesh.userData.kind = "room";
      mesh.userData.roomId = room.id;
      this.ceilingGroup.add(mesh);
    }
  }

  _buildFurniture(mpu) {
    this.furnitureGroups = new Map();
    for (const object of this.project.objects) {
      const group = buildFurniture(object);
      if (object.texture && object.texture !== "smooth") this._applyObjectTexture(group, object.texture);
      const x = object.x * mpu;
      const z = object.y * mpu;
      if (object.placement === "wall" || object.placement === "ceiling") {
        group.position.set(x, object.elevation, z);
      } else {
        group.position.set(x, object.elevation || 0, z);
      }
      group.rotation.y = object.rotation || 0;
      this.objectGroup.add(group);
      this.furnitureGroups.set(object.id, group);
    }
  }

  _applyObjectTexture(group, kind) {
    const supported = ["fabric", "wood", "stone", "metal", "tile", "concrete", "carpet"].includes(kind)
      ? kind
      : "fabric";
    const texture = makeSurfaceTexture(supported).clone();
    texture.needsUpdate = true;
    texture.repeat.set(1.4, 1.4);
    group.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const source = Array.isArray(node.material) ? node.material : [node.material];
      const clones = source.map((mat) => {
        const clone = mat.clone();
        clone.userData = { ...(mat.userData || {}), owned: true };
        if (!mat.transparent) {
          clone.map = texture;
          clone.needsUpdate = true;
          if (kind === "metal") {
            clone.metalness = Math.max(0.35, clone.metalness || 0);
            clone.roughness = Math.min(0.42, clone.roughness ?? 0.5);
          }
        }
        return clone;
      });
      node.material = Array.isArray(node.material) ? clones : clones[0];
    });
  }

  _syncObjectTransforms() {
    const mpu = metersPerUnit(this.project);
    for (const object of this.project.objects) {
      const group = this.furnitureGroups.get(object.id);
      if (!group) continue;
      group.position.x = object.x * mpu;
      group.position.z = object.y * mpu;
      group.position.y = object.elevation || 0;
      group.rotation.y = object.rotation || 0;
      const boxHelper = this._objectHelper;
      if (boxHelper && this.state.selection.kind === "object" && this.state.selection.id === object.id) {
        boxHelper.update();
      }
    }
  }

  _updateCeilingVisibility() {
    const visible = this.mode === "walk" ? this.showCeilings : this.showCeilings && this.mode !== "top";
    this.ceilingGroup.visible = visible;
    if (this.roomLights) {
      for (const light of this.roomLights) light.visible = visible || this.mode === "orbit";
    }
  }

  _updateWallClipping() {
    if (!this.wallMaterials?.length) return;
    const cutaway = this.mode !== "walk";
    for (const material of this.wallMaterials) {
      material.clippingPlanes = cutaway ? [this.wallClipPlane] : [];
      material.clipShadows = true;
      material.needsUpdate = true;
    }
  }

  _syncMeasureVisibility() {
    this.measureGroup.visible = this.showMeasurements && this.mode !== "walk";
  }

  _updateLabelVisibility() {
    const interior = this.mode === "walk";
    this.labelGroup.visible = !interior;
    this.selectionGroup.visible = !interior;
    this.measureGroup.visible = !interior && this.showMeasurements;
  }

  _rebuildSelection() {
    this._clearGroup(this.selectionGroup);
    this._clearGroup(this.measureGroup);
    this._objectHelper = null;
    const state = this.state;
    const room = store.selectedRoom;
    const object = store.selectedObject;
    const mpu = metersPerUnit(this.project);
    if (!room) return;

    if (!object) {
      const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.11, depthWrite: false });
      mat.userData.owned = true;
      const overlay = new THREE.Mesh(new THREE.PlaneGeometry(room.w * mpu, room.h * mpu), mat);
      overlay.rotation.x = -Math.PI / 2;
      overlay.position.set((room.x + room.w / 2) * mpu, 0.034, (room.y + room.h / 2) * mpu);
      overlay.userData.kind = "selection";
      overlay.userData.roomId = room.id;
      overlay.raycast = () => {};
      this.selectionGroup.add(overlay);

      const points = [
        new THREE.Vector3(room.x * mpu, 0.036, room.y * mpu),
        new THREE.Vector3((room.x + room.w) * mpu, 0.036, room.y * mpu),
        new THREE.Vector3((room.x + room.w) * mpu, 0.036, (room.y + room.h) * mpu),
        new THREE.Vector3(room.x * mpu, 0.036, (room.y + room.h) * mpu),
        new THREE.Vector3(room.x * mpu, 0.036, room.y * mpu),
      ];
      const lineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8 });
      lineMat.userData.owned = true;
      const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat);
      this.selectionGroup.add(loop);
      this._buildRoomMeasures(room, mpu);
    } else {
      const group = this.furnitureGroups.get(object.id);
      if (group) {
        const helper = new THREE.BoxHelper(group, ACCENT);
        helper.material.transparent = true;
        helper.material.opacity = 0.9;
        helper.material.depthTest = false;
        helper.renderOrder = 10;
        this.selectionGroup.add(helper);
        this._objectHelper = helper;
        this._buildObjectMeasures(object, room, mpu);
      }
    }
  }

  _buildRoomMeasures(room, mpu) {
    const accentMat = new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.75 });
    accentMat.userData.owned = true;
    const status = room.measurement;
    const widthLabel = document.createElement("div");
    widthLabel.className = `measure-label${status !== "calibrated" ? " is-estimated" : ""}`;
    widthLabel.innerHTML = `<span class="status-dot"></span>${formatLength(room.w, this.project)}`;
    const depthLabel = document.createElement("div");
    depthLabel.className = `measure-label${status !== "calibrated" ? " is-estimated" : ""}`;
    depthLabel.innerHTML = `<span class="status-dot"></span>${formatLength(room.h, this.project)}`;

    const y = 0.05;
    const inset = 0.22 / mpu;
    const zNear = room.y + room.h - inset;
    const xNear = room.x + inset;
    const widthPoints = [
      new THREE.Vector3(room.x * mpu, y, zNear * mpu),
      new THREE.Vector3((room.x + room.w) * mpu, y, zNear * mpu),
    ];
    const depthPoints = [
      new THREE.Vector3(xNear * mpu, y, room.y * mpu),
      new THREE.Vector3(xNear * mpu, y, (room.y + room.h) * mpu),
    ];
    for (const [points, tickAlongX] of [
      [widthPoints, false],
      [depthPoints, true],
    ]) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), accentMat);
      line.computeLineDistances();
      this.measureGroup.add(line);
      for (const p of points) {
        const tick = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p.x - (tickAlongX ? 0.12 : 0), y, p.z - (tickAlongX ? 0 : 0.12)),
            new THREE.Vector3(p.x + (tickAlongX ? 0.12 : 0), y, p.z + (tickAlongX ? 0 : 0.12)),
          ]),
          accentMat
        );
        this.measureGroup.add(tick);
      }
    }

    const widthObj = new CSS2DObject(widthLabel);
    widthObj.position.set(((room.x + room.w / 2) * mpu), 0.16, zNear * mpu);
    this.measureGroup.add(widthObj);
    const depthObj = new CSS2DObject(depthLabel);
    depthObj.position.set(xNear * mpu, 0.16, (room.y + room.h / 2) * mpu);
    this.measureGroup.add(depthObj);
  }

  _buildObjectMeasures(object, room, mpu) {
    const width = object.dims.w / mpu;
    const depth = object.dims.d / mpu;
    const color = ACCENT;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
    mat.userData.owned = true;
    const y = object.placement === "wall" ? Math.max(0.1, object.elevation - object.dims.h / 2 - 0.1) : 0.06;
    const label = document.createElement("div");
    label.className = "measure-label";
    label.innerHTML = `${formatCeiling(object.dims.w, this.project)} × ${formatCeiling(object.dims.d, this.project)} × ${formatCeiling(object.dims.h, this.project)}`;
    const labelObj = new CSS2DObject(label);
    labelObj.position.set(object.x * mpu, object.placement === "floor" ? Math.max(0.8, object.dims.h + 0.15) : object.elevation + object.dims.h / 2 + 0.2, object.y * mpu);
    this.measureGroup.add(labelObj);

    if (object.placement === "floor") {
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ];
      const c = Math.cos(object.rotation || 0);
      const s = Math.sin(object.rotation || 0);
      const points = corners.map(([x, z]) => {
        const lx = (x * width) / 2;
        const lz = (z * depth) / 2;
        return new THREE.Vector3(
          (object.x + lx * c + lz * s) * mpu,
          y,
          (object.y - lx * s + lz * c) * mpu
        );
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
      this.measureGroup.add(line);
    }
  }

  _renderLabels() {
    for (const object of this.labels) {
      object.element?.remove();
      object.removeFromParent();
    }
    this.labels = [];
    if (!this.project?.rooms) return;
    const mpu = metersPerUnit(this.project);
    const selectedRoomId = store.selectedRoomId;
    const narrow = this.container.clientWidth < 720;
    for (const room of this.project.rooms) {
      if (narrow && room.id !== selectedRoomId) continue;
      const el = document.createElement("div");
      const selected = room.id === selectedRoomId;
      el.className = `room-label${selected ? " is-selected" : ""}`;
      const suffix = room.measurement === "calibrated" ? "" : `<span class="meta">${room.measurement === "estimated" ? "est." : "edited"}</span>`;
      el.innerHTML = `<span>${escapeHtml(room.name)}</span><span class="meta">${formatArea(roomArea(room), this.project)}</span>${suffix}`;
      const label = new CSS2DObject(el);
      label.position.set((room.x + room.w / 2) * mpu, Math.min(1.5, room.ceilingHeight * 0.55), (room.y + room.h / 2) * mpu);
      this.labelGroup.add(label);
      this.labels.push(label);
    }
  }

  _frameCamera(instant = false) {
    if (!this.boundsMeters) return;
    const bm = this.boundsMeters;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.max(this.camera.aspect || 1, 0.2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    if (this.mode === "top") {
      this.camera.up.set(0, 0, -1);
      const height =
        Math.max(
          (bm.h / 2) / Math.tan(vFov / 2),
          (bm.w / 2) / Math.tan(hFov / 2)
        ) * 1.25 + 2;
      this._moveCamera(
        new THREE.Vector3(bm.cx, height, bm.cy + 0.001),
        new THREE.Vector3(bm.cx, 0, bm.cy),
        instant ? 0 : 520
      );
      return;
    }
    if (this.mode === "walk") {
      this._enterWalk();
      return;
    }
    this.camera.up.set(0, 1, 0);
    const distance =
      Math.max(
        (bm.w / 2) / Math.tan(hFov / 2),
        (bm.h / 2) / Math.tan(vFov / 2),
        7
      ) * 1.22 + 2;
    const direction = new THREE.Vector3(0.62, 1.0, 0.78).normalize();
    const target = new THREE.Vector3(bm.cx, 0.5, bm.cy);
    const pos = target.clone().addScaledVector(direction, distance);
    this._moveCamera(pos, target, instant ? 0 : 620);
  }

  _moveCamera(position, target, duration = 600) {
    if (duration <= 0) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.controls.update();
      this._updateOrbitLimits();
      return;
    }
    this.animation = {
      start: performance.now(),
      duration,
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
    };
  }

  _updateOrbitLimits() {
    const bm = this.boundsMeters;
    if (!bm) return;
    const maxDim = Math.max(bm.w, bm.h, 4);
    this.controls.maxDistance = Math.max(30, maxDim * 4.5);
    this.controls.minDistance = 1.5;
  }

  _applyMode({ resetCamera = false } = {}) {
    if (this.mode === "walk") {
      if (this.moveMode) this._setMoveMode(false);
      this.controls.enabled = false;
      this.renderer.domElement.style.cursor = "crosshair";
      this.ceilingAuto = !this.showCeilings;
      if (this.ceilingAuto) {
        this.showCeilings = true;
        this.overlay.querySelector('[data-tool="ceiling"]')?.setAttribute("aria-pressed", "true");
      }
      this._updateCeilingVisibility();
      this._updateWallClipping();
      this._updateLabelVisibility();
      this._enterWalk();
    } else {
      if (this.ceilingAuto) {
        this.showCeilings = false;
        this.ceilingAuto = false;
        this.overlay.querySelector('[data-tool="ceiling"]')?.setAttribute("aria-pressed", "false");
      }
      if (document.pointerLockElement) document.exitPointerLock?.();
      this.walking.locked = false;
      this.walking.keys.clear();
      this.controls.enabled = !this.moveMode && (this.mode === "orbit" || this.mode === "top");
      this.controls.enableRotate = this.mode === "orbit";
      this.controls.enablePan = true;
      this.renderer.domElement.style.cursor = this.moveMode ? "move" : "grab";
      this._updateCeilingVisibility();
      this._updateWallClipping();
      this._updateLabelVisibility();
      if (this.mode === "top") {
        this.camera.up.set(0, 0, -1);
        const bm = this.boundsMeters;
        if (bm) {
          this._moveCamera(
            new THREE.Vector3(bm.cx, Math.max(bm.w, bm.h) * 1.35 + 4, bm.cy + 0.001),
            new THREE.Vector3(bm.cx, 0, bm.cy),
            resetCamera ? 420 : 0
          );
        }
      } else {
        this.camera.up.set(0, 1, 0);
        this.controls.enableRotate = true;
        if (resetCamera) this._frameCamera(false);
      }
    }
    this._updateHint();
  }

  _enterWalk() {
    const room = store.selectedRoom || this.project.rooms[0];
    if (!room) return;
    const mpu = metersPerUnit(this.project);
    const start = this._walkStartPoint(room, mpu);
    const eye = Math.min(EYE_HEIGHT, room.ceilingHeight - 0.18);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(start.x * mpu, eye, start.y * mpu);

    const center = roomCenter(room);
    const toCenter = Math.hypot(center.x - start.x, center.y - start.y);
    let target = null;
    if (toCenter > 0.8 / mpu) {
      target = center;
    } else {
      const corners = [
        { x: room.x + 0.1 / mpu, y: room.y + 0.1 / mpu },
        { x: room.x + room.w - 0.1 / mpu, y: room.y + 0.1 / mpu },
        { x: room.x + room.w - 0.1 / mpu, y: room.y + room.h - 0.1 / mpu },
        { x: room.x + 0.1 / mpu, y: room.y + room.h - 0.1 / mpu },
      ].sort(
        (a, b) =>
          (b.x - start.x) ** 2 + (b.y - start.y) ** 2 -
          ((a.x - start.x) ** 2 + (a.y - start.y) ** 2)
      );
      target = corners[0] || center;
    }
    const dx = target.x - start.x;
    const dz = target.y - start.y;
    this.walking.yaw = Math.abs(dx) + Math.abs(dz) > 0.01 ? Math.atan2(-dx, -dz) : 0;
    this.walking.pitch = -0.02;
    this.camera.rotation.set(this.walking.pitch, this.walking.yaw, 0, "YXZ");
    this._updateCeilingVisibility();
    this._updateHint();
  }

  _walkStartPoint(room, mpu) {
    const pad = 0.45 / mpu;
    const minX = room.x + pad;
    const maxX = room.x + room.w - pad;
    const minY = room.y + pad;
    const maxY = room.y + room.h - pad;
    const center = roomCenter(room);
    const step = 0.35 / mpu;
    const candidates = [];
    for (let x = minX; x <= maxX + 0.001; x += step) {
      for (let y = minY; y <= maxY + 0.001; y += step) {
        candidates.push({ x, y });
      }
    }
    candidates.sort(
      (a, b) =>
        (a.x - center.x) ** 2 + (a.y - center.y) ** 2 -
        ((b.x - center.x) ** 2 + (b.y - center.y) ** 2)
    );
    for (const point of candidates) {
      if (!this._pointBlockedByFurniture(point, room)) return point;
    }
    return center;
  }

  _pointBlockedByFurniture(point, room) {
    const mpu = metersPerUnit(this.project);
    for (const object of this.project.objects) {
      if (object.roomId !== room.id) continue;
      if (object.placement !== "floor" || object.type === "rug") continue;
      const dx = point.x - object.x;
      const dy = point.y - object.y;
      const c = Math.cos(object.rotation || 0);
      const s = Math.sin(object.rotation || 0);
      const lx = dx * c - dy * s;
      const lz = dx * s + dy * c;
      const hw = object.dims.w / mpu / 2 + 0.25 / mpu;
      const hd = object.dims.d / mpu / 2 + 0.25 / mpu;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) return true;
    }
    return false;
  }

  _canWalkTo(x, z) {
    const mpu = metersPerUnit(this.project);
    const pad = 0.22;
    for (const room of this.project.rooms) {
      const x1 = room.x * mpu + pad;
      const x2 = (room.x + room.w) * mpu - pad;
      const z1 = room.y * mpu + pad;
      const z2 = (room.y + room.h) * mpu - pad;
      if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return true;
    }
    // Doorways: allow passing through the opening.
    for (const opening of this.project.openings || []) {
      if (opening.type !== "door") continue;
      const room = this.project.rooms.find((r) => r.id === opening.roomId);
      if (!room) continue;
      const frame = openingFrame(opening, room);
      const cx = frame.x * mpu;
      const cz = frame.y * mpu;
      const half = (opening.width * mpu) / 2 + 0.12;
      const orientation = opening.wall === "n" || opening.wall === "s" ? "h" : "v";
      if (orientation === "h") {
        if (Math.abs(z - cz) < 0.55 && Math.abs(x - cx) < half) return true;
      } else if (Math.abs(x - cx) < 0.55 && Math.abs(z - cz) < half) return true;
    }
    return false;
  }

  _walkStep(delta) {
    if (this.mode !== "walk") return;
    const keys = this.walking.keys;
    let forward = 0;
    let strafe = 0;
    if (keys.has("w") || keys.has("arrowup")) forward += 1;
    if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
    if (keys.has("d") || keys.has("arrowright")) strafe += 1;
    if (keys.has("a") || keys.has("arrowleft")) strafe -= 1;
    if (!forward && !strafe) {
      this.camera.position.y = Math.min(this.camera.position.y, 2.6);
      return;
    }
    const speed = keys.has("shift") ? 3.4 : 1.85;
    const yaw = this.walking.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const distance = speed * Math.min(delta, 0.05);
    const dx = (-sin * forward + cos * strafe) * distance;
    const dz = (-cos * forward - sin * strafe) * distance;
    const x = this.camera.position.x;
    const z = this.camera.position.z;
    let nextX = x + dx;
    let nextZ = z + dz;
    if (this._canWalkTo(nextX, nextZ)) {
      this.camera.position.x = nextX;
      this.camera.position.z = nextZ;
    } else if (this._canWalkTo(nextX, z)) {
      this.camera.position.x = nextX;
    } else if (this._canWalkTo(x, nextZ)) {
      this.camera.position.z = nextZ;
    }
    // Keep the eye at a human height, lower only in very low rooms.
    const mpu = metersPerUnit(this.project);
    let ceiling = 2.7;
    for (const room of this.project.rooms) {
      if (
        this.camera.position.x >= room.x * mpu &&
        this.camera.position.x <= (room.x + room.w) * mpu &&
        this.camera.position.z >= room.y * mpu &&
        this.camera.position.z <= (room.y + room.h) * mpu
      ) {
        ceiling = room.ceilingHeight;
        break;
      }
    }
    this.camera.position.y = Math.min(EYE_HEIGHT, ceiling - 0.18);
  }

  _isSelectableHit(hit) {
    const data = hit.object.userData;
    if (!data) return false;
    if (data.kind === "object") return true;
    if (data.kind !== "room") return false;
    // In cutaway views the upper part of walls is clipped visually, so it
    // must not block clicks on furniture behind it.
    if (this.mode !== "walk" && hit.point && hit.point.y > this.wallClipPlane.constant + 0.02) {
      return false;
    }
    return true;
  }

  _pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    for (const hit of hits) {
      if (!this._isSelectableHit(hit)) continue;
      const data = hit.object.userData;
      if (data.kind === "object" && data.objectId) {
        store.selectObject(data.objectId);
        return;
      }
      if (data.kind === "room" && data.roomId) {
        store.selectRoom(data.roomId);
        return;
      }
    }
  }

  _hover(event) {
    if (!this.renderer.domElement) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    const interactive = hits.some((hit) => this._isSelectableHit(hit));
    this.renderer.domElement.style.cursor = this.moveMode
      ? interactive
        ? "grab"
        : "move"
      : interactive
        ? "pointer"
        : "grab";
  }

  _animate = () => {
    this.raf = requestAnimationFrame(this._animate);
    const delta = this.clock.getDelta();

    if (this.animation) {
      const t = clamp((performance.now() - this.animation.start) / this.animation.duration, 0, 1);
      const k = easeInOut(t);
      this.camera.position.lerpVectors(this.animation.fromPos, this.animation.toPos, k);
      this.controls.target.lerpVectors(this.animation.fromTarget, this.animation.toTarget, k);
      this.camera.lookAt(this.controls.target);
      if (t >= 1) {
        this.animation = null;
        this._updateOrbitLimits();
      }
    }

    if (this.mode === "walk") {
      this._walkStep(delta);
    } else if (this.controls.enabled) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
    if (this.showMeasurements || this.labels.length) this.labelRenderer.render(this.scene, this.camera);
  };
}

let stage = null;

export function mountStage(container) {
  if (!stage) stage = new Stage(container);
  return stage;
}

export function getStage() {
  return stage;
}
