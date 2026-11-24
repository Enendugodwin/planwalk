import { store } from "../store.js";
import { saveProjectFile } from "../actions/persistence.js";
import { openAISettings } from "./aiPanel.js";
import { icon } from "./icons.js";
import { toast } from "./toast.js";

function saveStatusView(state) {
  if (state.saveStatus === "error") {
    return { state: "error", icon: "warn", text: "Draft not saved", title: state.saveError };
  }
  if (state.saveStatus === "draft") {
    return {
      state: "saved",
      icon: "checkCircle",
      text: "Draft saved locally",
      title: state.saveNote || "Kept in this browser. Use Save project to download a copy.",
    };
  }
  if (state.saveStatus === "exported") {
    return { state: "saved", icon: "save", text: "Project file saved", title: "Exported project JSON." };
  }
  if (state.saveStatus === "dirty") {
    return { state: "dirty", icon: "info", text: "Unsaved edits", title: "A local draft will save in a moment." };
  }
  return {
    state: "dirty",
    icon: "info",
    text: "Sample · local draft",
    title: "This sample is editable. Save project to download a copy.",
  };
}

export function mountTopbar() {
  const el = document.getElementById("topbar");
  el.innerHTML = `
    <div class="brand">
      <div class="brand-mark">${icon("logo", 20)}</div>
      <div class="brand-word">Planwalk</div>
      <div class="brand-tag">floor plans, made walkable</div>
    </div>
    <div class="mobile-tabs" role="group" aria-label="Workspace panel">
      <button type="button" data-mobile-view="plan" aria-pressed="false" aria-label="Plan">${icon("plan", 13)}<span>Plan</span></button>
      <button type="button" data-mobile-view="3d" aria-pressed="true" aria-label="3D model">${icon("cube", 13)}<span>3D</span></button>
      <button type="button" data-mobile-view="details" aria-pressed="false" aria-label="Details">${icon("settings", 13)}<span>Details</span></button>
    </div>
    <div class="topbar-center">
      <input id="projectTitle" class="project-title" type="text" maxlength="80" aria-label="Project name" />
      <span id="saveStatus" class="save-status" data-state="new" role="status" aria-live="polite"></span>
    </div>
    <div class="topbar-actions">
      <button type="button" class="icon-btn" id="undoBtn" aria-label="Undo" title="Undo (Ctrl+Z)">${icon("undo", 15)}</button>
      <button type="button" class="icon-btn" id="redoBtn" aria-label="Redo" title="Redo (Shift+Ctrl+Z)">${icon("redo", 15)}</button>
      <span class="topbar-divider" aria-hidden="true"></span>
      <div class="unit-toggle segmented" role="group" aria-label="Unit system">
        <button type="button" data-unit="metric" aria-pressed="true">m</button>
        <button type="button" data-unit="imperial" aria-pressed="false">ft</button>
      </div>
      <span class="topbar-divider" aria-hidden="true"></span>
      <button type="button" class="ai-chip" id="aiChip" data-state="setup" aria-haspopup="dialog" aria-label="AI settings: not configured" title="Firebase AI Logic settings">
        <span class="ai-dot"></span><span class="ai-label">AI setup</span>
      </button>
      <button type="button" class="btn btn-primary" id="saveProjectBtn" aria-label="Save project" title="Download the project as JSON">
        ${icon("save", 14)}<span class="btn-label">Save</span>
      </button>
    </div>
  `;

  const titleInput = el.querySelector("#projectTitle");
  const saveStatus = el.querySelector("#saveStatus");
  const undoBtn = el.querySelector("#undoBtn");
  const redoBtn = el.querySelector("#redoBtn");
  const aiChip = el.querySelector("#aiChip");
  const saveBtn = el.querySelector("#saveProjectBtn");

  titleInput.value = store.project.name;
  titleInput.title = "Rename project";

  titleInput.addEventListener("change", () => {
    const value = titleInput.value.trim();
    if (!value) {
      titleInput.value = store.project.name;
      return;
    }
    store.renameProject(value);
  });
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleInput.blur();
    }
  });

  undoBtn.addEventListener("click", () => {
    const label = store.undo();
    if (label) toast("Undone", { detail: label, actionLabel: "Redo", onAction: () => store.redo() });
  });
  redoBtn.addEventListener("click", () => {
    const label = store.redo();
    if (label) toast("Redone", { detail: label, actionLabel: "Undo", onAction: () => store.undo() });
  });

  el.querySelector(".unit-toggle").addEventListener("click", (event) => {
    const button = event.target.closest("[data-unit]");
    if (!button) return;
    store.setUnitSystem(button.dataset.unit);
  });

  el.querySelector(".mobile-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-view]");
    if (button) store.setMobileView(button.dataset.mobileView);
  });

  aiChip.addEventListener("click", () => openAISettings());
  saveBtn.addEventListener("click", () => saveProjectFile());

  updateTopbar(store.state);
}

export function updateTopbar(state) {
  const el = document.getElementById("topbar");
  if (!el) return;
  const titleInput = el.querySelector("#projectTitle");
  if (titleInput && document.activeElement !== titleInput && titleInput.value !== state.project.name) {
    titleInput.value = state.project.name;
  }

  const status = saveStatusView(state);
  const saveStatus = el.querySelector("#saveStatus");
  if (saveStatus) {
    saveStatus.dataset.state = status.state;
    saveStatus.innerHTML = `${icon(status.icon, 12)}<span>${status.text}</span>`;
    saveStatus.title = status.title || "";
  }

  const undoBtn = el.querySelector("#undoBtn");
  const redoBtn = el.querySelector("#redoBtn");
  if (undoBtn) undoBtn.disabled = !store.canUndo;
  if (redoBtn) redoBtn.disabled = !store.canRedo;

  for (const button of el.querySelectorAll("[data-unit]")) {
    button.setAttribute("aria-pressed", String(button.dataset.unit === state.project.unitSystem));
  }
  for (const button of el.querySelectorAll("[data-mobile-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mobileView === state.mobileView));
  }

  const chip = el.querySelector("#aiChip");
  if (chip) {
    const ai = state.ai;
    let chipState = "setup";
    let label = "AI setup";
    if (ai.busy) {
      chipState = "busy";
      label = "Interpreting…";
    } else if (ai.preparing) {
      chipState = "busy";
      label = ai.progress != null ? `Preparing ${Math.round(ai.progress * 100)}%` : "Preparing AI";
    } else if (ai.configured) {
      chipState = "ready";
      label = ai.lastSource === "ON_DEVICE" ? "AI · on-device" : ai.lastSource === "IN_CLOUD" ? "AI · cloud" : "Hybrid AI";
    }
    chip.dataset.state = chipState;
    const labelEl = chip.querySelector(".ai-label");
    if (labelEl) labelEl.textContent = label;
    chip.setAttribute("aria-label", `AI settings: ${label}`);
    chip.title = ai.configured
      ? "Firebase AI Logic · hybrid inference. Open settings."
      : "Connect Firebase AI Logic. Manual editing works without it.";
  }
}
