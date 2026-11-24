import { store } from "../store.js";
import { projectArea, roomArea } from "../model/project.js";
import { formatArea, isCalibrated, measurementLabel } from "../model/units.js";
import { icon } from "./icons.js";
import { mountPlan2D } from "./plan2d.js";
import { openUploadWizard } from "./upload.js";
import { openCalibrationModal } from "./calibrate.js";
import { triggerOpenProject, saveProjectFile } from "../actions/persistence.js";
import { toast } from "./toast.js";

function saveLabel(state) {
  if (state.saveStatus === "draft") return "Draft saved";
  if (state.saveStatus === "exported") return "File saved";
  if (state.saveStatus === "dirty") return "Unsaved";
  if (state.saveStatus === "error") return "Draft error";
  return "Local draft";
}

export function mountLeftRail() {
  const el = document.getElementById("leftRail");
  el.innerHTML = `
    <div class="rail-section">
      <div class="section-head">
        <span class="section-title">Project</span>
        <span class="section-sub" id="railSave">Local draft</span>
      </div>
      <div class="rail-project-name" id="railProjectName">—</div>
      <div class="plan-meta">
        <span id="railSummary">—</span>
        <span id="railSource">—</span>
      </div>
    </div>

    <div class="rail-section">
      <div class="section-head">
        <span class="section-title">Floor plan</span>
        <span class="section-sub" id="railPlanKind">—</span>
      </div>
      <div class="plan-frame">
        <div class="plan-canvas-wrap">
          <canvas class="plan-canvas" id="planCanvas" tabindex="0" aria-label="2D floor plan. Select a room, or drag a furniture item."></canvas>
          <div class="plan-tools">
            <button type="button" class="icon-btn" id="planEye" aria-label="Hide plan reference" title="Show or hide plan reference">${icon("eye", 14)}</button>
            <button type="button" class="icon-btn" id="planCalibrate" aria-label="Calibrate plan scale" title="Calibrate scale">${icon("ruler", 14)}</button>
          </div>
          <div class="plan-badge" id="planBadge">${icon("check", 10)} Calibrated</div>
        </div>
      </div>
      <div class="plan-meta">
        <span id="planFileName">—</span>
        <span id="planRoomCount">—</span>
      </div>
      <div class="file-actions">
        <button type="button" class="btn btn-primary" id="uploadPlanBtn">${icon("upload", 14)} Upload plan</button>
        <button type="button" class="btn" id="sampleBtn">${icon("plan", 14)} Sample</button>
      </div>
      <div class="plan-meta" style="margin-top:7px">
        <button type="button" class="btn btn-quiet btn-sm" id="openProjectBtn">${icon("folder", 13)} Open project</button>
        <button type="button" class="btn btn-quiet btn-sm" id="saveRailBtn">${icon("save", 13)} Save file</button>
      </div>
    </div>

    <div class="rail-section">
      <div class="section-head">
        <h2 class="section-title">Rooms</h2>
        <span class="section-sub" id="roomCount">—</span>
      </div>
      <div class="room-list" id="roomList" role="list"></div>
      <div id="scaleNotice"></div>
    </div>

    <div class="rail-footnote">
      ${icon("info", 13)}
      <span>Room dimensions follow the plan scale. Uncalibrated plans are shown in plan units and labelled as estimates.</span>
    </div>
  `;

  mountPlan2D(el.querySelector("#planCanvas"));

  el.querySelector("#uploadPlanBtn").addEventListener("click", () => openUploadWizard());
  el.querySelector("#sampleBtn").addEventListener("click", () => {
    store.startSample();
    toast("Sample apartment opened", { detail: "Marlow apartment · 6 rooms · drawn to scale", tone: "success" });
  });
  el.querySelector("#openProjectBtn").addEventListener("click", () => triggerOpenProject());
  el.querySelector("#saveRailBtn").addEventListener("click", () => saveProjectFile());
  el.querySelector("#planCalibrate").addEventListener("click", () => openCalibrationModal());
  el.querySelector("#planEye").addEventListener("click", () => {
    store.setPlanVisible(store.project.plan?.visible === false);
  });
  el.querySelector("#roomList").addEventListener("click", (event) => {
    const row = event.target.closest("[data-room-id]");
    if (row) store.selectRoom(row.dataset.roomId);
  });
  el.querySelector("#scaleNotice").addEventListener("click", (event) => {
    if (event.target.closest("[data-calibrate]")) openCalibrationModal();
  });

  updateLeftRail(store.state, "init");
}

