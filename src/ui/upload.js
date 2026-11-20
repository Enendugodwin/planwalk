import { store } from "../store.js";
import { humanizeAIError } from "../ai/firebase.js";
import { buildUploadedProject, interpretPlanImage, layoutFromNormalized, loadImage, makeManualRoom, starterLayout } from "../ai/plan.js";
import {
  displayLengthNumber,
  formatLength,
  isCalibrated,
  parseDisplayLength,
} from "../model/units.js";
import { clamp, escapeHtml, slugify } from "../util.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { openAISettings, openConsentModal } from "./aiPanel.js";
import { ScalePicker } from "./scalePicker.js";
import { toast } from "./toast.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FT = 0.3048;

function sourceLabel(inferenceSource) {
  const key = String(inferenceSource || "").toLowerCase();
  if (key === "on_device") return "On this device";
  if (key === "in_cloud") return "Cloud vision";
  return "Inference source not reported";
}

function fileBaseName(name) {
  return String(name || "Uploaded plan").replace(/\.[a-z0-9]+$/i, "").slice(0, 80);
}

async function prepareImageData(dataUrl, originalType) {
  const image = await loadImage(dataUrl);
  const maxDim = 2200;
  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const wantsPng = originalType === "image/png";
  let url = canvas.toDataURL(wantsPng ? "image/png" : "image/jpeg", 0.9);
  if (url.length > 3_200_000) url = canvas.toDataURL("image/jpeg", 0.84);
  return { dataUrl: url, width, height };
}

