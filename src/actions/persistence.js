import { store } from "../store.js";
import { normalizeProject } from "../model/project.js";
import { downloadFile, readFileAsText, slugify } from "../util.js";
import { toast } from "../ui/toast.js";

export function projectFileName(project) {
  return `${slugify(project?.name || "planwalk-project")}.planwalk.json`;
}

export function buildProjectFile(project) {
  return JSON.stringify(
    {
      app: "planwalk",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      project,
    },
    null,
    2
  );
}

export function saveProjectFile({ quiet = false } = {}) {
  try {
    const project = store.project;
    downloadFile(projectFileName(project), buildProjectFile(project));
    store.markExported();
    if (!quiet) {
      toast("Project file saved", {
        detail: "Downloaded as JSON. The local draft remains on this device.",
        tone: "success",
      });
    }
    return true;
  } catch (error) {
    console.error("[planwalk] project export failed", error);
    toast("Could not save the project file", { detail: "Try again or copy the draft from this browser.", tone: "error" });
    return false;
  }
}

export function triggerOpenProject() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.planwalk.json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const project = parsed?.project || parsed;
      const normalized = normalizeProject(project);
      store.replaceProject(normalized, { source: "import" });
      toast("Project opened", { detail: normalized.name, tone: "success" });
    } catch (error) {
      console.error("[planwalk] import failed", error);
      toast("That file isn't a valid Planwalk project", {
        detail: error.message || "Choose a .planwalk.json file exported from Planwalk.",
        tone: "error",
      });
    } finally {
      input.remove();
    }
  });
  // Chrome fires "cancel" when the file picker is dismissed without a file.
  input.addEventListener("cancel", () => input.remove());
  document.body.appendChild(input);
  input.click();
}
