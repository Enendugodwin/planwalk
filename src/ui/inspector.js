import { store } from "../store.js";
import {
  CATALOG,
  CATALOG_BY_ID,
  CATEGORIES,
  FURNITURE_COLORS,
  OBJECT_TEXTURES,
  SURFACE_PALETTES,
  SURFACE_TEXTURES,
  catalogLabel,
} from "../data/catalog.js";
import {
  canPlaceObject,
  describeCollision,
  duplicateObject,
  addObject,
  removeObject,
  rotateObject,
  setObjectField,
  setObjectPosition,
  faceNearestWindow,
} from "../actions/scene.js";
import {
  setObjectColor,
  setObjectAccent,
  setObjectRotation,
  setObjectTexture,
  setRoomAreaPreserved,
  setRoomDimsFromDisplay,
  setRoomMeasurement,
  setSurfaceMaterial,
  updateRoomField,
} from "../actions/design.js";
import {
  ceilingDisplayNumber,
  displayLengthNumber,
  formatArea,
  formatCeiling,
  formatLength,
  isCalibrated,
  measurementLabel,
  parseCeiling,
  parseDisplayLength,
} from "../model/units.js";
import { roomArea, roomCenter, objectsInRoom, objectDisplayName } from "../model/project.js";
import { escapeHtml, isColorHex } from "../util.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";

const libraryState = { query: "", category: "All" };

const SURFACE_META = {
  wall: { label: "Walls", icon: "room" },
  floor: { label: "Floor", icon: "plan" },
  ceiling: { label: "Ceiling", icon: "layers" },
};

function unitLabel(project) {
  if (!isCalibrated(project)) return "u";
  return project.unitSystem === "imperial" ? "ft" : "m";
}

function ceilingUnit(project) {
  return project.unitSystem === "imperial" ? "ft" : "m";
}

function inputValue(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isFinite(rounded) ? rounded : 0;
}

function measurementTone(room, project) {
  if (!isCalibrated(project)) return "warn";
  if (room.measurement === "estimated") return "warn";
  if (room.measurement === "edited") return "info";
  return "ok";
}

function measurementCopy(room, project) {
  if (!isCalibrated(project)) {
    return "Scale isn't calibrated. Every dimension is shown in plan units and treated as an estimate.";
  }
  if (room.measurement === "estimated") {
    return "The plan scale is calibrated, but this room's outline was estimated. Edit a dimension to take manual control.";
  }
  if (room.measurement === "edited") {
    return "Measurements use the calibrated scale and the outline was manually edited.";
  }
  return "Measurements use the calibrated plan scale.";
}

function tag(tone, iconName, label, title = "") {
  return `<span class="tag" data-tone="${tone}" ${title ? `title="${escapeHtml(title)}"` : ""}>${icon(iconName, 10)} ${escapeHtml(label)}</span>`;
}

export function mountInspector() {
  const el = document.getElementById("inspector");
  el.innerHTML = `
    <div class="inspector-head">
      <div class="breadcrumb" id="inspBreadcrumb"></div>
      <div class="inspector-title-row">
        <h2 class="inspector-title" id="inspTitle">—</h2>
        <span id="inspTag"></span>
      </div>
      <div class="inspector-mobile-tools">
        <div class="mobile-unit segmented" role="group" aria-label="Unit system">
          <button type="button" data-mobile-unit="metric" aria-pressed="true">m</button>
          <button type="button" data-mobile-unit="imperial" aria-pressed="false">ft</button>
        </div>
      </div>
    </div>
    <div class="inspector-body" id="inspectorBody"></div>
  `;
  el.addEventListener("click", onInspectorClick);
  el.addEventListener("change", onInspectorChange);
  el.addEventListener("input", onInspectorInput);
  updateInspector(store.state, "init");
}

function selectedRoomId(state) {
  if (state.selection.kind === "room") return state.selection.id;
  return state.project.objects.find((o) => o.id === state.selection.id)?.roomId || null;
}

