/**
 * Two-point scale picker for a plan image. Distances are reported in source
 * image pixels so calibration is independent of how the canvas is displayed.
 */
export class ScalePicker {
  constructor(canvas, { onChange = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onChange = onChange;
    this.image = null;
    this.points = [];
    this.hoverPoint = null;
    this.fit = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onResize = this._onResize.bind(this);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    this.resizeObserver = new ResizeObserver(this._onResize);
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this._onResize();
  }

  setImage(image) {
    this.image = image;
    this.points = [];
    this.hoverPoint = null;
    this._onResize();
    this.onChange?.(this.getState());
  }

  reset() {
    this.points = [];
    this.hoverPoint = null;
    this._draw();
    this.onChange?.(this.getState());
  }

  getState() {
    const [a, b] = this.points;
    let sourceDistance = null;
    if (a && b) {
      sourceDistance = Math.hypot(b.x - a.x, b.y - a.y);
    }
    return { points: this.points.length, sourceDistance, complete: this.points.length === 2 };
  }

  _onResize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw();
  }

  _layout() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!this.image) return { w, h, scale: 1, ox: 0, oy: 0, iw: 1, ih: 1 };
    const iw = this.image.naturalWidth || this.image.width;
    const ih = this.image.naturalHeight || this.image.height;
    const scale = Math.min((w - 20) / iw, (h - 20) / ih);
    return {
      w,
      h,
      scale,
      ox: (w - iw * scale) / 2,
      oy: (h - ih * scale) / 2,
      iw,
      ih,
    };
  }

  _toSource(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const fit = this._layout();
    return {
      x: (clientX - rect.left - fit.ox) / fit.scale,
      y: (clientY - rect.top - fit.oy) / fit.scale,
    };
  }

  _onPointerDown(event) {
    if (!this.image) return;
    event.preventDefault();
    const point = this._toSource(event.clientX, event.clientY);
    const fit = this._layout();
    if (point.x < 0 || point.y < 0 || point.x > fit.iw || point.y > fit.ih) return;
    if (this.points.length !== 1) this.points = [point];
    else this.points.push(point);
    this._draw();
    this.onChange?.(this.getState());
  }

  _onPointerMove(event) {
    if (!this.image) return;
    this.hoverPoint = this._toSource(event.clientX, event.clientY);
    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    const fit = this._layout();
    this.fit = fit;
    if (!ctx) return;
    ctx.clearRect(0, 0, fit.w, fit.h);
    ctx.fillStyle = "#f6f2e9";
    ctx.fillRect(0, 0, fit.w, fit.h);
    if (!this.image) {
      ctx.fillStyle = "rgba(95, 90, 80, 0.65)";
      ctx.font = "500 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Plan image unavailable", fit.w / 2, fit.h / 2);
      return;
    }
    ctx.drawImage(this.image, fit.ox, fit.oy, fit.iw * fit.scale, fit.ih * fit.scale);

    const screen = (p) => ({ x: fit.ox + p.x * fit.scale, y: fit.oy + p.y * fit.scale });
    if (this.points.length === 2) {
      const a = screen(this.points[0]);
      const b = screen(this.points[1]);
      ctx.strokeStyle = "#a95e3f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const label = `${Math.round(this.getState().sourceDistance)} px`;
      ctx.font = "600 10px 'JetBrains Mono', monospace";
      const width = ctx.measureText(label).width + 12;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.fillStyle = "rgba(251, 249, 244, 0.94)";
      ctx.strokeStyle = "rgba(169, 94, 63, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mx - width / 2, my - 22, width, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#86452b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, my - 14);
    }
    for (const point of this.points) {
      const p = screen(point);
      ctx.fillStyle = "#fbf9f4";
      ctx.strokeStyle = "#a95e3f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#a95e3f";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.points.length === 1 && this.hoverPoint) {
      const a = screen(this.points[0]);
      const b = screen(this.hoverPoint);
      ctx.strokeStyle = "rgba(169, 94, 63, 0.5)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
  }
}
