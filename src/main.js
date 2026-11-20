import "./styles.css";
import { store } from "./store.js";
import { mountTopbar, updateTopbar } from "./ui/topbar.js";
import { mountLeftRail, updateLeftRail } from "./ui/leftRail.js";
import { mountInspector, updateInspector } from "./ui/inspector.js";
import { mountComposer, updateComposer } from "./ui/composer.js";
import { mountStage } from "./three/scene.js";
import { refreshAIStatus } from "./ai/firebase.js";
import { saveProjectFile } from "./actions/persistence.js";
import { toast } from "./ui/toast.js";

function sync(state, reason) {
  updateTopbar(state);
  updateLeftRail(state, reason);
  updateInspector(state, reason);
  updateComposer(state, reason);
  const workspace = document.getElementById("workspace");
  if (workspace) workspace.dataset.view = state.mobileView;
  document.title = `${state.project.name} — Planwalk`;
}

function isTyping() {
  const tag = document.activeElement?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;
}

function boot() {
  mountTopbar();
  mountLeftRail();
  mountStage(document.getElementById("stage"));
  mountInspector();
  mountComposer();

  sync(store.state, "init");
  store.subscribe((state, reason) => {
    sync(state, reason);
    if (reason === "save" && state.saveStatus === "error") {
      toast("Draft couldn't be saved locally", {
        detail: state.saveError,
        tone: "error",
      });
    }
  });

  refreshAIStatus().catch((error) => {
    console.warn("[planwalk] AI status check failed", error);
  });

  if (store.state.restoredDraft) {
    toast("Local draft restored", {
      detail: store.state.saveNote || "Continue where you left off, or use Sample to start fresh.",
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Preview cards close on Escape when no dialog is open.
      if (!document.querySelector(".modal-backdrop") && store.state.preview) {
        store.clearPreview();
      }
      return;
    }
    if (isTyping()) return;
    if (document.querySelector(".modal-backdrop")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      const label = event.shiftKey ? store.redo() : store.undo();
      if (label) {
        toast(event.shiftKey ? "Redone" : "Undone", { detail: label });
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProjectFile();
    }
  });

  // Keep pointer interactions calm on touch devices.
  window.addEventListener("contextmenu", (event) => {
    if (event.target.closest("#stage canvas")) event.preventDefault();
  });

  window.__PLANWALK_BOOTED__ = true;
  document.getElementById("bootStatus")?.remove();
}

boot();
