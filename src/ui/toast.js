import { icon } from "./icons.js";
import { escapeHtml } from "../util.js";

let counter = 0;

export function toast(title, options = {}) {
  const host = document.getElementById("toasts");
  if (!host) return () => {};
  const { detail = "", tone = "info", actionLabel = "", onAction = null, duration = 4200 } = options;
  const id = `toast-${++counter}`;
  const el = document.createElement("div");
  el.className = "toast";
  el.dataset.tone = tone;
  el.id = id;
  const iconName = tone === "error" ? "warn" : tone === "success" ? "checkCircle" : "info";
  el.innerHTML = `
    ${icon(iconName, 15)}
    <div class="toast-body">
      <strong>${escapeHtml(title)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
    </div>
    ${actionLabel ? `<button type="button" data-action>${escapeHtml(actionLabel)}</button>` : ""}
    <button type="button" class="toast-close" aria-label="Dismiss">${icon("close", 13)}</button>
  `;
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild?.remove();

  let timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "opacity 160ms ease, transform 160ms ease";
    setTimeout(() => el.remove(), 180);
  }

  el.querySelector(".toast-close").addEventListener("click", dismiss);
  const actionBtn = el.querySelector("[data-action]");
  if (actionBtn) {
    actionBtn.addEventListener("click", () => {
      dismiss();
      onAction?.();
    });
  }
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => {
    timer = setTimeout(dismiss, 1400);
  });
  return dismiss;
}
