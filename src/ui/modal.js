import { escapeHtml } from "../util.js";
import { icon } from "./icons.js";

const stack = [];

function trapFocus(event, root) {
  const focusables = [
    ...root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openModal(options = {}) {
  const {
    kicker = "",
    title = "",
    subtitle = "",
    size = "",
    body = "",
    footer = "",
    dismissible = true,
    showClose = true,
    onMount = null,
    onClose = null,
  } = options;

  const previouslyFocused = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${size === "sm" ? "modal-sm" : size === "md" ? "modal-md" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title-${stack.length}">
      <div class="modal-head">
        <div class="modal-head-text">
          ${kicker ? `<div class="modal-kicker">${escapeHtml(kicker)}</div>` : ""}
          <h2 class="modal-title" id="modal-title-${stack.length}">${escapeHtml(title)}</h2>
          <p class="modal-subtitle" ${subtitle ? "" : "hidden"}>${subtitle}</p>
        </div>
        ${showClose ? `<button type="button" class="icon-btn" data-close aria-label="Close dialog">${icon("close", 16)}</button>` : ""}
      </div>
      <div class="modal-body"></div>
      <div class="modal-foot" ${footer ? "" : "hidden"}></div>
    </div>
  `;
  const root = backdrop.querySelector(".modal");
  const bodyEl = backdrop.querySelector(".modal-body");
  const footerEl = backdrop.querySelector(".modal-foot");
  const subtitleEl = backdrop.querySelector(".modal-subtitle");

  if (body instanceof Node) bodyEl.appendChild(body);
  else bodyEl.innerHTML = body;
  if (footer instanceof Node) footerEl.appendChild(footer);
  else footerEl.innerHTML = footer;

  document.getElementById("modalRoot").appendChild(backdrop);
  document.body.classList.add("modal-open");

  const entry = { backdrop, root, close, dismissible };
  stack.push(entry);

  function close(result) {
    if (!stack.includes(entry)) return;
    const index = stack.indexOf(entry);
    stack.splice(index, 1);
    backdrop.style.opacity = "0";
    backdrop.style.transition = "opacity 120ms ease";
    setTimeout(() => backdrop.remove(), 130);
    if (!stack.length) document.body.classList.remove("modal-open");
    previouslyFocused?.focus?.();
    onClose?.(result);
  }

  function setTitle(nextTitle, nextSubtitle = "") {
    const h = root.querySelector(".modal-title");
    if (h) h.textContent = nextTitle;
    if (subtitleEl) {
      subtitleEl.innerHTML = nextSubtitle;
      subtitleEl.hidden = !nextSubtitle;
    }
  }

  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop && dismissible) entry.close();
  });

  const keyHandler = (event) => {
    if (stack[stack.length - 1] !== entry) return;
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") trapFocus(event, root);
  };
  document.addEventListener("keydown", keyHandler);
  backdrop.addEventListener("remove", () => document.removeEventListener("keydown", keyHandler));

  // Clean up the key handler when this dialog is closed.
  const originalClose = entry.close;
  entry.close = (...args) => {
    document.removeEventListener("keydown", keyHandler);
    originalClose(...args);
  };
  // Ensure data-close uses the wrapped close.
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) entry.close();
  });

  const api = {
    root,
    body: bodyEl,
    footer: footerEl,
    close: (...args) => entry.close(...args),
    setTitle,
    backdrop,
  };
  onMount?.(api);

  setTimeout(() => {
    const focusTarget =
      root.querySelector("[autofocus]") ||
      root.querySelector("input:not([type=hidden]), textarea, select") ||
      root.querySelector(".modal-foot .btn-primary") ||
      root.querySelector("button");
    focusTarget?.focus?.();
  }, 30);

  return api;
}
