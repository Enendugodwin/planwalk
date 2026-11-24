import { createSampleProject } from "./data/sample.js";
import { findObject, findRoom, normalizeProject, touchProject } from "./model/project.js";
import { deepClone } from "./util.js";

const DRAFT_KEY = "planwalk.draft.v1";
const HISTORY_LIMIT = 40;

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.project) return null;
    return parsed;
  } catch {
    return null;
  }
}

class Store {
  constructor() {
    this.listeners = new Set();
    this.past = [];
    this.future = [];
    this.transient = null;
    this._saveTimer = null;

    const draft = readDraft();
    let project;
    let saveStatus = "new";
    let restoredDraft = false;
    let saveNote = "";

    if (draft) {
      try {
        project = normalizeProject(draft.project);
        restoredDraft = true;
        saveStatus = "draft";
        if (draft.project?.plan?.srcOmitted) {
          saveNote = "Draft restored without its plan image (too large to store).";
        }
      } catch {
        project = normalizeProject(createSampleProject());
      }
    } else {
      project = normalizeProject(createSampleProject());
    }

    this.state = {
      project,
      selection: { kind: "room", id: project.rooms[0]?.id || null },
      viewMode: "orbit",
      mobileView: "3d",
      saveStatus,
      saveNote,
      saveError: "",
      restoredDraft,
      exportedAt: null,
      preview: null,
      ai: {
        configured: false,
        consent: false,
        planConsentSession: false,
        busy: false,
        preparing: false,
        progress: null,
        lastSource: null,
        lastAction: null,
        lastError: "",
        config: null,
        cloudModel: null,
        deviceSupport: null,
      },
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason = "change") {
    for (const listener of this.listeners) {
      try {
        listener(this.state, reason);
      } catch (error) {
        console.error("[planwalk] listener failed", error);
      }
    }
  }

  // Getters ---------------------------------------------------------
  get project() {
    return this.state.project;
  }

  get selectedRoom() {
    const { selection, project } = this.state;
    if (selection.kind === "room") return findRoom(project, selection.id);
    if (selection.kind === "object") {
      const object = findObject(project, selection.id);
      return object ? findRoom(project, object.roomId) : null;
    }
    return null;
  }

  get selectedObject() {
    return this.state.selection.kind === "object"
      ? findObject(this.state.project, this.state.selection.id)
      : null;
  }

  get selectedRoomId() {
    if (this.state.selection.kind === "room") return this.state.selection.id;
    return this.selectedObject?.roomId || null;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  _snapshot(project = this.state.project) {
    // Plan images never change during history-tracked edits; excluding them
    // keeps undo snapshots small. Stringify directly instead of cloning the
    // whole project first so large plan data URLs are not copied per edit.
    return JSON.stringify(project, (key, value) => (key === "src" ? undefined : value));
  }

  _restore(snapshot) {
    const parsed = JSON.parse(snapshot);
    if (parsed.plan) parsed.plan.src = this.state.project.plan?.src || null;
    this.state.project = normalizeProject(parsed);
    this._ensureSelection();
  }

  _ensureSelection() {
    const { selection, project } = this.state;
    const valid =
      (selection.kind === "room" && findRoom(project, selection.id)) ||
      (selection.kind === "object" && findObject(project, selection.id));
    if (!valid) {
      this.state.selection = { kind: "room", id: project.rooms[0]?.id || null };
    }
  }

  _pushHistory(label) {
    this.past.push({ label: label || "Edit", snapshot: this._snapshot() });
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future.length = 0;
  }

  // Mutations -------------------------------------------------------
  commit(label, mutator, opts = {}) {
    const history = opts.history !== false;
    const before = history ? this._snapshot() : null;
    const draft = deepClone(this.state.project);
    const result = mutator(draft);
    const next = result && typeof result === "object" ? result : draft;
    // Compare before touching meta.updatedAt so a no-op edit (for example an
    // AI proposal whose target disappeared) does not create an undo step.
    const changed = history && this._snapshot(next) !== before;
    touchProject(next);
    if (changed) {
      this.past.push({ label: label || "Edit", snapshot: before });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future.length = 0;
    }
    this.state.project = next;
    this._ensureSelection();
    this._scheduleSave();
    this.emit("project");
    return next;
  }

  replaceProject(project, { source = "new", resetHistory = true } = {}) {
    const normalized = normalizeProject(project);
    normalized.meta = { ...(normalized.meta || {}), source };
    this.state.project = normalized;
    this.state.selection = { kind: "room", id: normalized.rooms[0]?.id || null };
    this.state.preview = null;
    this.state.mobileView = "3d";
    this.state.saveStatus = source === "sample" ? "new" : "dirty";
    this.state.saveNote = "";
    this.state.saveError = "";
    this.state.exportedAt = null;
    if (resetHistory) {
      this.past = [];
      this.future = [];
    }
    this._ensureSelection();
    this._scheduleSave();
    this.emit("project-reset");
  }

  startSample() {
    this.replaceProject(createSampleProject(), { source: "sample" });
  }

  renameProject(name) {
    this.state.project = { ...this.state.project, name: String(name || "Untitled project") };
    this._scheduleSave();
    this.emit("project-meta");
  }

  setUnitSystem(unitSystem) {
    this.state.project = {
      ...this.state.project,
      unitSystem: unitSystem === "imperial" ? "imperial" : "metric",
    };
    this._scheduleSave();
    this.emit("project-meta");
  }

  setSelection(kind, id) {
    this.state.selection = { kind, id };
    this.emit("selection");
  }

  selectRoom(id) {
    if (!id) return;
    this.setSelection("room", id);
  }

  selectObject(id) {
    if (!id) return;
    this.setSelection("object", id);
  }

  clearSelection() {
    this.state.selection = { kind: "room", id: this.state.project.rooms[0]?.id || null };
    this.emit("selection");
  }

  setViewMode(mode) {
    const next = ["orbit", "walk", "top"].includes(mode) ? mode : "orbit";
    if (this.state.viewMode === next) return;
    this.state.viewMode = next;
    this.emit("view");
  }

  setMobileView(view) {
    this.state.mobileView = ["plan", "3d", "details"].includes(view) ? view : "3d";
    this.emit("mobile");
  }

  setPlanVisible(visible) {
    this.state.project = {
      ...this.state.project,
      plan: { ...this.state.project.plan, visible: Boolean(visible) },
    };
    this._scheduleSave();
    this.emit("project-meta");
  }

  // Transient (drag) edits -----------------------------------------
  beginTransient(label) {
    this.transient = { label, snapshot: this._snapshot(), changed: false };
  }

  updateTransient(mutator) {
    if (!this.transient) return;
    mutator(this.state.project);
    touchProject(this.state.project);
    this.transient.changed = true;
    this.emit("live");
  }

  endTransient({ commit = true } = {}) {
    if (!this.transient) return;
    const { label, snapshot, changed } = this.transient;
    this.transient = null;
    if (commit && changed) {
      this.past.push({ label, snapshot });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future.length = 0;
      this._scheduleSave();
    }
    this._ensureSelection();
    this.emit("project");
  }

  // History ---------------------------------------------------------
  undo() {
    if (!this.past.length) return false;
    const entry = this.past.pop();
    this.future.push({ label: entry.label, snapshot: this._snapshot() });
    this._restore(entry.snapshot);
    this._scheduleSave();
    this.emit("history");
    return entry.label;
  }

  redo() {
    if (!this.future.length) return false;
    const entry = this.future.pop();
    this.past.push({ label: entry.label, snapshot: this._snapshot() });
    this._restore(entry.snapshot);
    this._scheduleSave();
    this.emit("history");
    return entry.label;
  }

  clearHistory() {
    this.past = [];
    this.future = [];
    this.emit("history");
  }

  // Preview (prompt edit plan) -------------------------------------
  setPreview(preview) {
    this.state.preview = preview;
    this.emit("preview");
  }

  clearPreview() {
    if (!this.state.preview) return;
    this.state.preview = null;
    this.emit("preview");
  }

  // AI state --------------------------------------------------------
  setAI(patch) {
    this.state.ai = { ...this.state.ai, ...patch };
    this.emit("ai");
  }

  // Save / export ---------------------------------------------------
  _scheduleSave() {
    this.state.saveStatus = "dirty";
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveDraft(), 700);
    this.emit("save");
  }

  _saveDraft() {
    try {
      const project = this.state.project;
      let payload = { v: 1, savedAt: Date.now(), project };
      let json = JSON.stringify(payload);
      let omitted = false;
      if (json.length > 4_200_000 && project.plan?.src) {
        payload = {
          ...payload,
          project: {
            ...project,
            plan: { ...project.plan, src: null, srcOmitted: true },
          },
        };
        json = JSON.stringify(payload);
        omitted = true;
      }
      localStorage.setItem(DRAFT_KEY, json);
      this.state.saveStatus = "draft";
      this.state.saveError = "";
      this.state.saveNote = omitted
        ? "Draft saved without the plan image — export the project to keep it."
        : "";
    } catch (error) {
      this.state.saveStatus = "error";
      this.state.saveError = "Draft could not be saved on this device. Use Save project to download a copy.";
      console.warn("[planwalk] draft save failed", error);
    }
    this.emit("save");
  }

  markExported() {
    // Flush any pending draft first, otherwise its timer would fire shortly
    // after the export and overwrite the "file saved" status.
    clearTimeout(this._saveTimer);
    this._saveDraft();
    if (this.state.saveStatus !== "error") {
      this.state.saveStatus = "exported";
      this.state.exportedAt = new Date().toISOString();
      this.state.saveError = "";
      this.emit("save");
    }
  }

  markDirtyNoSave() {
    this.state.saveStatus = "dirty";
    this._scheduleSave();
    this.emit("save");
  }
}

export const store = new Store();
