import { store } from "../store.js";
import { loadImage } from "../ai/plan.js";
import { formatLength, metersPerUnit } from "../model/units.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { ScalePicker } from "./scalePicker.js";
import { toast } from "./toast.js";

const FT = 0.3048;

export function openCalibrationModal() {
  const project = store.project;
  let picker = null;
  if (!project.plan?.src) {
    openModal({
      size: "sm",
      kicker: "Scale calibration",
      title: "This plan is already scaled",
      subtitle:
        "The built-in sample is drawn at a known scale (one plan unit = one metre), so its dimensions are calibrated. Upload a plan image to set a custom scale.",
      body: `
        <div class="measure-summary">
          ${icon("ruler", 14)}
          <span>Current scale: ${formatLength(1, { ...project, scale: { calibrated: true, metersPerUnit: 1 } })} per plan unit.</span>
        </div>
      `,
      footer: `<span class="spacer"></span><button type="button" class="btn btn-primary" data-close>Got it</button>`,
    });
    return;
  }

  const modal = openModal({
    size: "md",
    kicker: "Scale calibration",
    title: "Measure a known distance",
    subtitle:
      "Choose two points on a wall or known dimension, then enter its real length. This calibrates every room; outlines remain editable.",
    body: `
      <div class="plan-stage" style="min-height:320px">
        <canvas id="calibrateCanvas" aria-label="Plan image with two-point scale picker" style="width:100%;height:340px;cursor:crosshair"></canvas>
        <div class="calib-hint">Click two points with a known real-world distance</div>
      </div>
      <p class="hint-text">Tip: pick the longest dimension you can measure accurately. Distances are shown as image pixels until calibrated.</p>
      <div class="field-grid" style="margin-top:12px">
        <div class="field">
          <label for="knownLength">Known length</label>
          <input id="knownLength" class="input" type="number" min="0.1" step="0.1" value="5" autofocus />
        </div>
        <div class="field">
          <label for="knownUnit">Unit</label>
          <select id="knownUnit" class="input">
            <option value="m">Metres</option>
            <option value="ft">Feet</option>
          </select>
        </div>
      </div>
      <div id="calibratePreview" class="measure-summary" style="margin-top:10px">
        ${icon("info", 14)}
        <span>Set two points to calculate the scale.</span>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-quiet" id="resetPoints">Reset points</button>
      </div>
    `,
    footer: `
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" id="applyCalibration">Apply scale</button>
    `,
    onMount: async (api) => {
      const canvas = api.body.querySelector("#calibrateCanvas");
      const lengthInput = api.body.querySelector("#knownLength");
      const unitInput = api.body.querySelector("#knownUnit");
      const preview = api.body.querySelector("#calibratePreview");
      const applyBtn = api.footer.querySelector("#applyCalibration");
      picker = null;

      const update = (state) => {
        const known = Number(lengthInput.value);
        const knownMeters = unitInput.value === "ft" ? known * FT : known;
        const hasDistance = state?.complete && state.sourceDistance > 2;
        applyBtn.disabled = !hasDistance || !Number.isFinite(knownMeters) || knownMeters <= 0;
        if (!hasDistance) {
          preview.dataset.tone = "";
          preview.innerHTML = `${icon("info", 14)}<span>Set two points to calculate the scale.</span>`;
          return;
        }
        const mpu = knownMeters / (state.sourceDistance / 100);
        preview.dataset.tone = "warn";
        preview.innerHTML = `${icon("ruler", 14)}<span>${state.sourceDistance.toFixed(0)} px ≈ ${knownMeters.toFixed(2)} m. That makes one plan unit ≈ ${mpu.toFixed(3)} m. Rooms currently sized in plan units will be interpreted with this scale.</span>`;
      };

      try {
        const image = await loadImage(project.plan.src);
        picker = new ScalePicker(canvas, { onChange: update });
        picker.setImage(image);
      } catch (error) {
        api.body.innerHTML = `<div class="notice" data-tone="warn">${icon("warn", 15)}<div>${error.message}</div></div>`;
      }

      lengthInput.addEventListener("input", () => update(picker?.getState()));
      unitInput.addEventListener("change", () => update(picker?.getState()));
      api.body.querySelector("#resetPoints").addEventListener("click", () => picker?.reset());
      applyBtn.addEventListener("click", () => {
        const state = picker?.getState();
        if (!state?.complete) return;
        const known = Number(lengthInput.value);
        const knownMeters = unitInput.value === "ft" ? known * FT : known;
        if (!Number.isFinite(knownMeters) || knownMeters <= 0) return;
        const newMpu = knownMeters / (state.sourceDistance / 100);
        store.commit(
          "Calibrate plan scale",
          (draft) => {
            draft.scale = {
              calibrated: true,
              metersPerUnit: newMpu,
              reference: {
                label: "Two-point calibration",
                meters: knownMeters,
                pixels: state.sourceDistance,
              },
            };
          },
          { history: true }
        );
        toast("Scale calibrated", {
          detail: `One plan unit ≈ ${newMpu.toFixed(3)} m. Dimensions now use real-world units.`,
          tone: "success",
        });
        picker?.destroy();
        api.close();
      });
    },
    onClose: () => {
      picker?.destroy();
    },
  });
  return modal;
}