export function updateInspector(state, reason = "change") {
  if (!["project", "project-reset", "history", "project-meta", "selection", "init"].includes(reason)) return;
  const el = document.getElementById("inspector");
  if (!el) return;
  const project = state.project;
  const room = store.selectedRoom;
  const object = store.selectedObject;
  const preserveScroll = reason !== "selection" && reason !== "project-reset" && reason !== "init";
  const scroll = el.scrollTop;

  for (const button of el.querySelectorAll("[data-mobile-unit]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mobileUnit === project.unitSystem));
  }

  if (!room) {
    el.querySelector("#inspBreadcrumb").innerHTML = "Project";
    el.querySelector("#inspTitle").textContent = "No room selected";
    el.querySelector("#inspTag").innerHTML = "";
    el.querySelector("#inspectorBody").innerHTML = `<div class="empty-inline">Add or select a room to begin.</div>`;
    return;
  }

  if (object) {
    el.querySelector("#inspBreadcrumb").innerHTML = `${icon("cube", 11)} Object <span>·</span> ${escapeHtml(room.name)}`;
    el.querySelector("#inspTitle").textContent = objectDisplayName(object);
    el.querySelector("#inspTag").innerHTML = tag(
      object.placement === "wall" ? "info" : "ok",
      object.placement === "wall" ? "layers" : "check",
      object.placement === "wall" ? "Wall-mounted" : object.placement === "ceiling" ? "Ceiling" : "On floor"
    );
    el.querySelector("#inspectorBody").innerHTML = objectBody(project, room, object);
  } else {
    el.querySelector("#inspBreadcrumb").innerHTML = `${icon("room", 11)} Room <span>·</span> Floor plan`;
    el.querySelector("#inspTitle").textContent = room.name;
    el.querySelector("#inspTag").innerHTML = tag(
      measurementTone(room, project),
      room.measurement === "calibrated" ? "check" : room.measurement === "edited" ? "settings" : "warn",
      measurementLabel(room.measurement)
    );
    el.querySelector("#inspectorBody").innerHTML = roomBody(project, room);
  }

  el.scrollTop = preserveScroll ? scroll : 0;
}

function roomBody(project, room) {
  const unit = unitLabel(project);
  const unit2 = isCalibrated(project) ? (project.unitSystem === "imperial" ? "ft²" : "m²") : "u²";
  const objects = objectsInRoom(project, room.id);
  return `
    <section class="insp-section">
      <div class="field" style="margin-bottom:9px">
        <label for="roomNameInput">Room name</label>
        <input id="roomNameInput" class="input" value="${escapeHtml(room.name)}" data-room-name="${room.id}" maxlength="60" />
      </div>
      <div class="dim-grid">
        <div class="field">
          <label>Length</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(displayLengthNumber(room.w, project))}" data-room-dim="w" data-room-id="${room.id}" aria-label="Room length" />
            <span class="unit">${unit}</span>
          </div>
        </div>
        <div class="field">
          <label>Width</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(displayLengthNumber(room.h, project))}" data-room-dim="h" data-room-id="${room.id}" aria-label="Room width" />
            <span class="unit">${unit}</span>
          </div>
        </div>
        <div class="field">
          <label>Ceiling height</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(ceilingDisplayNumber(room.ceilingHeight, project))}" data-room-ceiling="${room.id}" aria-label="Ceiling height" />
            <span class="unit">${ceilingUnit(project)}</span>
          </div>
        </div>
        <div class="field">
          <label>Area</label>
          <div class="dim-card" style="padding:6px 8px">
            <div class="dim-value" style="font-size:17px">${formatArea(roomArea(room), project)}</div>
          </div>
        </div>
      </div>
      <div class="measure-summary" data-tone="${measurementTone(room, project) === "warn" ? "warn" : ""}" style="margin-top:9px">
        ${icon(measurementTone(room, project) === "warn" ? "warn" : "checkCircle", 14)}
        <span>${measurementCopy(room, project)} <span style="color:var(--ink-faint)">Interpretation confidence ${Math.round((room.confidence || 0) * 100)}%.</span></span>
      </div>
    </section>

    <section class="insp-section">
      <div class="insp-label">Surfaces &amp; materials</div>
      <div class="material-group">
        ${["wall", "floor", "ceiling"].map((surface) => materialRow(project, room, surface)).join("")}
      </div>
    </section>

    <section class="insp-section">
      <div class="insp-label">
        <span>Items in this room</span>
        <span class="section-sub">${objects.length}</span>
      </div>
      <div class="object-list">
        ${
          objects.length
            ? objects
                .map(
                  (object) => `
                  <button type="button" class="object-row" data-select-object="${object.id}" aria-current="false">
                    <span class="object-thumb">${icon(CATALOG_BY_ID[object.type]?.icon || "decor", 13)}</span>
                    <span class="object-name">
                      <strong>${escapeHtml(objectDisplayName(object))}</strong>
                      <span>${formatCeiling(object.dims.w, project)} × ${formatCeiling(object.dims.d, project)}</span>
                    </span>
                    <span class="tag" data-tone="${object.placement === "wall" ? "info" : "ok"}">${object.placement === "wall" ? "Wall" : "Floor"}</span>
                  </button>`
                )
                .join("")
            : `<div class="empty-inline">This room is empty. Add furniture from the library below.</div>`
        }
      </div>
    </section>

    <section class="insp-section">
      <div class="insp-label">
        <span>Furniture &amp; decor</span>
        <span class="section-sub">Add to ${escapeHtml(room.name)}</span>
      </div>
      ${librarySection(project, room.id)}
    </section>
  `;
}

function materialRow(project, room, surface) {
  const material = room.materials[surface];
  const palette = SURFACE_PALETTES[surface];
  const textures = SURFACE_TEXTURES[surface] || [];
  const meta = SURFACE_META[surface];
  const activeKind = (material.kind || "").toLowerCase();
  return `
    <div class="material-row">
      <div class="material-row-head">
        <span class="swatch-current" style="background:${material.color}" aria-hidden="true"></span>
        <span class="material-name">
          <span>${meta.label}</span>
          <span>${escapeHtml(material.name)} · ${escapeHtml(material.kind)}</span>
        </span>
        <span class="plan-meta" style="margin:0">${icon(meta.icon, 13)}</span>
      </div>
      <div class="swatches">
        ${palette
          .map(
            (entry) => `
            <button type="button" class="swatch-btn" style="background:${entry.color}"
              data-surface="${surface}" data-color="${entry.color}" data-name="${escapeHtml(entry.name)}" data-kind="${entry.kind}"
              aria-label="Use ${escapeHtml(entry.name)} for ${meta.label.toLowerCase()}"
              aria-pressed="${entry.color.toLowerCase() === material.color.toLowerCase()}"
              title="${escapeHtml(entry.name)}"></button>`
          )
          .join("")}
        <label class="swatch-custom" title="Custom colour">
          <input type="color" value="${isColorHex(material.color) ? material.color : "#efeadf"}" data-custom-surface="${surface}" data-room-id="${room.id}" aria-label="Custom ${surface} colour" />
        </label>
      </div>
      <div class="texture-row">
        <span class="texture-label">Texture</span>
        <div class="texture-chips">
          ${textures
            .map(
              (entry) => `
              <button type="button" class="texture-chip" data-surface-texture="${surface}" data-texture="${entry.kind}"
                aria-pressed="${activeKind === entry.kind}"
                title="${escapeHtml(entry.detail)}">${escapeHtml(entry.name)}</button>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function librarySection(project, roomId) {
  const room = project.rooms.find((r) => r.id === roomId);
  return `
    <div class="library-search">
      ${icon("search", 14)}
      <input id="librarySearch" class="input" type="search" placeholder="Search furniture and decor" value="${escapeHtml(libraryState.query)}" aria-label="Search furniture" />
    </div>
    <div class="category-chips">
      ${CATEGORIES.map(
        (category) =>
          `<button type="button" class="cat-chip" data-category="${category}" aria-pressed="${libraryState.category === category}">${category}</button>`
      ).join("")}
    </div>
    <div class="library-grid" id="libraryGrid">${libraryCards(project)}</div>
    <div class="library-add">
      <span>${room ? `Adds to ${escapeHtml(room.name)}` : "Select a room first"}</span>
      <span>${CATALOG.length} pieces</span>
    </div>
  `;
}

function libraryCards(project) {
  const query = libraryState.query.trim().toLowerCase();
  const items = CATALOG.filter((item) => {
    if (libraryState.category !== "All" && item.category !== libraryState.category) return false;
    if (!query) return true;
    return [item.name, item.category, ...(item.tags || [])].join(" ").toLowerCase().includes(query);
  });
  if (!items.length) {
    return `<div class="empty-inline" style="grid-column:1/-1">No pieces match “${escapeHtml(libraryState.query)}”.</div>`;
  }
  return items
    .map((item) => {
      const dims = `${formatCeiling(item.dims.w, project)} × ${formatCeiling(item.dims.d, project)}`;
      return `
        <button type="button" class="library-card" data-add-item="${item.id}" aria-label="Add ${escapeHtml(item.name)} to the selected room">
          <div class="library-art">${icon(item.icon, 28)}</div>
          <div class="library-card-body">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${dims}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function objectBody(project, room, object) {
  const mpu = project.scale?.metersPerUnit || 1;
  const placement = canPlaceObject(project, object);
  const catalog = CATALOG_BY_ID[object.type];
  const windowsExist = project.openings.some((o) => o.roomId === room.id && o.type === "window");
  const others = objectsInRoom(project, room.id).filter((o) => o.id !== object.id);
  const usableColors = [...FURNITURE_COLORS, { name: "Custom", color: object.color }];
  const colorActive = (hex) => hex.toLowerCase() === object.color.toLowerCase();

  return `
    <section class="insp-section">
      <div class="insp-label">Geometry</div>
      <div class="dim-grid">
        <div class="field">
          <label>Width</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(ceilingDisplayNumber(object.dims.w, project))}" data-object-dim="w" data-object-id="${object.id}" aria-label="Object width" />
            <span class="unit">${ceilingUnit(project)}</span>
          </div>
        </div>
        <div class="field">
          <label>Depth</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(ceilingDisplayNumber(object.dims.d, project))}" data-object-dim="d" data-object-id="${object.id}" aria-label="Object depth" />
            <span class="unit">${ceilingUnit(project)}</span>
          </div>
        </div>
        <div class="field">
          <label>Height</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(ceilingDisplayNumber(object.dims.h, project))}" data-object-dim="h" data-object-id="${object.id}" aria-label="Object height" />
            <span class="unit">${ceilingUnit(project)}</span>
          </div>
        </div>
        <div class="field">
          <label>Rotation</label>
          <div class="input-unit">
            <input class="input" type="number" step="1" value="${Math.round(((object.rotation * 180) / Math.PI + 360) % 360)}" data-object-rotation="${object.id}" aria-label="Object rotation in degrees" />
            <span class="unit">°</span>
          </div>
        </div>
        <div class="field">
          <label>Position X</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(displayLengthNumber(object.x, project))}" data-object-pos="x" data-object-id="${object.id}" aria-label="Object X position" />
            <span class="unit">${unitLabel(project)}</span>
          </div>
        </div>
        <div class="field">
          <label>Position Y</label>
          <div class="input-unit">
            <input class="input" type="number" step="0.01" value="${inputValue(displayLengthNumber(object.y, project))}" data-object-pos="y" data-object-id="${object.id}" aria-label="Object Y position" />
            <span class="unit">${unitLabel(project)}</span>
          </div>
        </div>
        ${
          object.placement !== "floor"
            ? `<div class="field">
                <label>Elevation</label>
                <div class="input-unit">
                  <input class="input" type="number" step="0.01" value="${inputValue(ceilingDisplayNumber(object.elevation, project))}" data-object-elevation="${object.id}" aria-label="Object elevation" />
                  <span class="unit">${ceilingUnit(project)}</span>
                </div>
              </div>`
            : ""
        }
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-sm" data-rotate-object="${object.id}" data-rotate-delta="-45">↺ 45°</button>
        <button type="button" class="btn btn-sm" data-rotate-object="${object.id}" data-rotate-delta="45">↻ 45°</button>
        <button type="button" class="btn btn-sm" data-face-window="${object.id}" ${windowsExist ? "" : "disabled"} title="Rotate to face the nearest window">${icon("window", 12)} Face window</button>
      </div>
      <p class="hint-text">${formatCeiling(object.dims.w, project)} × ${formatCeiling(object.dims.d, project)} × ${formatCeiling(object.dims.h, project)} · ${escapeHtml(catalog?.category || "item")}</p>
      <p class="hint-text">Drag this item in the 2D plan, or turn on <strong>Move</strong> in the 3D view.</p>
      ${
        !placement.ok && object.placement === "floor"
          ? `<div class="notice" data-tone="warn" style="margin-top:8px">${icon("warn", 15)}<div>${escapeHtml(describeCollision(project, placement))}</div></div>`
          : ""
      }
    </section>

    <section class="insp-section">
      <div class="insp-label">
        <span>Finish</span>
        <span class="section-sub">${escapeHtml(object.color)}</span>
      </div>
      <div class="swatches" style="margin-top:0">
        ${FURNITURE_COLORS.map(
          (entry) => `
          <button type="button" class="swatch-btn" style="background:${entry.color}"
            data-object-color="${object.id}" data-color="${entry.color}" data-name="${escapeHtml(entry.name)}"
            aria-label="Finish item in ${escapeHtml(entry.name)}" aria-pressed="${colorActive(entry.color)}" title="${escapeHtml(entry.name)}"></button>`
        ).join("")}
        <label class="swatch-custom" title="Custom item colour">
          <input type="color" value="${isColorHex(object.color) ? object.color : "#7c8674"}" data-custom-object="${object.id}" aria-label="Custom item colour" />
        </label>
      </div>
      <div class="texture-row">
        <span class="texture-label">Texture</span>
        <div class="texture-chips">
          ${OBJECT_TEXTURES.map(
            (entry) => `
            <button type="button" class="texture-chip" data-object-texture="${object.id}" data-texture="${entry.kind}"
              aria-pressed="${(object.texture || "smooth") === entry.kind}"
              title="${escapeHtml(entry.detail)}">${escapeHtml(entry.name)}</button>`
          ).join("")}
        </div>
      </div>
      ${
        catalog?.accent || object.accent
          ? `<div class="swatches" style="margin-top:8px">
              <span class="section-sub" style="width:100%">Secondary finish</span>
              ${FURNITURE_COLORS.slice(0, 8)
                .map(
                  (entry) => `
                  <button type="button" class="swatch-btn" style="background:${entry.color}"
                    data-object-accent="${object.id}" data-color="${entry.color}"
                    aria-label="Secondary finish ${escapeHtml(entry.name)}" aria-pressed="${(object.accent || "").toLowerCase() === entry.color.toLowerCase()}" title="${escapeHtml(entry.name)}"></button>`
                )
                .join("")}
              <label class="swatch-custom" title="Custom secondary finish">
                <input type="color" value="${isColorHex(object.accent) ? object.accent : "#5c6a54"}" data-custom-accent="${object.id}" aria-label="Custom secondary item colour" />
              </label>
            </div>`
          : ""
      }
    </section>

    <section class="insp-section">
      <div class="insp-label">Item actions</div>
      <div class="row-actions">
        <button type="button" class="btn" data-duplicate-object="${object.id}">${icon("copy", 13)} Duplicate</button>
        <button type="button" class="btn btn-danger" data-remove-object="${object.id}">${icon("trash", 13)} Remove</button>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-quiet" data-select-room="${room.id}">${icon("room", 13)} Back to ${escapeHtml(room.name)}</button>
      </div>
    </section>

    <section class="insp-section">
      <div class="insp-label">
        <span>Other items in ${escapeHtml(room.name)}</span>
        <span class="section-sub">${others.length}</span>
      </div>
      <div class="object-list">
        ${
          others.length
            ? others
                .map(
                  (other) => `
                  <button type="button" class="object-row" data-select-object="${other.id}">
                    <span class="object-thumb">${icon(CATALOG_BY_ID[other.type]?.icon || "decor", 13)}</span>
                    <span class="object-name"><strong>${escapeHtml(objectDisplayName(other))}</strong><span>${formatCeiling(other.dims.h, project)} high</span></span>
                    <span class="tag" data-tone="${other.placement === "wall" ? "info" : "ok"}">${other.placement === "wall" ? "Wall" : "Floor"}</span>
                  </button>`
                )
                .join("")
            : `<div class="empty-inline">No other items in this room.</div>`
        }
      </div>
    </section>

    <section class="insp-section">
      <div class="insp-label">
        <span>Add furniture</span>
        <span class="section-sub">To ${escapeHtml(room.name)}</span>
      </div>
      ${librarySection(project, room.id)}
    </section>
  `;
}

function onInspectorClick(event) {
  const el = event.target;

  const mobileUnit = el.closest("[data-mobile-unit]");
  if (mobileUnit) {
    store.setUnitSystem(mobileUnit.dataset.mobileUnit);
    return;
  }

  const surfaceTexture = el.closest("[data-surface-texture]");
  if (surfaceTexture) {
    const room = store.selectedRoom;
    if (room) {
      const surface = surfaceTexture.dataset.surfaceTexture;
      const current = room.materials[surface];
      setSurfaceMaterial(room.id, surface, { ...current, kind: surfaceTexture.dataset.texture });
    }
    return;
  }

  const objectTexture = el.closest("[data-object-texture]");
  if (objectTexture) {
    setObjectTexture(objectTexture.dataset.objectTexture, objectTexture.dataset.texture);
    return;
  }

  const material = el.closest("[data-surface]");
  if (material) {
    const room = store.selectedRoom;
    if (room) {
      setSurfaceMaterial(room.id, material.dataset.surface, {
        name: material.dataset.name,
        color: material.dataset.color,
        kind: material.dataset.kind,
      });
    }
    return;
  }

  const objectRow = el.closest("[data-select-object]");
  if (objectRow) {
    store.selectObject(objectRow.dataset.selectObject);
    return;
  }
  const selectRoomBtn = el.closest("[data-select-room]");
  if (selectRoomBtn) {
    store.selectRoom(selectRoomBtn.dataset.selectRoom);
    return;
  }
  const category = el.closest("[data-category]");
  if (category) {
    libraryState.category = category.dataset.category;
    const body = document.getElementById("inspectorBody");
    const grid = body?.querySelector("#libraryGrid");
    if (grid) grid.innerHTML = libraryCards(store.project);
    for (const chip of document.querySelectorAll("[data-category]")) {
      chip.setAttribute("aria-pressed", String(chip.dataset.category === libraryState.category));
    }
    return;
  }
  const add = el.closest("[data-add-item]");
  if (add) {
    const room = store.selectedRoom;
    if (!room) {
      toast("Select a room first", { detail: "Pick a room in the plan or room list.", tone: "error" });
      return;
    }
    const def = CATALOG_BY_ID[add.dataset.addItem];
    const result = addObject(add.dataset.addItem, room.id);
    if (result.error) {
      toast("Couldn't add that item", { detail: result.error, tone: "error" });
      return;
    }
    if (result.placed) {
      toast(`Added ${def.name.toLowerCase()}`, {
        detail: `Placed in ${room.name}. Drag it in the plan to fine-tune.`,
        tone: "success",
        actionLabel: "Undo",
        onAction: () => store.undo(),
      });
    } else {
      toast(`Added ${def.name.toLowerCase()} — adjust the placement`, {
        detail: "There wasn't a clear opening, so it landed near the room centre. Drag it or nudge it.",
        tone: "error",
        actionLabel: "Undo",
        onAction: () => store.undo(),
      });
    }
    return;
  }
  const rotateBtn = el.closest("[data-rotate-object]");
  if (rotateBtn) {
    const result = rotateObject(rotateBtn.dataset.rotateObject, (Number(rotateBtn.dataset.rotateDelta) * Math.PI) / 180);
    if (result.message) toast("Rotation applied with a warning", { detail: result.message, tone: "error" });
    return;
  }
  const face = el.closest("[data-face-window]");
  if (face) {
    if (!faceNearestWindow(face.dataset.faceWindow)) {
      toast("No window found", { detail: "This room has no window to face.", tone: "error" });
    }
    return;
  }
  const duplicate = el.closest("[data-duplicate-object]");
  if (duplicate) {
    const id = duplicateObject(duplicate.dataset.duplicateObject);
    if (id) {
      toast("Item duplicated", {
        detail: "A copy was placed nearby.",
        actionLabel: "Undo",
        onAction: () => store.undo(),
      });
    }
    return;
  }
  const remove = el.closest("[data-remove-object]");
  if (remove) {
    const object = store.project.objects.find((o) => o.id === remove.dataset.removeObject);
    const name = object ? objectDisplayName(object).toLowerCase() : "item";
    if (removeObject(remove.dataset.removeObject)) {
      toast(`Removed ${name}`, { actionLabel: "Undo", onAction: () => store.undo() });
    }
    return;
  }
  const objectColor = el.closest("[data-object-color]");
  if (objectColor) {
    setObjectColor(objectColor.dataset.objectColor, objectColor.dataset.color, "Paint item");
    return;
  }
  const accent = el.closest("[data-object-accent]");
  if (accent) {
    setObjectAccent(accent.dataset.objectAccent, accent.dataset.color);
  }
}

function onInspectorChange(event) {
  const el = event.target;
  const project = store.project;

  if (el.matches("[data-room-name]")) {
    const value = el.value.trim();
    if (value) updateRoomField(el.dataset.roomName, "name", value);
    else el.value = store.selectedRoom?.name || "";
    return;
  }

  if (el.matches("[data-room-dim]")) {
    const room = project.rooms.find((r) => r.id === el.dataset.roomId);
    if (!room) return;
    const wValue = el.dataset.roomDim === "w" ? el.value : displayLengthNumber(room.w, project);
    const hValue = el.dataset.roomDim === "h" ? el.value : displayLengthNumber(room.h, project);
    const result = setRoomDimsFromDisplay(room.id, wValue, hValue);
    if (!result.ok) {
      toast("That dimension isn't valid", { detail: result.message, tone: "error" });
      el.value = inputValue(displayLengthNumber(room[el.dataset.roomDim], project));
    } else if (result.warning) {
      toast("Room resized", { detail: result.warning, tone: "error" });
    }
    return;
  }

  if (el.matches("[data-room-ceiling]")) {
    const meters = parseCeiling(el.value, project);
    if (!meters || meters < 2.1 || meters > 5) {
      toast("Choose a ceiling height between 2.1 and 5 m", { tone: "error" });
      return;
    }
    updateRoomField(el.dataset.roomCeiling, "ceilingHeight", meters);
    return;
  }

  if (el.matches("[data-custom-surface]")) {
    const room = store.selectedRoom;
    const surface = el.dataset.customSurface;
    if (room && surface) {
      setSurfaceMaterial(room.id, surface, { name: "Custom colour", color: el.value, kind: room.materials[surface].kind });
    }
    return;
  }

  if (el.matches("[data-object-dim]")) {
    const object = project.objects.find((o) => o.id === el.dataset.objectId);
    if (!object) return;
    const value = parseCeiling(el.value, project);
    if (!value || value <= 0) {
      el.value = inputValue(ceilingDisplayNumber(object.dims[el.dataset.objectDim], project));
      return;
    }
    setObjectField(object.id, `dims.${el.dataset.objectDim}`, value, "Resize item");
    return;
  }

  if (el.matches("[data-object-rotation]")) {
    const deg = Number(el.value);
    if (!Number.isFinite(deg)) return;
    setObjectRotation(el.dataset.objectRotation, (deg * Math.PI) / 180);
    return;
  }

  if (el.matches("[data-object-pos]")) {
    const object = project.objects.find((o) => o.id === el.dataset.objectId);
    if (!object) return;
    const value = parseDisplayLength(el.value, project);
    if (value == null) return;
    const x = el.dataset.objectPos === "x" ? value : object.x;
    const y = el.dataset.objectPos === "y" ? value : object.y;
    const result = setObjectPosition(object.id, x, y, "Move item");
    if (!result.ok) toast("Move blocked", { detail: result.message, tone: "error" });
    return;
  }

  if (el.matches("[data-object-elevation]")) {
    const object = project.objects.find((o) => o.id === el.dataset.objectElevation);
    if (!object) return;
    const value = parseCeiling(el.value, project);
    if (value == null) return;
    setObjectField(object.id, "elevation", Math.max(0, Math.min(4, value)), "Change mounting height");
    return;
  }

  if (el.matches("[data-custom-object]")) {
    setObjectColor(el.dataset.customObject, el.value, "Paint item");
    return;
  }

  if (el.matches("[data-custom-accent]")) {
    setObjectAccent(el.dataset.customAccent, el.value);
  }
}

function onInspectorInput(event) {
  const el = event.target;
  if (el.id === "librarySearch") {
    libraryState.query = el.value;
    const grid = document.getElementById("inspectorBody")?.querySelector("#libraryGrid");
    if (grid) grid.innerHTML = libraryCards(store.project);
  }
}
