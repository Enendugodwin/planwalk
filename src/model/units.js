export const FEET_PER_METER = 3.280839895;
export const SQFT_PER_SQM = 10.76391042;

export function metersPerUnit(project) {
  const value = Number(project?.scale?.metersPerUnit);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function isCalibrated(project) {
  return Boolean(project?.scale?.calibrated);
}

export function usesPlanUnits(project) {
  return !isCalibrated(project);
}

export function unitSymbol(project) {
  if (usesPlanUnits(project)) return "u";
  return project?.unitSystem === "imperial" ? "ft" : "m";
}

export function unitsToMeters(units, project) {
  return Number(units || 0) * metersPerUnit(project);
}

export function metersToUnits(meters, project) {
  return Number(meters || 0) / metersPerUnit(project);
}

function trimZeros(value) {
  return String(value).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatLength(units, project, opts = {}) {
  const value = Number(units);
  if (!Number.isFinite(value)) return "—";
  if (!isCalibrated(project)) {
    return `${trimZeros(value.toFixed(opts.precision ?? 1))} u`;
  }
  const meters = value * metersPerUnit(project);
  if (project?.unitSystem === "imperial") {
    const feet = meters * FEET_PER_METER;
    const precision = feet < 10 ? (opts.precision ?? 1) : 0;
    return `${trimZeros(feet.toFixed(precision))} ft`;
  }
  let display;
  if (opts.centimeters && meters > 0 && meters < 1) {
    display = `${Math.round(meters * 100)} cm`;
  } else if (meters < 1) {
    display = `${trimZeros(meters.toFixed(2))} m`;
  } else if (meters < 10) {
    display = `${trimZeros(meters.toFixed(opts.precision ?? 2))} m`;
  } else {
    display = `${trimZeros(meters.toFixed(opts.precision ?? 1))} m`;
  }
  return display;
}

export function formatArea(unitsSq, project, opts = {}) {
  const value = Number(unitsSq);
  if (!Number.isFinite(value)) return "—";
  if (!isCalibrated(project)) {
    return `${trimZeros(value.toFixed(value < 10 ? 2 : 1))} u²`;
  }
  const factor = metersPerUnit(project) ** 2;
  const sqm = value * factor;
  if (project?.unitSystem === "imperial") {
    return `${trimZeros((sqm * SQFT_PER_SQM).toFixed(opts.precision ?? 0))} ft²`;
  }
  return `${trimZeros(sqm.toFixed(sqm < 10 ? 2 : (opts.precision ?? 1)))} m²`;
}

/** Ceiling heights are always authored in meters, independent of plan scale. */
export function formatCeiling(meters, project, opts = {}) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return "—";
  if (project?.unitSystem === "imperial") {
    return `${trimZeros((value * FEET_PER_METER).toFixed(opts.precision ?? 1))} ft`;
  }
  return `${trimZeros(value.toFixed(opts.precision ?? 2))} m`;
}

/** Parse a number typed in current display units into plan units. */
export function parseDisplayLength(value, project) {
  const num = Number(String(value).replace(",", "."));
  if (!Number.isFinite(num)) return null;
  if (!isCalibrated(project)) return num;
  const meters = project?.unitSystem === "imperial" ? num / FEET_PER_METER : num;
  return metersToUnits(meters, project);
}

/** Convert plan units into the current display number (m, ft or u). */
export function displayLengthNumber(units, project) {
  if (!isCalibrated(project)) return Number(units);
  const meters = units * metersPerUnit(project);
  return project?.unitSystem === "imperial" ? meters * FEET_PER_METER : meters;
}

export function parseCeiling(value, project) {
  const num = Number(String(value).replace(",", "."));
  if (!Number.isFinite(num)) return null;
  return project?.unitSystem === "imperial" ? num / FEET_PER_METER : num;
}

export function ceilingDisplayNumber(meters, project) {
  return project?.unitSystem === "imperial" ? meters * FEET_PER_METER : meters;
}

/** A round-number 2D scale bar that lands near a target pixel width. */
export function scaleBar(pxPerUnit, project, targetPx = 62) {
  const calibrated = isCalibrated(project);
  const imperial = project?.unitSystem === "imperial";
  const candidates = calibrated
    ? imperial
      ? [1, 2, 5, 10, 20, 50]
      : [0.5, 1, 2, 5, 10, 20]
    : [0.5, 1, 2, 5, 10, 20];

  let best = candidates[0];
  let bestDiff = Infinity;
  for (const display of candidates) {
    const units = calibrated
      ? imperial
        ? display / FEET_PER_METER / metersPerUnit(project)
        : display / metersPerUnit(project)
      : display;
    const px = units * pxPerUnit;
    if (px > 130) continue;
    const diff = Math.abs(px - targetPx);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = display;
    }
  }

  const units = calibrated
    ? imperial
      ? best / FEET_PER_METER / metersPerUnit(project)
      : best / metersPerUnit(project)
    : best;
  const label = calibrated
    ? `${trimZeros(String(best))} ${imperial ? "ft" : "m"}`
    : `${trimZeros(String(best))} u`;
  return { px: Math.max(18, units * pxPerUnit), label, display: best, units };
}

export function measurementLabel(status) {
  if (status === "calibrated") return "Calibrated";
  if (status === "edited") return "Manually edited";
  return "Estimated";
}

export { trimZeros };
