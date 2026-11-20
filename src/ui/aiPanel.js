import { DESIGN_SCHEMA } from "../ai/schemas.js";
import {
  clearFirebaseSettings,
  getAppCheckDebugToken,
  getDeviceSupport,
  getFirebaseSettings,
  grantConsent,
  refreshAIStatus,
  saveFirebaseSettings,
  warmDeviceModel,
} from "../ai/firebase.js";
import { store } from "../store.js";
import { escapeHtml } from "../util.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { toast } from "./toast.js";

const CLOUD_MODEL_NAMES = {
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
};

function cloudModelLabel(model) {
  return CLOUD_MODEL_NAMES[model] || model || "Gemini 4 Hydrogen";
}

function deviceBadge(support) {
  if (!support) return { label: "Checking…", tone: "" };
  if (!support.supported) return { label: "Not available", tone: "warn" };
  if (support.availability === "available") return { label: "Model ready", tone: "ok" };
  if (support.availability === "downloadable") return { label: "Downloadable", tone: "info" };
  if (support.availability === "downloading") return { label: "Downloading", tone: "info" };
  return { label: support.availability || "Unknown", tone: "" };
}

function statusMarkup(settings, support) {
  const device = deviceBadge(support);
  const chrome = support?.chromeVersion ? `Chrome ${support.chromeVersion}` : "Browser";
  return `
    <div class="status-list">
      <div class="status-line">
        ${icon("cloud", 14)}
        <span>Firebase project</span>
        <span class="badge ${settings.config ? "ok" : "warn"}">${settings.config ? escapeHtml(settings.config.projectId) : "Not connected"}</span>
      </div>
      <div class="status-line">
        ${icon("device", 14)}
        <span>On-device model <span style="color:var(--ink-faint)">· ${escapeHtml(chrome)}</span></span>
        <span class="badge ${device.tone}">${escapeHtml(device.label)}</span>
      </div>
      <div class="status-line">
        ${icon("sparkle", 14)}
        <span>Inference mode</span>
        <span class="badge ${support?.availability === "available" ? "info" : "warn"}">Plans: cloud · Edits: ${support?.availability === "available" ? "local" : "cloud"}</span>
      </div>
    </div>
  `;
}

