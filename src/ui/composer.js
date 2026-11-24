import { store } from "../store.js";
import { interpretPromptRules, promptExamples } from "../ai/rules.js";
import { inferenceSourceLabel, interpretPromptAI } from "../ai/design.js";
import { applyEditPlan } from "../actions/design.js";
import { humanizeAIError } from "../ai/firebase.js";
import { escapeHtml } from "../util.js";
import { icon } from "./icons.js";
import { openAISettings, openConsentModal } from "./aiPanel.js";
import { toast } from "./toast.js";

let busy = false;
let currentText = "";
let preview = null;
let requestToken = 0;

const EDIT_ICONS = {
  "room-material": "room",
  "add-object": "plus",
  "object-color": "sparkle",
  "object-accent": "settings",
  "rotate-object": "rotate",
  "remove-object": "trash",
  "move-object": "move",
  "set-ceiling-height": "layers",
};

export function mountComposer() {
  const el = document.getElementById("composer");
  el.innerHTML = `
    <div class="composer-inner">
      <div id="promptPreview"></div>
      <div class="composer-card">
        <div class="chip-row" id="promptChips"></div>
        <div class="composer-input-row">
          <span class="composer-spark" aria-hidden="true">${icon("sparkle", 16)}</span>
          <textarea id="promptInput" class="composer-input" rows="1" placeholder="Describe a change — e.g. Make the living room walls warm white…" aria-label="Describe a design change"></textarea>
          <button type="button" class="send-btn" id="sendPrompt" aria-label="Send design request" title="Send (Enter)">
            ${icon("arrowRight", 15)}
          </button>
        </div>
        <div class="composer-foot">
          <span class="left">${icon("info", 11)} Edits preview before applying · manual editing always available</span>
          <span class="right" id="composerAIStatus"></span>
        </div>
      </div>
    </div>
  `;

  const input = el.querySelector("#promptInput");
  const send = el.querySelector("#sendPrompt");

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(96, input.scrollHeight)}px`;
    send.disabled = !input.value.trim() || busy;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  });
  send.addEventListener("click", () => submitPrompt());

  renderChips();
  send.disabled = true;
  updateComposer(store.state, "init");
}

export function updateComposer(state, reason = "change") {
  const el = document.getElementById("composer");
  if (!el) return;
  const status = el.querySelector("#composerAIStatus");
  if (status) {
    if (state.ai.busy) {
      status.textContent = state.ai.preparing
        ? state.ai.progress != null
          ? `Preparing on-device model · ${Math.round(state.ai.progress * 100)}%`
          : "Preparing on-device model…"
        : "Interpreting request…";
    } else if (state.ai.configured) {
      status.textContent =
        state.ai.lastSource === "ON_DEVICE"
          ? "Last AI request ran on this device"
          : state.ai.lastSource === "IN_CLOUD"
            ? "Last AI request used cloud fallback"
            : "Hybrid AI ready · on-device preferred";
    } else {
      status.textContent = "AI not configured · rule-based edits only";
    }
  }
  if (reason === "project-reset") {
    preview = null;
    renderChips();
    renderPreview();
  }
  // A proposal is only valid for the scene it was built against. Any manual
  // edit or undo invalidates it instead of leaving stale IDs in the preview.
  if ((reason === "project" || reason === "history") && preview) {
    const stale = preview;
    preview = null;
    renderPreview();
    queueMicrotask(() => {
      if (store.state.preview === stale) store.clearPreview();
    });
  }
  if (reason === "preview") {
    preview = state.preview;
    renderPreview();
  }
  if (reason === "ai" && preview?.thinking) {
    renderPreview();
  }
}

function renderChips() {
  const el = document.getElementById("promptChips");
  if (!el) return;
  el.innerHTML = promptExamples(store.project)
    .map(
      (chip) =>
        `<button type="button" class="prompt-chip" data-prompt-chip="${escapeHtml(chip.text)}">${icon("sparkle", 9)} ${escapeHtml(chip.label)}</button>`
    )
    .join("");
  el.onclick = (event) => {
    const chip = event.target.closest("[data-prompt-chip]");
    if (!chip) return;
    const input = document.getElementById("promptInput");
    input.value = chip.dataset.promptChip;
    input.dispatchEvent(new Event("input"));
    submitPrompt(chip.dataset.promptChip);
  };
}

function setBusy(value) {
  busy = value;
  const send = document.getElementById("sendPrompt");
  const input = document.getElementById("promptInput");
  if (send) send.disabled = value || !input?.value.trim();
  if (input) input.setAttribute("aria-busy", String(value));
}

async function submitPrompt(textOverride = null, forcedRoomId = null) {
  if (busy) return;
  const input = document.getElementById("promptInput");
  const text = String(textOverride ?? input?.value ?? "").trim();
  if (!text) return;
  currentText = text;
  if (input && textOverride) {
    input.value = text;
    input.dispatchEvent(new Event("input"));
  }

  const rules = interpretPromptRules(text, store.project, store.state.selection, { forcedRoomId });
  if (rules.edits.length || rules.clarification) {
    showPreview(rules);
    return;
  }

  if (store.state.ai.configured) {
    const consent = store.state.ai.consent ? true : await openConsentModal("design");
    if (!consent) {
      showPreview({
        ...rules,
        showSetup: false,
        explanation: `${rules.explanation} The AI request was cancelled, so nothing changed.`,
      });
      return;
    }
    await runAI(text);
    return;
  }

  showPreview({ ...rules, showSetup: true });
}

async function runAI(text) {
  const token = ++requestToken;
  setBusy(true);
  store.setAI({ busy: true, lastError: "" });
  showThinking(text);
  try {
    const result = await interpretPromptAI(text, store.project, store.state.selection);
    if (token !== requestToken) return;
    showPreview(result);
  } catch (error) {
    if (token !== requestToken) return;
    console.error("[planwalk] design AI failed", error);
    store.setAI({ lastError: error.message || String(error) });
    showPreview({
      source: "ui",
      inferenceSource: null,
      confidence: 0,
      summary: "AI couldn't complete that request",
      explanation: error.userMessage || humanizeAIError(error),
      edits: [],
      clarification: null,
      originalText: text,
      noMatch: true,
      aiError: true,
      aiErrorDetail: "Your scene is unchanged. Manual editing is still available.",
    });
    toast("AI couldn't complete that request", {
      detail: error.userMessage || humanizeAIError(error),
      tone: "error",
    });
  } finally {
    if (token === requestToken) {
      store.setAI({ busy: false, preparing: false, progress: null });
      setBusy(false);
    }
  }
}

function showThinking(text) {
  preview = {
    thinking: true,
    originalText: text,
    summary: "Interpreting the request",
    explanation: "Checking the target, then building a reversible edit plan. On-device inference is preferred.",
  };
  store.setPreview(preview);
  renderPreview();
}

function showPreview(next) {
  preview = next;
  store.setPreview(next);
  setBusy(false);
  renderPreview();
}

function sourceNote(p) {
  if (p.source === "ai") {
    const source = inferenceSourceLabel(p.inferenceSource);
    const iconName = p.inferenceSource === "IN_CLOUD" ? "cloud" : p.inferenceSource === "ON_DEVICE" ? "device" : "sparkle";
    return `${icon(iconName, 11)} ${escapeHtml(source)} · preview only`;
  }
  if (p.source === "rules") return `${icon("settings", 11)} Rule-based · no model used`;
  return `${icon("info", 11)} No change proposed`;
}

function editIcon(edit) {
  return EDIT_ICONS[edit.type] || "sparkle";
}

function renderPreview() {
  const el = document.getElementById("promptPreview");
  if (!el) return;
  if (!preview) {
    el.innerHTML = "";
    return;
  }
  if (preview.thinking) {
    const preparing = store.state.ai.preparing;
    const pct = store.state.ai.progress;
    el.innerHTML = `
      <div class="prompt-preview">
        <div class="prompt-preview-head">
          <span class="preview-mark">${icon("sparkle", 15)}</span>
          <div class="preview-title">
            <strong>${escapeHtml(preview.summary)}</strong>
            <span>${escapeHtml(preview.explanation)}</span>
            ${
              preparing
                ? `<div class="progress" style="margin-top:8px"><span style="width:${pct != null ? Math.round(pct * 100) : 8}%"></span></div>`
                : ""
            }
          </div>
        </div>
        <div class="preview-actions">
          <span class="source-note">${icon("sparkle", 11)} AI request in progress</span>
          <button type="button" class="btn btn-sm" id="cancelThinking">Dismiss</button>
        </div>
      </div>
    `;
    el.querySelector("#cancelThinking")?.addEventListener("click", () => {
      requestToken += 1;
      store.setAI({ busy: false, preparing: false, progress: null });
      setBusy(false);
      store.clearPreview();
      preview = null;
      renderPreview();
    });
    return;
  }

  const hasEdits = Boolean(preview.edits?.length);
  const hasClarification = Boolean(preview.clarification);
  const isRules = preview.source === "rules";
  const canRefine = isRules && hasEdits && store.state.ai.configured;

  el.innerHTML = `
    <div class="prompt-preview" role="status" aria-live="polite">
      <div class="prompt-preview-head">
        <span class="preview-mark">${icon(preview.source === "ai" ? "sparkle" : hasEdits ? "settings" : "info", 15)}</span>
        <div class="preview-title">
          <strong>${escapeHtml(preview.summary || "Edit plan")}</strong>
          <span>${escapeHtml(preview.explanation || "")}</span>
        </div>
        <button type="button" class="icon-btn" data-discard-preview aria-label="Discard preview">${icon("close", 14)}</button>
      </div>
      ${
        hasEdits
          ? `<div class="preview-edits">
              ${preview.edits
                .map(
                  (edit) => `
                  <div class="preview-edit">
                    ${edit.color ? `<span class="swatch-current" style="background:${escapeHtml(edit.color)}"></span>` : icon(editIcon(edit), 12)}
                    <span>${escapeHtml(edit.description || edit.type)}</span>
                    <em>${escapeHtml(edit.type.replaceAll("-", " "))}</em>
                  </div>`
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        hasClarification
          ? `<div class="preview-question">
              <p>${escapeHtml(preview.clarification.question)}</p>
              ${
                preview.clarification.options?.length
                  ? `<div class="question-options">
                      ${preview.clarification.options
                        .map(
                          (option) =>
                            `<button type="button" class="btn btn-sm" data-clarify-room="${option.roomId}" data-original="${escapeHtml(preview.originalText)}">${escapeHtml(option.label)}</button>`
                        )
                        .join("")}
                    </div>`
                  : `<p class="hint-text">Rephrase the request with the room or item name, then send again.</p>`
              }`
          : ""
      }
      ${preview.aiError ? `<div class="preview-edits" style="padding-top:0"><div class="notice" data-tone="warn">${icon("warn", 14)}<div>${escapeHtml(preview.aiErrorDetail || "The AI request could not be completed. Your scene is unchanged.")}</div></div></div>` : ""}
      ${
        preview.warnings?.length
          ? `<div class="preview-edits" style="padding-top:0"><div class="notice" data-tone="warn">${icon("warn", 14)}<div>${preview.warnings
              .map((warning) => escapeHtml(warning))
              .join("<br>")}</div></div></div>`
          : ""
      }
      <div class="preview-actions">
        <span class="source-note">${sourceNote(preview)}</span>
        <button type="button" class="btn btn-sm" data-discard-preview>Discard</button>
        ${
          canRefine
            ? `<button type="button" class="btn btn-sm" id="refineWithAI">${icon("sparkle", 12)} Ask AI</button>`
            : ""
        }
        ${
          preview.showSetup || (!store.state.ai.configured && !hasEdits && !hasClarification)
            ? `<button type="button" class="btn btn-sm" id="setupAIPrompt">${icon("sparkle", 12)} Set up AI</button>`
            : ""
        }
        ${hasEdits ? `<button type="button" class="btn btn-sm btn-primary" id="applyPreview">${icon("check", 12)} Apply ${preview.edits.length > 1 ? `${preview.edits.length} edits` : "edit"}</button>` : ""}
      </div>
    </div>
  `;

  el.querySelectorAll("[data-discard-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      store.clearPreview();
      preview = null;
      renderPreview();
    });
  });
  el.querySelector("#applyPreview")?.addEventListener("click", applyPreview);
  el.querySelector("#setupAIPrompt")?.addEventListener("click", () => openAISettings());
  el.querySelector("#refineWithAI")?.addEventListener("click", async () => {
    const text = preview?.originalText || currentText;
    if (!text) return;
    const consent = store.state.ai.consent ? true : await openConsentModal("design");
    if (!consent) return;
    await runAI(text);
  });
  el.querySelectorAll("[data-clarify-room]").forEach((button) => {
    button.addEventListener("click", () => {
      submitPrompt(button.dataset.original, button.dataset.clarifyRoom);
    });
  });
}

function applyPreview() {
  if (!preview?.edits?.length) return;
  const summary = preview.summary;
  const source =
    preview.source === "ai"
      ? inferenceSourceLabel(preview.inferenceSource)
      : preview.source === "rules"
        ? "Rule-based edit, no model used"
        : "";
  const applied = applyEditPlan(preview);
  if (!applied.ok) {
    toast("No edits were applied", {
      detail: applied.warnings?.[0] || "Check the room and item names in your request.",
      tone: "error",
    });
    return;
  }
  const warning = applied.warnings?.[0];
  toast(warning ? "Applied with notes" : "Design applied", {
    detail: warning || (source ? `${source}.` : ""),
    tone: warning ? "error" : "success",
    actionLabel: "Undo",
    onAction: () => {
      store.undo();
      toast("Change undone", { detail: summary });
    },
  });
  store.clearPreview();
  preview = null;
  const input = document.getElementById("promptInput");
  if (input) {
    input.value = "";
    input.style.height = "auto";
    input.dispatchEvent(new Event("input"));
  }
  renderPreview();
}