async function renderPdfPage(file, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(clamp(pageNumber, 1, doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.4, 2000 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    pages: doc.numPages,
    pageNumber: clamp(pageNumber, 1, doc.numPages),
  };
}

/**
 * Upload → scale calibration → AI/manual interpretation → review → 3D.
 */
export function openUploadWizard() {
  const state = {
    step: 1,
    fileName: "",
    fileType: "",
    dataUrl: null,
    imageWidth: 0,
    imageHeight: 0,
    isPdf: false,
    pdfPages: 0,
    pdfPage: 1,
    pdfFile: null,
    busy: false,
    busyLabel: "",
    reading: false,
    readError: "",
    calibration: null, // { metersPerUnit, reference }
    scaleDistance: null,
    scaleKnown: 5,
    scaleUnit: "m",
    layout: null, // { rooms, openings, planWidth, planHeight }
    layoutSource: { kind: "none", inferenceSource: null },
    aiError: "",
    aiWarnings: [],
    selectedRoomId: null,
    projectName: "Uploaded plan",
  };

  let picker = null;
  let api = null;
  let reviewCanvas = null;

  function calibratedProject() {
    return {
      ...store.project,
      scale: {
        calibrated: Boolean(state.calibration?.metersPerUnit),
        metersPerUnit: state.calibration?.metersPerUnit || null,
      },
    };
  }

  function unitLabel() {
    if (!state.calibration?.metersPerUnit) return "u";
    return store.project.unitSystem === "imperial" ? "ft" : "m";
  }

  function displayValue(units) {
    return Math.round(displayLengthNumber(units, calibratedProject()) * 100) / 100;
  }

  function convert(value) {
    return parseDisplayLength(value, calibratedProject());
  }

  function setStep(step) {
    state.step = step;
    render();
  }

  function render() {
    if (!api || !api.root.isConnected) return;
    api.footer.hidden = false;
    if (picker && state.step !== 2) {
      picker.destroy();
      picker = null;
    }
    api.setTitle(
      state.step === 1 ? "Start from a floor plan" : state.step === 2 ? "Set the real-world scale" : "Review the interpreted layout",
      state.step === 1
        ? "Open the sample instantly, or upload a plan image. PNG, JPEG and WebP are supported; PDF pages are rendered locally first."
        : state.step === 2
          ? "Pick two points with a known distance. Until you calibrate, all room sizes are shown in plan units and labelled as estimates."
          : "Correct names, outlines, doors and windows before the geometry becomes a 3D scene. Nothing here is treated as a construction measurement by default."
    );

    const steps = `
      <div class="steps" aria-label="Upload steps">
        ${stepChip(1, "Choose plan", state.step)}
        <span class="step-sep"></span>
        ${stepChip(2, "Calibrate scale", state.step)}
        <span class="step-sep"></span>
        ${stepChip(3, "Review layout", state.step)}
      </div>
    `;

    if (state.step === 1) {
      api.body.innerHTML = steps + stepOneMarkup();
      bindStepOne();
      api.footer.innerHTML = `
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn btn-primary" id="wizardNext" ${state.dataUrl ? "" : "disabled"}>Continue ${icon("arrowRight", 14)}</button>
      `;
      api.footer.querySelector("#wizardNext").addEventListener("click", () => setStep(2));
      return;
    }

    if (state.step === 2) {
      api.body.innerHTML = steps + stepTwoMarkup();
      api.footer.innerHTML = `
        <button type="button" class="btn btn-quiet" id="wizardBack">Back</button>
        <span class="spacer"></span>
        ${store.state.ai.configured ? `<button type="button" class="btn" id="wizardSkip">Use starter layout</button>` : ""}
        <button type="button" class="btn btn-primary" id="wizardScaleNext">${store.state.ai.configured ? `Interpret plan ${icon("sparkle", 14)}` : `Create starter layout ${icon("arrowRight", 14)}`}</button>
      `;
      api.footer.querySelector("#wizardBack").addEventListener("click", () => setStep(1));
      api.footer.querySelector("#wizardSkip")?.addEventListener("click", () => {
        state.calibration = null;
        proceedFromScale(false);
      });
      api.footer.querySelector("#wizardScaleNext").addEventListener("click", () => proceedFromScale(true));
      bindStepTwo();
      return;
    }

    api.body.innerHTML = steps + stepThreeMarkup();
    api.footer.innerHTML = state.busy
      ? `<span class="spacer"></span><button type="button" class="btn" disabled>Interpreting…</button>`
      : `
        <button type="button" class="btn btn-quiet" id="wizardBack">Back</button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn btn-primary" id="wizardConfirm" ${state.layout?.rooms?.length ? "" : "disabled"}>${icon("cube", 14)} Confirm &amp; open 3D</button>
      `;
    if (!state.busy) {
      api.footer.querySelector("#wizardBack")?.addEventListener("click", () => setStep(2));
      api.footer.querySelector("#wizardConfirm")?.addEventListener("click", confirmLayout);
    }
    bindStepThree();
  }

  function stepChip(number, label, current) {
    const stateName = number < current ? "done" : number === current ? "active" : "";
    return `<span class="step" data-state="${stateName}"><span class="num">${number < current ? "✓" : number}</span>${label}</span>`;
  }

  function stepOneMarkup() {
    const hasImage = Boolean(state.dataUrl);
    return `
      ${state.readError ? `<div class="notice" data-tone="warn" style="margin-bottom:12px">${icon("warn", 15)}<div>${escapeHtml(state.readError)}</div></div>` : ""}
      ${
        hasImage
          ? `<div class="upload-preview">
              <div class="plan-stage" style="min-height:280px">
                <img src="${state.dataUrl}" alt="Uploaded floor plan preview" style="max-width:100%;max-height:400px;display:block" />
                <div class="calib-hint">${state.imageWidth} × ${state.imageHeight} px${state.isPdf ? ` · page ${state.pdfPage} of ${state.pdfPages}` : ""}</div>
              </div>
              <div>
                <div class="dim-card">
                  <div class="dim-value" style="font-size:16px">${escapeHtml(state.fileName || "Uploaded plan")}</div>
                  <div class="dim-caption">${state.isPdf ? "PDF page rasterised to PNG locally" : "Plan image ready"}</div>
                </div>
                ${
                  state.isPdf
                    ? `<div class="field-grid" style="margin-top:12px">
                        <div class="field">
                          <label for="pdfPageInput">PDF page</label>
                          <input id="pdfPageInput" class="input" type="number" min="1" max="${state.pdfPages}" value="${state.pdfPage}" />
                        </div>
                        <div class="field" style="justify-content:flex-end">
                          <button type="button" class="btn" id="renderPageBtn">${icon("file", 14)} Render page</button>
                        </div>
                      </div>
                      <p class="hint-text">Rendering happens on this device. The resulting JPEG may still use on-device inference; PDF document input itself is not supported by Chrome's local model.</p>`
                    : ""
                }
                <div class="row-actions">
                  <button type="button" class="btn" id="replaceFile">${icon("upload", 14)} Replace plan</button>
                  <button type="button" class="btn btn-quiet" id="removeFile">${icon("trash", 14)} Remove</button>
                </div>
                <input type="file" id="replaceFileInput" accept="image/png,image/jpeg,image/webp,application/pdf" hidden />
                <p class="hint-text">The plan stays as a visual reference. You can hide it after confirming the layout.</p>
              </div>
            </div>`
          : `<div class="upload-zone" id="uploadZone" tabindex="0" role="button" aria-label="Choose a floor plan image or PDF">
              <div class="art">${icon("upload", 22)}</div>
              <h3>Drop a floor plan here</h3>
              <p>or click to browse. A clear, straight-on plan works best.</p>
              <div class="formats"><span class="format-tag">PNG</span><span class="format-tag">JPEG</span><span class="format-tag">WEBP</span><span class="format-tag">PDF</span></div>
              <input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp,application/pdf" hidden />
            </div>
            <div class="row-actions" style="margin-top:12px">
              <button type="button" class="btn btn-quiet" id="sampleInstead">${icon("plan", 14)} Use the sample apartment instead</button>
            </div>
            <div class="notice" style="margin-top:12px">
              ${icon("info", 15)}
              <div>Uploaded plans are interpreted as estimates. You'll set a known distance, then review every room before entering 3D. PNG, JPEG and WebP can be interpreted on-device; PDF pages are rasterised first. Use one floor per image — crop multi-floor sheets first.</div>
            </div>`
      }
    `;
  }

  function bindStepOne() {
    const zone = api.body.querySelector("#uploadZone");
    const input = api.body.querySelector("#fileInput");
    if (zone && input) {
      zone.addEventListener("click", () => input.click());
      zone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.click();
        }
      });
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("is-over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-over");
        const file = event.dataTransfer?.files?.[0];
        if (file) handleFile(file);
      });
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) handleFile(file);
      });
    }
    api.body.querySelector("#replaceFile")?.addEventListener("click", () => {
      api.body.querySelector("#replaceFileInput")?.click();
    });
    api.body.querySelector("#replaceFileInput")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) handleFile(file);
    });
    api.body.querySelector("#removeFile")?.addEventListener("click", () => {
      state.dataUrl = null;
      state.fileName = "";
      state.isPdf = false;
      state.pdfPages = 0;
      state.pdfPage = 1;
      state.pdfFile = null;
      state.readError = "";
      render();
    });
    api.body.querySelector("#sampleInstead")?.addEventListener("click", () => {
      api.close();
      store.startSample();
      toast("Sample apartment opened", { detail: "6 rooms · drawn to scale", tone: "success" });
    });
    api.body.querySelector("#renderPageBtn")?.addEventListener("click", async () => {
      const page = Number(api.body.querySelector("#pdfPageInput")?.value) || 1;
      await loadPdf(fileForPdf(), page);
    });
  }

  function fileForPdf() {
    return state.pdfFile;
  }

  async function handleFile(file) {
    state.readError = "";
    if (file.size > MAX_FILE_BYTES) {
      state.readError = "That file is larger than 25 MB. Please use a smaller plan image.";
      render();
      return;
    }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      file.type === "image/webp" ||
      /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!isPdf && !isImage) {
      state.readError = "Unsupported file. Choose a PNG, JPEG, WebP, or PDF.";
      render();
      return;
    }
    state.fileName = fileBaseName(file.name);
    state.projectName = fileBaseName(file.name);
    state.fileType = file.type;
    if (isPdf) {
      state.pdfFile = file;
      state.isPdf = true;
      state.dataUrl = null;
      await loadPdf(file, 1);
    } else {
      state.isPdf = false;
      state.pdfPages = 0;
      try {
        const raw = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const prepared = await prepareImageData(raw, file.type || (file.name.endsWith(".png") ? "image/png" : "image/jpeg"));
        state.dataUrl = prepared.dataUrl;
        state.imageWidth = prepared.width;
        state.imageHeight = prepared.height;
        render();
      } catch (error) {
        console.error("[planwalk] image read failed", error);
        state.readError = "That image could not be read. Try exporting it as a PNG, JPEG, or WebP.";
        render();
      }
    }
  }

  async function loadPdf(file, pageNumber) {
    if (!file) return;
    state.reading = true;
    state.readError = "";
    try {
      const page = await renderPdfPage(file, pageNumber);
      const prepared = await prepareImageData(page.dataUrl, "image/png");
      state.dataUrl = prepared.dataUrl;
      state.imageWidth = prepared.width;
      state.imageHeight = prepared.height;
      state.pdfPages = page.pages;
      state.pdfPage = page.pageNumber;
      state.isPdf = true;
    } catch (error) {
      console.error("[planwalk] PDF render failed", error);
      state.readError = "That PDF page could not be rendered. Try exporting the plan as a PNG or JPEG.";
    } finally {
      state.reading = false;
      render();
    }
  }

  function stepTwoMarkup() {
    return `
      <div class="upload-preview">
        <div class="plan-stage" style="min-height:320px">
          <canvas id="scaleCanvas" style="width:100%;height:360px;cursor:crosshair" aria-label="Plan image scale picker"></canvas>
          <div class="calib-hint">Click the two ends of a known wall</div>
        </div>
        <div>
          <div class="notice">
            ${icon("ruler", 15)}
            <div>Optional: choose two points with a distance you know and enter that real length. If you skip calibration, interpretation still runs, but room dimensions are shown in plan units and labelled as estimates.</div>
          </div>
          <div class="field-grid" style="margin-top:12px">
            <div class="field">
              <label for="scaleLength">Known length</label>
              <input id="scaleLength" class="input" type="number" min="0.1" step="0.1" value="${state.scaleKnown}" />
            </div>
            <div class="field">
              <label for="scaleUnit">Unit</label>
              <select id="scaleUnit" class="input">
                <option value="m" ${state.scaleUnit === "m" ? "selected" : ""}>Metres</option>
                <option value="ft" ${state.scaleUnit === "ft" ? "selected" : ""}>Feet</option>
              </select>
            </div>
          </div>
          <div id="scaleResult" class="measure-summary" data-tone="warn" style="margin-top:10px">
            ${icon("info", 14)}
            <span>Set two points to calculate the scale.</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-quiet" id="resetScale">Reset points</button>
          </div>
          <p class="hint-text">
            You can interpret without a scale. Plan units are then treated as estimates and every room keeps an <strong>Estimated</strong> status until you calibrate later.
          </p>
        </div>
      </div>
    `;
  }

  function bindStepTwo() {
    const canvas = api.body.querySelector("#scaleCanvas");
    const lengthInput = api.body.querySelector("#scaleLength");
    const unitInput = api.body.querySelector("#scaleUnit");
    const result = api.body.querySelector("#scaleResult");
    const nextBtn = api.footer.querySelector("#wizardScaleNext");
    if (!canvas || !state.dataUrl) return;

    state.scaleKnown = Number(lengthInput.value) || 5;
    state.scaleUnit = unitInput.value;

    loadImage(state.dataUrl)
      .then((image) => {
        picker = new ScalePicker(canvas, {
          onChange: (info) => {
            state.scaleDistance = info.sourceDistance;
            const known = Number(lengthInput.value);
            const meters = unitInput.value === "ft" ? known * FT : known;
            if (!info.complete || !info.sourceDistance || !Number.isFinite(meters) || meters <= 0) {
              result.dataset.tone = "warn";
              result.innerHTML = `${icon("info", 14)}<span>Set two points to calculate the scale. You can still interpret the plan without a scale; dimensions will be estimates in plan units.</span>`;
              state.calibration = null;
              return;
            }
            const mpu = meters / (info.sourceDistance / 100);
            result.dataset.tone = "";
            result.innerHTML = `${icon("checkCircle", 14)}<span>${info.sourceDistance.toFixed(0)} px ≈ ${meters.toFixed(2)} m. One plan unit ≈ ${mpu.toFixed(3)} m. Dimensions will use real units after you confirm.</span>`;
            state.calibration = {
              metersPerUnit: mpu,
              reference: {
                label: "Two-point calibration",
                meters,
                pixels: info.sourceDistance,
                known,
                unit: unitInput.value,
              },
            };
          },
        });
        picker.setImage(image);
      })
      .catch((error) => {
        result.dataset.tone = "warn";
        result.innerHTML = `${icon("warn", 14)}<span>${escapeHtml(error.message)}</span>`;
      });

    lengthInput.addEventListener("input", () => {
      state.scaleKnown = Number(lengthInput.value) || 5;
      picker?.onChange?.(picker.getState());
    });
    unitInput.addEventListener("change", () => {
      state.scaleUnit = unitInput.value;
      picker?.onChange?.(picker.getState());
    });
    api.body.querySelector("#resetScale")?.addEventListener("click", () => picker?.reset());
  }

  async function proceedFromScale(useAI) {
    if (!state.dataUrl) return;
    if (useAI) {
      if (!store.state.ai.configured) {
        startInterpretation(false, "Firebase AI Logic isn't connected, so no model was used.");
        return;
      }
      const consent = await openConsentModal("plan");
      if (!consent) return;
    }
    startInterpretation(useAI);
  }

  async function startInterpretation(useAI, errorOverride = "") {
    if (state.busy) return;
    state.step = 3;
    state.busy = useAI;
    state.aiError = errorOverride;
    state.aiWarnings = [];
    state.layoutSource = { kind: "none", inferenceSource: null };
    if (useAI) {
      state.busyLabel = "Sending the plan to the cloud vision model. This can take up to a minute.";
      state.layout = null;
      render();
      try {
        const result = await interpretPlanImage({
          dataUrl: state.dataUrl,
          width: state.imageWidth,
          height: state.imageHeight,
        });
        const layout = layoutFromNormalized(result, state.imageWidth, state.imageHeight);
        state.layout = layout;
        state.layoutSource = { kind: "ai", inferenceSource: result.inferenceSource };
        state.aiWarnings = result.warnings || [];
        state.selectedRoomId = layout.rooms[0]?.id || null;
      } catch (error) {
        console.error("[planwalk] plan interpretation failed", error);
        state.aiError = humanizeAIError(error);
        const layout = starterLayout(state.imageWidth, state.imageHeight);
        state.layout = layout;
        state.layoutSource = { kind: "starter", inferenceSource: null };
        state.selectedRoomId = layout.rooms[0]?.id || null;
      }
    } else {
      const layout = starterLayout(state.imageWidth, state.imageHeight);
      state.layout = layout;
      state.layoutSource = {
        kind: state.aiError ? "starter" : "starter",
        inferenceSource: null,
      };
      state.selectedRoomId = layout.rooms[0]?.id || null;
    }
    state.busy = false;
    render();
  }

  function stepThreeMarkup() {
    if (state.busy) {
      return `
        <div class="stage-empty" style="position:relative;min-height:340px">
          <div class="preview-mark" style="margin:0 auto 12px">${icon("sparkle", 22)}</div>
          <h2 class="modal-title" style="font-size:22px">Reading the plan</h2>
          <p class="modal-subtitle" style="margin:8px auto 0;max-width:44ch">${escapeHtml(state.busyLabel || "Interpreting the plan…")} The rule-based editor remains available if the model can't finish.</p>
          <div class="progress" style="width:220px;margin:16px auto 0"><span style="width:42%;animation:pulse 1.4s ease-in-out infinite"></span></div>
          <p class="hint-text" style="margin-top:10px">Plan images use the cloud vision model for better recognition. Text edits use the on-device model when available.</p>
        </div>
      `;
    }

    const source = state.layoutSource;
    const rooms = state.layout?.rooms || [];
    const selected = rooms.find((r) => r.id === state.selectedRoomId) || rooms[0];
    if (selected && selected.id !== state.selectedRoomId) state.selectedRoomId = selected.id;
    const unit = unitLabel();

    let sourceTone = "";
    let sourceIcon = "sparkle";
    let sourceText = "";
    let actions = "";
    if (source.kind === "ai") {
      sourceTone = source.inferenceSource === "IN_CLOUD" ? "warn" : "";
      sourceIcon = source.inferenceSource === "IN_CLOUD" ? "cloud" : "device";
      sourceText = `Interpreted by AI · <strong>${sourceLabel(source.inferenceSource)}</strong>. ${rooms.length} room${rooms.length > 1 ? "s" : ""} proposed. Review everything before continuing.`;
    } else {
      sourceTone = "warn";
      sourceIcon = "warn";
      sourceText = state.aiError
        ? `${escapeHtml(state.aiError)} A starter room was created so you can keep working.`
        : `AI wasn't used. A starter room was created — rename it and add rooms manually, or connect Firebase AI Logic.`;
      actions = store.state.ai.configured
        ? `<button type="button" class="btn btn-sm" id="retryAI">${icon("sparkle", 13)} Detect with AI</button>`
        : `<button type="button" class="btn btn-sm" id="setupAI">${icon("sparkle", 13)} Set up AI</button>`;
    }

    const warnings = state.aiWarnings?.length
      ? `<div class="notice" data-tone="warn" style="margin-top:8px">${icon("warn", 15)}<div>${state.aiWarnings
          .slice(0, 3)
          .map((warning) => escapeHtml(warning))
          .join("<br>")}</div></div>`
      : "";

    const roomCards = rooms
      .map((room) => {
        const isSel = room.id === state.selectedRoomId;
        return `
          <div class="review-room" data-room-id="${room.id}" data-selected="${isSel}" role="button" tabindex="0" aria-label="Room ${escapeHtml(room.name)}">
            <div class="review-room-top">
              <input class="input" data-field="name" value="${escapeHtml(room.name)}" aria-label="Room name" />
              <span class="tag" data-tone="info" data-measure>${Math.round((room.confidence || 0) * 100)}%</span>
              <button type="button" class="icon-btn" data-remove-room="${room.id}" aria-label="Remove ${escapeHtml(room.name)}">${icon("trash", 13)}</button>
            </div>
            <div class="review-room-grid">
              ${miniField("w", "Width", displayValue(room.w), unit, room.id)}
              ${miniField("h", "Depth", displayValue(room.h), unit, room.id)}
              ${miniField("x", "X", displayValue(room.x), unit, room.id)}
              ${miniField("y", "Y", displayValue(room.y), unit, room.id)}
            </div>
            <div class="plan-meta" style="margin-top:4px">
              <span>${formatLength(room.w, calibratedProject())} × ${formatLength(room.h, calibratedProject())}</span>
              <span class="tag" data-tone="${room.measurement === "edited" ? "info" : "warn"}">${room.measurement === "edited" ? "Manual" : "Estimated"}</span>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="review-source" data-tone="${sourceTone}">
        ${icon(sourceIcon, 15)}
        <div style="flex:1">${sourceText}</div>
        ${actions}
      </div>
      ${warnings}
      <div class="review-layout" style="margin-top:12px">
        <div>
          <div class="plan-stage" style="min-height:300px">
            <canvas id="reviewCanvas" style="width:100%;display:block;cursor:pointer" aria-label="Detected room layout preview"></canvas>
            <div class="calib-hint">${state.calibration?.metersPerUnit ? "Scale calibrated" : "Plan units — scale unverified"}</div>
          </div>
          <div class="field" style="margin-top:10px">
            <label for="wizardPlanName">Project name</label>
            <input id="wizardPlanName" class="input" value="${escapeHtml(state.projectName)}" maxlength="80" />
          </div>
          <div class="plan-meta">
            <span>${escapeHtml(state.fileName)}</span>
            <span>${state.isPdf ? `PDF page ${state.pdfPage}` : "Plan image"} · ${state.imageWidth} × ${state.imageHeight} px</span>
          </div>
        </div>
        <div>
          <div class="section-head">
            <span class="insp-label" style="margin:0">Rooms (${rooms.length})</span>
            <button type="button" class="btn btn-sm" id="addRoomBtn">${icon("plus", 13)} Add room</button>
          </div>
          <div class="review-rooms" id="reviewRooms">${roomCards || '<div class="empty-inline">No rooms yet. Add one to continue.</div>'}</div>
          <div id="openingEditor">${openingMarkup(selected, unit)}</div>
          <p class="hint-text">Rooms marked <strong>Estimated</strong> keep that status even after scale calibration. Editing dimensions marks the outline as manual.</p>
        </div>
      </div>
    `;
  }

  function miniField(field, label, value, unit, roomId) {
    return `
      <div class="field">
        <label>${label}</label>
        <div class="input-unit">
          <input class="input" type="number" step="0.01" value="${value}" data-room-field="${field}" data-owner="${roomId}" aria-label="${label}" />
          <span class="unit">${unit}</span>
        </div>
      </div>
    `;
  }

  function openingMarkup(room, unit) {
    if (!room) return "";
    const openings = state.layout.openings.filter((o) => o.roomId === room.id);
    const walls = room.walls || { n: true, e: true, s: true, w: true };
    return `
      <div class="insp-label" style="margin-top:12px">
        <span>Walls on this room</span>
        <span class="wall-toggles">
          ${["n", "e", "s", "w"]
            .map(
              (wall) => `<button type="button" class="btn btn-sm wall-toggle" data-toggle-wall="${wall}" aria-pressed="${walls[wall] !== false}" title="${
                walls[wall] !== false ? "Wall present — click to remove" : "Open edge — click to add a wall"
              }">${wallName(wall)}</button>`
            )
            .join("")}
        </span>
      </div>
      <p class="hint-text" style="margin:-3px 0 10px">Turn a wall off where two spaces are open to each other. This changes the 3D geometry only.</p>
      <div class="insp-label">
        <span>Doors &amp; windows (${openings.length})</span>
        <span style="display:flex;gap:4px">
          <button type="button" class="btn btn-sm" data-add-opening="door">${icon("door", 12)} Door</button>
          <button type="button" class="btn btn-sm" data-add-opening="window">${icon("window", 12)} Window</button>
        </span>
      </div>
      <div class="object-list">
        ${
          openings.length
            ? openings
                .map(
                  (opening) => `
                  <div class="object-row" style="cursor:default">
                    <span class="object-thumb">${icon(opening.type === "window" ? "window" : "door", 13)}</span>
                    <span class="object-name">
                      <strong>${opening.type === "window" ? "Window" : "Door"}</strong>
                      <span>${wallName(opening.wall)} wall · ${formatLength(opening.width, calibratedProject())}</span>
                    </span>
                    <span style="display:flex;align-items:center;gap:4px">
                      <select class="input opening-wall" data-opening-wall="${opening.id}" aria-label="Wall for ${opening.type}">
                        ${["n", "e", "s", "w"]
                          .map(
                            (wall) =>
                              `<option value="${wall}" ${opening.wall === wall ? "selected" : ""}>${wallName(wall)}</option>`
                          )
                          .join("")}
                      </select>
                      <button type="button" class="icon-btn" data-remove-opening="${opening.id}" aria-label="Remove ${opening.type}">${icon("trash", 12)}</button>
                    </span>
                  </div>
                `
                )
                .join("")
            : '<div class="empty-inline">No doors or windows detected. Add them if the plan shows them.</div>'
        }
      </div>
    `;
  }

  function wallName(wall) {
    return { n: "North", e: "East", s: "South", w: "West" }[wall] || wall;
  }

  function bindStepThree() {
    if (state.busy) return;
    const canvas = api.body.querySelector("#reviewCanvas");
    if (canvas) {
      reviewCanvas = canvas;
      sizeReviewCanvas();
      drawReview();
      canvas.addEventListener("click", (event) => {
        const room = hitRoom(event);
        if (room) {
          state.selectedRoomId = room.id;
          render();
        }
      });
    }

    api.body.querySelector("#wizardPlanName")?.addEventListener("change", (event) => {
      state.projectName = event.target.value.trim() || "Uploaded plan";
    });
    api.body.querySelector("#addRoomBtn")?.addEventListener("click", () => {
      const room = makeManualRoom({
        planWidth: state.layout.planWidth,
        planHeight: state.layout.planHeight,
        index: state.layout.rooms.length,
      });
      room.x = clamp(room.x, 0, Math.max(0, state.layout.planWidth - room.w));
      room.y = clamp(room.y, 0, Math.max(0, state.layout.planHeight - room.h));
      state.layout.rooms.push(room);
      state.selectedRoomId = room.id;
      render();
    });
    api.body.querySelector("#retryAI")?.addEventListener("click", async () => {
      if (!store.state.ai.configured) return;
      const consent = await openConsentModal("plan");
      if (!consent) return;
      startInterpretation(true);
    });
    api.body.querySelector("#setupAI")?.addEventListener("click", () => openAISettings());

    const reviewRooms = api.body.querySelector("#reviewRooms");
    reviewRooms?.addEventListener("click", (event) => {
      const removeBtn = event.target.closest("[data-remove-room]");
      if (removeBtn) {
        removeRoom(removeBtn.dataset.removeRoom);
        return;
      }
      const card = event.target.closest("[data-room-id]");
      if (card && !event.target.closest("input,button")) {
        state.selectedRoomId = card.dataset.roomId;
        render();
      }
    });
    reviewRooms?.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.classList.contains("review-room")) {
        event.preventDefault();
        state.selectedRoomId = event.target.dataset.roomId;
        render();
      }
    });
    reviewRooms?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-room-field]");
      if (!input) return;
      const room = state.layout.rooms.find((r) => r.id === input.dataset.owner);
      if (!room) return;
      const field = input.dataset.roomField;
      if (field === "name") {
        room.name = input.value.trim().slice(0, 48) || room.name;
        input.value = room.name;
        return;
      }
      const value = convert(input.value);
      if (value == null || value <= 0) {
        input.value = displayValue(room[field]);
        return;
      }
      if (field === "w" || field === "h") {
        room[field] = Math.max(0.4, value);
      } else {
        const limit = field === "x" ? state.layout.planWidth - room.w : state.layout.planHeight - room.h;
        room[field] = clamp(value, 0, Math.max(0, limit));
      }
      room.measurement = "edited";
      input.value = displayValue(room[field]);
      const card = input.closest(".review-room");
      const measure = card?.querySelector("[data-measure]");
      if (measure) measure.textContent = "Manual";
      drawReview();
    });

    api.body.querySelector("#openingEditor")?.addEventListener("click", (event) => {
      const wallToggle = event.target.closest("[data-toggle-wall]");
      if (wallToggle) {
        const room = state.layout.rooms.find((r) => r.id === state.selectedRoomId);
        if (!room) return;
        const wall = wallToggle.dataset.toggleWall;
        room.walls = room.walls || { n: true, e: true, s: true, w: true };
        room.walls[wall] = room.walls[wall] === false;
        render();
        return;
      }
      const remove = event.target.closest("[data-remove-opening]");
      if (remove) {
        state.layout.openings = state.layout.openings.filter((o) => o.id !== remove.dataset.removeOpening);
        render();
        return;
      }
      const add = event.target.closest("[data-add-opening]");
      if (add) {
        const room = state.layout.rooms.find((r) => r.id === state.selectedRoomId);
        if (!room) return;
        const type = add.dataset.addOpening === "window" ? "window" : "door";
        addOpening(room, type);
        render();
      }
    });
    api.body.querySelector("#openingEditor")?.addEventListener("change", (event) => {
      const select = event.target.closest("[data-opening-wall]");
      if (!select) return;
      const opening = state.layout.openings.find((o) => o.id === select.dataset.openingWall);
      const room = state.layout.rooms.find((r) => r.id === opening?.roomId);
      if (!opening || !room) return;
      opening.wall = select.value;
      const wallLength = opening.wall === "n" || opening.wall === "s" ? room.w : room.h;
      opening.width = Math.min(opening.width, Math.max(0.3, wallLength - 0.1));
      opening.offset = clamp(opening.offset, 0, Math.max(0, wallLength - opening.width));
      render();
    });
  }

  function sizeReviewCanvas() {
    if (!reviewCanvas || !state.layout || !state.imageWidth) return;
    const stage = reviewCanvas.parentElement;
    const width = Math.max(260, stage?.clientWidth || 520);
    const aspect = state.imageHeight / state.imageWidth;
    let w = width;
    let h = width * aspect;
    if (h > 440) {
      h = 440;
      w = h / aspect;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    reviewCanvas.width = Math.round(w * dpr);
    reviewCanvas.height = Math.round(h * dpr);
    reviewCanvas.style.height = `${Math.round(h)}px`;
    reviewCanvas.style.width = `${Math.round(w)}px`;
    reviewCanvas._dpr = dpr;
    drawReview();
  }

  function reviewFit() {
    const canvas = reviewCanvas;
    const cw = canvas.width / (canvas._dpr || 1);
    const ch = canvas.height / (canvas._dpr || 1);
    const pw = state.layout.planWidth;
    const ph = state.layout.planHeight;
    const scale = Math.min((cw - 20) / pw, (ch - 20) / ph);
    return { cw, ch, scale, ox: (cw - pw * scale) / 2, oy: (ch - ph * scale) / 2 };
  }

  function drawReview() {
    if (!reviewCanvas || !state.layout || !state.dataUrl) return;
    const canvas = reviewCanvas;
    const ctx = canvas.getContext("2d");
    const dpr = canvas._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fit = reviewFit();
    const { cw, ch } = fit;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#fbf9f4";
    ctx.fillRect(0, 0, cw, ch);
    const image = new Image();
    image.onload = () => {
      // Draw once the image is cached; the browser will hit cache on later draws.
      ctx.globalAlpha = 0.55;
      ctx.drawImage(image, fit.ox, fit.oy, state.layout.planWidth * fit.scale, state.layout.planHeight * fit.scale);
      ctx.globalAlpha = 1;
      for (const room of state.layout.rooms) {
        const x = fit.ox + room.x * fit.scale;
        const y = fit.oy + room.y * fit.scale;
        const w = room.w * fit.scale;
        const h = room.h * fit.scale;
        const selected = room.id === state.selectedRoomId;
        ctx.fillStyle = selected ? "rgba(169, 94, 63, 0.18)" : "rgba(120, 130, 112, 0.12)";
        ctx.fillRect(x, y, w, h);
        const walls = room.walls || { n: true, e: true, s: true, w: true };
        const edges = [
          { wall: "n", x1: x, y1: y, x2: x + w, y2: y },
          { wall: "e", x1: x + w, y1: y, x2: x + w, y2: y + h },
          { wall: "s", x1: x, y1: y + h, x2: x + w, y2: y + h },
          { wall: "w", x1: x, y1: y, x2: x, y2: y + h },
        ];
        for (const edge of edges) {
          const open = walls[edge.wall] === false;
          ctx.strokeStyle = selected ? "#a95e3f" : "#3c3931";
          ctx.lineWidth = open ? 1.1 : selected ? 2.4 : 1.5;
          ctx.setLineDash(open ? [5, 4] : []);
          ctx.globalAlpha = open ? 0.5 : 1;
          ctx.beginPath();
          ctx.moveTo(edge.x1, edge.y1);
          ctx.lineTo(edge.x2, edge.y2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = selected ? "#86452b" : "#3c3931";
        ctx.font = "600 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(room.name, x + w / 2, y + h / 2, Math.max(20, w - 10));
      }
      for (const opening of state.layout.openings) {
        const room = state.layout.rooms.find((r) => r.id === opening.roomId);
        if (!room) continue;
        drawReviewOpening(ctx, opening, room, fit);
      }
    };
    image.src = state.dataUrl;
  }

  function drawReviewOpening(ctx, opening, room, fit) {
    let sx;
    let sy;
    let ex;
    let ey;
    if (opening.wall === "n") {
      sx = room.x; sy = room.y; ex = room.x + room.w; ey = room.y;
    } else if (opening.wall === "s") {
      sx = room.x; sy = room.y + room.h; ex = room.x + room.w; ey = room.y + room.h;
    } else if (opening.wall === "w") {
      sx = room.x; sy = room.y; ex = room.x; ey = room.y + room.h;
    } else {
      sx = room.x + room.w; sy = room.y; ex = room.x + room.w; ey = room.y + room.h;
    }
    const horizontal = opening.wall === "n" || opening.wall === "s";
    const dx = horizontal ? 1 : 0;
    const dy = horizontal ? 0 : 1;
    const ax = fit.ox + (sx + dx * opening.offset) * fit.scale;
    const ay = fit.oy + (sy + dy * opening.offset) * fit.scale;
    const bx = fit.ox + (sx + dx * (opening.offset + opening.width)) * fit.scale;
    const by = fit.oy + (sy + dy * (opening.offset + opening.width)) * fit.scale;
    ctx.strokeStyle = "#fbf9f4";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = opening.type === "window" ? "#5b7c86" : "#3c3931";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function hitRoom(event) {
    if (!reviewCanvas) return null;
    const rect = reviewCanvas.getBoundingClientRect();
    const fit = reviewFit();
    const px = ((event.clientX - rect.left) / rect.width) * (reviewCanvas.width / (reviewCanvas._dpr || 1));
    const py = ((event.clientY - rect.top) / rect.height) * (reviewCanvas.height / (reviewCanvas._dpr || 1));
    const x = (px - fit.ox) / fit.scale;
    const y = (py - fit.oy) / fit.scale;
    for (let i = state.layout.rooms.length - 1; i >= 0; i -= 1) {
      const room = state.layout.rooms[i];
      if (x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h) return room;
    }
    return null;
  }

  function removeRoom(roomId) {
    if (state.layout.rooms.length <= 1) {
      toast("Keep at least one room", { detail: "Add another room before removing this one.", tone: "error" });
      return;
    }
    state.layout.rooms = state.layout.rooms.filter((r) => r.id !== roomId);
    state.layout.openings = state.layout.openings.filter((o) => o.roomId !== roomId);
    state.selectedRoomId = state.layout.rooms[0]?.id || null;
    render();
  }

  function addOpening(room, type) {
    const widthMeters = 0.9;
    const mpu = state.calibration?.metersPerUnit || null;
    const wallLength = room.w;
    const width = clamp(
      mpu ? widthMeters / mpu : wallLength * 0.12,
      0.2,
      wallLength * 0.6
    );
    const opening = {
      id: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      roomId: room.id,
      type,
      wall: "n",
      offset: (wallLength - width) / 2,
      width,
      height: type === "window" ? 1.35 : 2.05,
      sill: type === "window" ? 0.85 : 0,
      confidence: 1,
    };
    state.layout.openings.push(opening);
  }

  function confirmLayout() {
    if (!state.layout?.rooms?.length) return;
    const rooms = state.layout.rooms.map((room, index) => ({
      ...room,
      name: room.name?.trim() || `Room ${index + 1}`,
      w: Math.max(0.3, room.w),
      h: Math.max(0.3, room.h),
      x: clamp(room.x, 0, Math.max(0, state.layout.planWidth - room.w)),
      y: clamp(room.y, 0, Math.max(0, state.layout.planHeight - room.h)),
    }));
    const project = buildUploadedProject({
      name: state.projectName || state.fileName || "Uploaded plan",
      dataUrl: state.dataUrl,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight,
      rooms,
      openings: state.layout.openings,
      metersPerUnit: state.calibration?.metersPerUnit || null,
      scaleReference: state.calibration?.reference || null,
    });
    project.unitSystem = store.project.unitSystem;
  if (state.isPdf) {
    project.plan = { ...project.plan, name: `${state.projectName} — page ${state.pdfPage}` };
  }
    store.replaceProject(project, { source: "upload" });
    store.setMobileView("3d");
    api.close();
    toast("Plan opened in 3D", {
      detail: state.calibration?.metersPerUnit
        ? "Scale calibrated. Review outlines are marked as estimates until edited."
        : "Dimensions are in plan units until you calibrate the scale.",
      tone: "success",
    });
  }

  api = openModal({
    kicker: "New project",
    title: "Start from a floor plan",
    subtitle: "Upload a plan, set its scale, then review the detected layout.",
    size: "md",
    body: "",
    footer: "",
    onMount: (mounted) => {
      api = mounted;
      render();
    },
    onClose: () => {
      picker?.destroy();
      window.removeEventListener("resize", sizeReviewCanvas);
    },
  });

  return api;
}