export function openAISettings() {
  const initialSettings = getFirebaseSettings();
  const support = store.state.ai.deviceSupport;
  let unsubscribe = null;
  const template = initialSettings.rawConfig || {
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: "",
    storageBucket: "",
    messagingSenderId: "",
  };

  const modal = openModal({
    size: "md",
    kicker: "Firebase AI Logic",
    title: "Hybrid inference",
    subtitle:
      "Text edits prefer a local Chrome model and fall back to Firebase-managed cloud inference. Plan images use the cloud vision model for stronger recognition. Manual editing is always available.",
    body: `
      <div id="aiStatusBlock">${statusMarkup(initialSettings, support)}</div>
      <div class="notice" style="margin-top:12px" data-tone="warn">
        ${icon("info", 15)}
        <div>
          <strong>Before AI requests work:</strong> enable <strong>AI Services → AI Logic</strong> in the Firebase console
          (choose the Gemini Developer API), then register the local App Check debug token below under
          <strong>App Check → Apps → Manage debug tokens</strong> and reload. A 403 usually means one of these is missing.
          On-device inference additionally requires <strong>desktop Chrome 148+</strong> and the Gemini Nano model
          (check <code>chrome://components</code> → <strong>Optimization Guide On Device Model</strong>).
        </div>
      </div>
      <div id="aiProgress" hidden style="margin-top:10px">
        <div class="section-sub" id="aiProgressText">Preparing the on-device model…</div>
        <div class="progress"><span id="aiProgressBar" style="width:0%"></span></div>
        <p class="hint-text">You can keep editing while the model downloads. The first request may use cloud fallback.</p>
      </div>
      <div id="appCheckDebug" class="notice" ${initialSettings.config?.debugAppCheck ? "" : "hidden"} style="margin-top:12px">
        ${icon("settings", 15)}
        <div style="flex:1;min-width:0">
          <strong>Local App Check debug token</strong>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px">
            <code id="debugTokenValue" style="font-family:var(--mono);font-size:10.5px;word-break:break-all">${escapeHtml(getAppCheckDebugToken())}</code>
            <button type="button" class="btn btn-sm" data-copy-debug>Copy</button>
          </div>
          <p class="hint-text" style="margin-top:5px">
            Add this token in Firebase Console → <strong>App Check → Apps → Manage debug tokens</strong>, then reload the app. App Check must be enforced for AI Logic.
          </p>
        </div>
      </div>
      <div style="margin-top:16px">
        <div class="insp-label">Firebase web-app config</div>
        <div class="config-grid">
          <textarea id="aiConfigInput" class="input code-area" spellcheck="false" aria-label="Firebase configuration JSON">${escapeHtml(JSON.stringify(template, null, 2))}</textarea>
          <div class="field">
            <label for="aiCloudModel">Cloud vision model <span style="opacity:.65">(plans and text fallback)</span></label>
            <input id="aiCloudModel" class="input" type="text" placeholder="gemini-4-hydrogen" value="${escapeHtml(initialSettings.cloudModel || "")}" />
          </div>
        </div>
        <p class="hint-text">
          Stored only in this browser. For local testing, add <code>"debugAppCheck": true</code> and copy the
          debug token above into Firebase App Check. No reCAPTCHA key is needed for localhost. For production,
          use <code>"recaptchaSiteKey"</code> and remove <code>debugAppCheck</code>. App Check must be
          enforced for AI Logic.
          <a href="https://firebase.google.com/docs/ai-logic/hybrid/web/get-started" target="_blank" rel="noreferrer" style="color:var(--clay-deep)">Setup guide</a>.
        </p>
        <div id="aiFormNotice" class="notice" hidden style="margin-top:10px"></div>
      </div>
      <div class="row-actions" style="margin-top:14px">
        <button type="button" class="btn" id="prepareDeviceBtn">${icon("device", 14)} Prepare on-device model</button>
        <button type="button" class="btn btn-quiet" id="checkSupportBtn">${icon("info", 14)} Re-check support</button>
      </div>
    `,
    footer: `
      ${initialSettings.config ? '<button type="button" class="btn btn-quiet" id="removeAI">Remove config</button>' : ""}
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Close</button>
      <button type="button" class="btn btn-primary" id="saveAI">${icon("save", 14)} Save &amp; connect</button>
    `,
    onClose: () => {
      unsubscribe?.();
    },
    onMount: (api) => {
      const statusBlock = api.body.querySelector("#aiStatusBlock");
      const configInput = api.body.querySelector("#aiConfigInput");
      const modelInput = api.body.querySelector("#aiCloudModel");
      const formNotice = api.body.querySelector("#aiFormNotice");
      const progress = api.body.querySelector("#aiProgress");
      const progressText = api.body.querySelector("#aiProgressText");
      const progressBar = api.body.querySelector("#aiProgressBar");
      const prepareBtn = api.body.querySelector("#prepareDeviceBtn");
      const debugBlock = api.body.querySelector("#appCheckDebug");

      const refreshDebugBlock = (config) => {
        if (!debugBlock) return;
        const enabled = Boolean(config?.debugAppCheck);
        debugBlock.hidden = !enabled;
        if (enabled) {
          const value = api.body.querySelector("#debugTokenValue");
          if (value) value.textContent = getAppCheckDebugToken();
        }
      };

      api.body.querySelector("[data-copy-debug]")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(getAppCheckDebugToken());
          toast("Debug token copied", { detail: "Paste it into App Check → Apps → Manage debug tokens.", tone: "success" });
        } catch {
          toast("Could not copy automatically", { detail: "Select the token text and copy it.", tone: "error" });
        }
      });

      const showNotice = (message, tone = "warn") => {
        formNotice.hidden = false;
        formNotice.dataset.tone = tone;
        formNotice.innerHTML = `${icon(tone === "warn" ? "warn" : "info", 15)}<div>${escapeHtml(message)}</div>`;
      };

      const unsubscribeStatus = store.subscribe((state, reason) => {
        if (reason !== "ai") return;
        const ai = state.ai;
        if (ai.preparing || ai.progress != null) {
          progress.hidden = false;
          const pct = ai.progress != null ? Math.round(ai.progress * 100) : null;
          progressText.textContent =
            pct != null ? `Preparing the on-device model · ${pct}%` : "Preparing the on-device model…";
          progressBar.style.width = `${pct ?? 8}%`;
        } else if (!ai.preparing) {
          progress.hidden = ai.progress == null;
        }
      });
      unsubscribe = unsubscribeStatus;

      api.body.querySelector("#checkSupportBtn").addEventListener("click", async () => {
        const next = await getDeviceSupport();
        store.setAI({ deviceSupport: next });
        statusBlock.innerHTML = statusMarkup(getFirebaseSettings(), next);
        toast("Device support re-checked", { detail: deviceBadge(next).label });
      });

      prepareBtn.addEventListener("click", async () => {
        try {
          await warmDeviceModel(DESIGN_SCHEMA);
          progress.hidden = false;
          progressText.textContent =
            "Preparing the on-device model… this can take several minutes. Editing stays available.";
          progressBar.style.width = "10%";
        } catch (error) {
          showNotice(error.userMessage || error.message || "The on-device model could not be prepared.");
        }
      });

      const saveBtn = api.footer.querySelector("#saveAI");
      saveBtn.addEventListener("click", async () => {
        try {
          const config = JSON.parse(configInput.value);
          const settings = saveFirebaseSettings(config, modelInput.value);
          await refreshAIStatus();
          statusBlock.innerHTML = statusMarkup(settings, store.state.ai.deviceSupport);
          refreshDebugBlock(config);
          toast("AI connected", {
            detail: "Firebase AI Logic is ready. The first prompt initialises the device model.",
            tone: "success",
          });
          formNotice.hidden = true;
          if (!api.footer.querySelector("#removeAI")) {
            api.footer.insertAdjacentHTML(
              "afterbegin",
              '<button type="button" class="btn btn-quiet" id="removeAI">Remove config</button>'
            );
            api.footer.querySelector("#removeAI")?.addEventListener("click", () => {
              clearFirebaseSettings();
              refreshAIStatus();
              toast("AI configuration removed");
              api.close();
            });
          }
        } catch (error) {
          console.error("[planwalk] AI config invalid", error);
          showNotice(
            error instanceof SyntaxError
              ? "That isn't valid JSON. Paste the firebaseConfig object from the Firebase console."
              : error.message
          );
        }
      });

      api.footer.querySelector("#removeAI")?.addEventListener("click", async () => {
        clearFirebaseSettings();
        await refreshAIStatus();
        toast("AI configuration removed");
        api.close();
      });
    },
  });

  // Keep the close handler tidy (the modal already wires data-close).
  return modal;
}