export function updateLeftRail(state, reason = "change") {
  const el = document.getElementById("leftRail");
  if (!el) return;
  const project = state.project;

  el.querySelector("#railSave").textContent = saveLabel(state);
  el.querySelector("#railProjectName").textContent = project.name;
  el.querySelector("#railSummary").textContent = `${project.rooms.length} rooms · ${formatArea(projectArea(project), project)}`;
  el.querySelector("#railSource").textContent =
    project.meta?.source === "sample"
      ? "Sample"
      : project.meta?.source === "upload"
        ? "Uploaded"
        : project.meta?.source === "import"
          ? "Imported"
          : "Project";

  const calibrated = isCalibrated(project);
  const badge = el.querySelector("#planBadge");
  badge.classList.toggle("is-warn", !calibrated);
  badge.innerHTML = `${icon(calibrated ? "check" : "warn", 10)} ${calibrated ? "Calibrated" : "Scale unconfirmed"}`;
  el.querySelector("#railPlanKind").textContent = calibrated ? "Scaled plan" : "Uncalibrated";
  el.querySelector("#planFileName").textContent = project.plan?.name || "Floor plan";
  el.querySelector("#planRoomCount").textContent = `${project.rooms.length} rooms`;

  const eye = el.querySelector("#planEye");
  const visible = project.plan?.visible !== false;
  eye.innerHTML = icon(visible ? "eye" : "eyeOff", 14);
  eye.setAttribute("aria-label", visible ? "Hide plan reference" : "Show plan reference");
  eye.setAttribute("aria-pressed", String(visible));

  el.querySelector("#roomCount").textContent = String(project.rooms.length);
  const list = el.querySelector("#roomList");
  const scaleSignature = `${project.scale?.calibrated ? "1" : "0"}:${project.scale?.metersPerUnit ?? ""}`;
  const roomSignature = `${project.id}|${scaleSignature}|${project.rooms.map((r) => `${r.id}:${r.name}:${r.w}:${r.h}:${r.measurement}`).join("|")}|${state.selection.kind}:${state.selection.id}|${project.unitSystem}`;
  if (list.dataset.signature !== roomSignature) {
    list.dataset.signature = roomSignature;
    list.innerHTML = project.rooms
      .map((room) => {
        const selected = selectedRoomId(state) === room.id;
        return `
          <button type="button" class="room-row" role="listitem" data-room-id="${room.id}" aria-current="${selected}" aria-label="${escapeText(room.name)}, ${formatArea(roomArea(room), project)}, ${measurementLabel(room.measurement)}">
            <span class="room-icon">${icon("room", 13)}</span>
            <span class="room-name">${escapeText(room.name)}<span class="dot ${room.measurement}" title="${measurementLabel(room.measurement)}" aria-hidden="true"></span></span>
            <span class="room-area">${formatArea(roomArea(room), project)}</span>
          </button>
        `;
      })
      .join("");
  }

  const notice = el.querySelector("#scaleNotice");
  if (!calibrated) {
    notice.innerHTML = `
      <div class="measure-summary" data-tone="warn" style="margin-top:10px">
        ${icon("warn", 14)}
        <span>Scale isn't confirmed. Dimensions are estimates in plan units.</span>
        <button type="button" class="btn btn-sm" data-calibrate>Calibrate</button>
      </div>
    `;
  } else {
    notice.innerHTML = "";
  }
}

function selectedRoomId(state) {
  if (state.selection.kind === "room") return state.selection.id;
  const object = state.project.objects.find((o) => o.id === state.selection.id);
  return object?.roomId || null;
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