/**
 * Explicit opt-in before a request that may be processed in the cloud.
 * Resolves true only if the user confirms this request.
 */
export function openConsentModal(kind) {
  return new Promise((resolve) => {
    let settled = false;
    const support = store.state.ai.deviceSupport;
    const deviceReady = support?.availability === "available";
    const cloudOnly = !support?.supported || support?.availability === "unsupported";
    const isPlan = kind === "plan";
    const localEdits = deviceReady && !isPlan;
    const cloudModel = cloudModelLabel(getFirebaseSettings().cloudModel);

    const items = isPlan
      ? [
          { text: "A downscaled copy of the floor-plan image", warn: false },
          { text: "That's it — no project name or unrelated scene data", warn: true },
          {
            text: `The request is sent through this app's Firebase project to ${cloudModel} for stronger image recognition`,
            warn: false,
          },
        ]
      : localEdits
        ? [
            { text: "Your prompt and minimal room/object context are processed locally", warn: false },
            { text: "No plan image is included", warn: false },
            {
              text: "If local inference fails, the prompt and context may be sent through Firebase to a Gemini model",
              warn: true,
            },
          ]
        : [
            { text: "Your prompt text", warn: false },
            { text: "Room names, sizes, current materials and object types/IDs", warn: false },
            { text: "No plan image and no unrelated project data", warn: true },
          ];

    const modal = openModal({
      size: "sm",
      kicker: isPlan ? "Cloud vision" : localEdits ? "On-device AI" : "Cloud processing consent",
      title: isPlan ? "Interpret this plan with AI?" : "Use AI for this edit?",
      subtitle: isPlan
        ? "Plan images use the cloud vision model so rooms, walls and openings are recognized more reliably. You'll review everything before it reaches 3D."
        : localEdits
          ? "This text edit runs on your device first. If the local model can't complete it, Firebase cloud fallback may be used."
          : "AI can interpret requests the rule engine can't. Every proposed edit is validated and previewed first.",
      body: `
        <div class="consent-list">
          ${items
            .map(
              ({ text, warn }) =>
                `<div class="consent-item ${warn ? "is-warn" : ""}">${icon(warn ? "info" : "check", 14)}<span>${escapeHtml(
                  text
                )}</span></div>`
            )
            .join("")}
        </div>
        <div class="notice" data-tone="${isPlan || cloudOnly || !deviceReady ? "warn" : ""}">
          ${icon(isPlan ? "cloud" : cloudOnly ? "warn" : "device", 15)}
          <div>
            ${
              isPlan
                ? "Plan images use the cloud vision model for stronger recognition. Text edits use the on-device model when it's available."
                : cloudOnly
                  ? "This browser has no supported on-device model, so this request will use <strong>cloud inference</strong>."
                  : localEdits
                    ? "The on-device model is ready. Cloud fallback is used only if the local model can't complete this request."
                    : "The device model isn't ready yet, so this request may use <strong>cloud inference</strong>. The result will say which source was used."
            }
          </div>
        </div>
        <label class="checkbox-row" style="margin-top:12px">
          <input type="checkbox" id="cloudConsentCheck" />
          <span>${
            isPlan
              ? "I understand and agree to send this plan and the listed data for this interpretation."
              : localEdits
                ? "I understand and agree to this request, including cloud fallback if local inference can't complete it."
                : "I understand and agree to send the items above for AI requests in this session."
          }</span>
        </label>
        <div id="consentError" class="notice" data-tone="warn" hidden style="margin-top:10px">
          ${icon("warn", 15)}<div>Please confirm consent before sending.</div>
        </div>
      `,
      footer: `
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn btn-primary" id="consentConfirm">${icon("sparkle", 14)} ${isPlan ? "Send plan" : localEdits ? "Continue" : "Send request"}</button>
      `,
      onMount: (api) => {
        const check = api.body.querySelector("#cloudConsentCheck");
        const confirm = api.footer.querySelector("#consentConfirm");
        const error = api.body.querySelector("#consentError");
        confirm.disabled = true;
        check.addEventListener("change", () => {
          confirm.disabled = !check.checked;
          error.hidden = true;
        });
        confirm.addEventListener("click", () => {
          if (!check.checked) {
            error.hidden = false;
            return;
          }
          settled = true;
          grantConsent(kind === "plan" ? "plan" : "design");
          api.close();
          resolve(true);
        });
      },
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
    return modal;
  });
}
