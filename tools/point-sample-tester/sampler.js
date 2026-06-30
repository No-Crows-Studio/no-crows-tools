const stage = document.getElementById('stage');
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const hintEl = document.getElementById('stage-hint');
const imageFile = document.getElementById('image-file');
const pixelInput = document.getElementById('pixel-size');
const pixelVal = document.getElementById('pixel-val');
const shapeSelect = document.getElementById('shape');
const quantToggle = document.getElementById('quantize');
const colorsRow = document.getElementById('colors-row');
const colorsInput = document.getElementById('colors');
const colorsVal = document.getElementById('colors-val');

const scene = document.createElement('canvas');
const sctx = scene.getContext('2d', { willReadFrequently: true });

const TAU = Math.PI * 2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const MIN_DISPLAY = 24;   // smallest displayed side of an image, in world px
const SNAP_RAD = 0.12;    // rotation snap window in radians
const HANDLE_R = 9;       // handle hit radius in screen px
const ROT_DIST = 26;      // rotate handle distance above the top edge, in screen px
const ALPHA_THRESH = 8;   // skip cells whose sampled alpha is below this

const images = []; // { id, img, url, x, y, scale, rotation }
const params = { pixelSize: 8, shape: 'square', quantize: false, colors: 16 };

let idSeq = 0;
let selectedId = null;
let drag = null;
let zoom = 1;
let panX = 0;
let panY = 0;
let rafId = 0;

// clamps a number to a range
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// returns the currently selected image record, or null
function findSelected() {
  return images.find(im => im.id === selectedId) || null;
}

// converts a pointer event to canvas-local coordinates
function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// converts a canvas-local point to world coordinates, undoing pan and zoom
function toWorld(p) {
  return { x: (p.x - panX) / zoom, y: (p.y - panY) / zoom };
}

// returns the distance between two points
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// returns an image's half-diagonal in its own pixels
function halfDiagOf(im) {
  return Math.hypot(im.img.naturalWidth / 2, im.img.naturalHeight / 2);
}

// reports whether a world point falls inside an image's transformed bounds
function pointInImage(im, wx, wy) {
  const dx = wx - im.x;
  const dy = wy - im.y;
  const cos = Math.cos(im.rotation);
  const sin = Math.sin(im.rotation);
  const lx = (dx * cos + dy * sin) / im.scale;
  const ly = (-dx * sin + dy * cos) / im.scale;
  return Math.abs(lx) <= im.img.naturalWidth / 2 && Math.abs(ly) <= im.img.naturalHeight / 2;
}

// returns screen-space geometry for an image's selection box and handles
function imageGeometry(im) {
  const hw = im.img.naturalWidth / 2;
  const hh = im.img.naturalHeight / 2;
  const cos = Math.cos(im.rotation);
  const sin = Math.sin(im.rotation);
  const toScreen = (lx, ly) => {
    const sx = lx * im.scale;
    const sy = ly * im.scale;
    const wx = im.x + sx * cos - sy * sin;
    const wy = im.y + sx * sin + sy * cos;
    return { x: wx * zoom + panX, y: wy * zoom + panY };
  };
  const corners = [toScreen(-hw, -hh), toScreen(hw, -hh), toScreen(hw, hh), toScreen(-hw, hh)];
  const topMid = toScreen(0, -hh);
  const ux = sin;
  const uy = -cos;
  const rotate = { x: topMid.x + ux * ROT_DIST, y: topMid.y + uy * ROT_DIST };
  return { corners, resize: corners[2], topMid, rotate };
}

// schedules a single render on the next animation frame
function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(render);
}

// redraws the scene as point-sampled cells plus the selection overlay
function render() {
  rafId = 0;
  const W = canvas.width;
  const H = canvas.height;

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, W, H);
  sctx.save();
  sctx.translate(panX, panY);
  sctx.scale(zoom, zoom);
  images.forEach(im => {
    const w = im.img.naturalWidth;
    const h = im.img.naturalHeight;
    sctx.save();
    sctx.translate(im.x, im.y);
    sctx.rotate(im.rotation);
    sctx.scale(im.scale, im.scale);
    sctx.drawImage(im.img, -w / 2, -h / 2, w, h);
    sctx.restore();
  });
  sctx.restore();

  const cells = sampleCells(W, H);
  if (params.quantize && cells.length) {
    const pal = quantizePalette(cells.map(c => [c.r, c.g, c.b]), clamp(params.colors, 1, 64));
    cells.forEach(c => {
      const p = nearest(pal, c.r, c.g, c.b);
      c.r = p[0];
      c.g = p[1];
      c.b = p[2];
    });
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawCells(cells);
  drawSelection();
  hintEl.hidden = images.length > 0;
}

// samples one or more colored cells per grid square from the rendered scene
function sampleCells(W, H) {
  const src = sctx.getImageData(0, 0, W, H).data;
  const step = Math.max(1, Math.round(params.pixelSize));
  const cells = [];
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (params.shape === 'triangle') addTriangleCells(cells, src, W, H, x, y, step);
      else addSquareCell(cells, src, W, H, x, y, step);
    }
  }
  return cells;
}

// reads the color at a point, returning null if it is too transparent
function sampleAt(src, W, H, sx, sy) {
  const px = Math.min(W - 1, Math.max(0, sx | 0));
  const py = Math.min(H - 1, Math.max(0, sy | 0));
  const i = (py * W + px) * 4;
  if (src[i + 3] < ALPHA_THRESH) return null;
  return { r: src[i], g: src[i + 1], b: src[i + 2] };
}

// adds one square cell sampled at its center
function addSquareCell(cells, src, W, H, x, y, step) {
  const c = sampleAt(src, W, H, x + step / 2, y + step / 2);
  if (!c) return;
  cells.push({ rect: { x, y, s: step }, r: c.r, g: c.g, b: c.b });
}

// splits a square into two right triangles, each sampled at its own centroid
function addTriangleCells(cells, src, W, H, x, y, step) {
  const x1 = x + step;
  const y1 = y + step;
  const upper = sampleAt(src, W, H, x + step * 2 / 3, y + step / 3);
  if (upper) cells.push({ poly: [[x, y], [x1, y], [x1, y1]], r: upper.r, g: upper.g, b: upper.b });
  const lower = sampleAt(src, W, H, x + step / 3, y + step * 2 / 3);
  if (lower) cells.push({ poly: [[x, y], [x1, y1], [x, y1]], r: lower.r, g: lower.g, b: lower.b });
}

// draws each sampled cell as a filled square or triangle, stroking in the same
// color so anti-aliased edges of neighbors overlap with no visible seams
function drawCells(cells) {
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  cells.forEach(c => {
    const color = `rgb(${c.r},${c.g},${c.b})`;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (c.poly) {
      ctx.beginPath();
      ctx.moveTo(c.poly[0][0], c.poly[0][1]);
      ctx.lineTo(c.poly[1][0], c.poly[1][1]);
      ctx.lineTo(c.poly[2][0], c.poly[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(c.rect.x, c.rect.y, c.rect.s, c.rect.s);
      ctx.strokeRect(c.rect.x, c.rect.y, c.rect.s, c.rect.s);
    }
  });
}

// draws the selection box, resize handle, and rotate handle for the selection
function drawSelection() {
  const im = findSelected();
  if (!im) return;
  const g = imageGeometry(im);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#3a6bff';
  ctx.fillStyle = '#3a6bff';
  ctx.beginPath();
  ctx.moveTo(g.corners[0].x, g.corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(g.corners[i].x, g.corners[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(g.topMid.x, g.topMid.y);
  ctx.lineTo(g.rotate.x, g.rotate.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(g.rotate.x, g.rotate.y, 5, 0, TAU);
  ctx.fill();
  ctx.fillRect(g.resize.x - 5, g.resize.y - 5, 10, 10);
}

// builds an n-color palette from rgb triples using median cut
function quantizePalette(colors, n) {
  let buckets = [colors];
  while (buckets.length < n) {
    let bi = -1;
    let bestRange = -1;
    let bestCh = 0;
    buckets.forEach((b, i) => {
      if (b.length < 2) return;
      const rng = ranges(b);
      const m = Math.max(rng[0], rng[1], rng[2]);
      if (m > bestRange) {
        bestRange = m;
        bi = i;
        bestCh = rng[0] >= rng[1] && rng[0] >= rng[2] ? 0 : (rng[1] >= rng[2] ? 1 : 2);
      }
    });
    if (bi < 0 || bestRange <= 0) break;
    const b = buckets[bi];
    b.sort((p, q) => p[bestCh] - q[bestCh]);
    const mid = b.length >> 1;
    buckets.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return buckets.map(average);
}

// returns the r, g, b spans of a bucket of colors
function ranges(b) {
  let rmin = 255;
  let gmin = 255;
  let bmin = 255;
  let rmax = 0;
  let gmax = 0;
  let bmax = 0;
  b.forEach(p => {
    rmin = Math.min(rmin, p[0]);
    gmin = Math.min(gmin, p[1]);
    bmin = Math.min(bmin, p[2]);
    rmax = Math.max(rmax, p[0]);
    gmax = Math.max(gmax, p[1]);
    bmax = Math.max(bmax, p[2]);
  });
  return [rmax - rmin, gmax - gmin, bmax - bmin];
}

// returns the average color of a bucket
function average(b) {
  let r = 0;
  let g = 0;
  let bl = 0;
  b.forEach(p => {
    r += p[0];
    g += p[1];
    bl += p[2];
  });
  const n = b.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
}

// returns the palette color nearest to an rgb value
function nearest(pal, r, g, b) {
  let best = pal[0];
  let bd = Infinity;
  for (const p of pal) {
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

// loads each selected file as an image on the canvas
function addImagesFromFiles(list) {
  Array.from(list).filter(f => f.type.startsWith('image/')).forEach(file => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => addImage(img, url);
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
}

// adds a loaded image centered in the current view and selects it
function addImage(img, url) {
  const cx = (canvas.width / 2 - panX) / zoom;
  const cy = (canvas.height / 2 - panY) / zoom;
  const fit = Math.min(1, 0.6 * Math.min(canvas.width, canvas.height) /
    Math.max(img.naturalWidth, img.naturalHeight));
  const im = { id: ++idSeq, img, url, x: cx, y: cy, scale: fit, rotation: 0 };
  images.push(im);
  selectedId = im.id;
  scheduleRender();
}

// removes the selected image and frees its object url
function deleteSelected() {
  const i = images.findIndex(im => im.id === selectedId);
  if (i < 0) return;
  URL.revokeObjectURL(images[i].url);
  images.splice(i, 1);
  selectedId = null;
  scheduleRender();
}

// resizes the canvas and scene buffer to match the stage
function resizeCanvas() {
  const r = stage.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width));
  canvas.height = Math.max(1, Math.round(r.height));
  scene.width = canvas.width;
  scene.height = canvas.height;
  scheduleRender();
}

// attaches the window drag listeners and sets the drag cursor
function startDrag() {
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.style.cursor = drag.mode === 'pan' ? 'grabbing' : 'default';
}

// updates the active drag based on pointer motion
function onMove(e) {
  if (!drag) return;
  const p = localPoint(e);
  if (drag.mode === 'pan') {
    panX = drag.opx + (p.x - drag.sx);
    panY = drag.opy + (p.y - drag.sy);
    scheduleRender();
    return;
  }
  const im = findSelected();
  if (!im) return;
  const w = toWorld(p);
  if (drag.mode === 'move') {
    im.x = drag.ox + (w.x - drag.startWx);
    im.y = drag.oy + (w.y - drag.startWy);
  } else if (drag.mode === 'resize') {
    const minScale = MIN_DISPLAY / Math.min(im.img.naturalWidth, im.img.naturalHeight);
    im.scale = Math.max(minScale, dist(w, { x: im.x, y: im.y }) / drag.halfDiag);
  } else if (drag.mode === 'rotate') {
    let a = Math.atan2(w.y - im.y, w.x - im.x) + Math.PI / 2;
    const snapped = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(a - snapped) < SNAP_RAD) a = snapped;
    im.rotation = a;
  }
  scheduleRender();
}

// ends the active drag and detaches the window listeners
function onUp() {
  drag = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  canvas.style.cursor = 'default';
}

canvas.addEventListener('mousedown', e => {
  if (e.button === 1) e.preventDefault();
});

canvas.addEventListener('pointerdown', e => {
  const p = localPoint(e);
  if (e.button === 1) {
    e.preventDefault();
    drag = { mode: 'pan', sx: p.x, sy: p.y, opx: panX, opy: panY };
    startDrag();
    return;
  }
  if (e.button !== 0) return;
  const sel = findSelected();
  if (sel) {
    const g = imageGeometry(sel);
    if (dist(p, g.rotate) <= HANDLE_R) {
      drag = { mode: 'rotate' };
      startDrag();
      return;
    }
    if (dist(p, g.resize) <= HANDLE_R) {
      drag = { mode: 'resize', halfDiag: halfDiagOf(sel) };
      startDrag();
      return;
    }
  }
  const w = toWorld(p);
  for (let i = images.length - 1; i >= 0; i--) {
    if (pointInImage(images[i], w.x, w.y)) {
      selectedId = images[i].id;
      drag = { mode: 'move', startWx: w.x, startWy: w.y, ox: images[i].x, oy: images[i].y };
      startDrag();
      scheduleRender();
      return;
    }
  }
  selectedId = null;
  scheduleRender();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const p = localPoint(e);
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const wx = (p.x - panX) / zoom;
  const wy = (p.y - panY) / zoom;
  zoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
  panX = p.x - wx * zoom;
  panY = p.y - wy * zoom;
  scheduleRender();
}, { passive: false });

document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId != null) {
    e.preventDefault();
    deleteSelected();
  }
});

document.getElementById('add-image').addEventListener('click', () => imageFile.click());
imageFile.addEventListener('change', e => {
  addImagesFromFiles(e.target.files);
  imageFile.value = '';
});

document.getElementById('delete-image').addEventListener('click', deleteSelected);

document.getElementById('reset-view').addEventListener('click', () => {
  zoom = 1;
  panX = 0;
  panY = 0;
  scheduleRender();
});

pixelInput.addEventListener('input', () => {
  params.pixelSize = +pixelInput.value;
  pixelVal.textContent = params.pixelSize;
  scheduleRender();
});

shapeSelect.addEventListener('change', () => {
  params.shape = shapeSelect.value;
  scheduleRender();
});

quantToggle.addEventListener('change', () => {
  params.quantize = quantToggle.checked;
  colorsInput.disabled = !params.quantize;
  colorsRow.classList.toggle('disabled', !params.quantize);
  scheduleRender();
});

colorsInput.addEventListener('input', () => {
  params.colors = +colorsInput.value;
  colorsVal.textContent = params.colors;
  scheduleRender();
});

new ResizeObserver(resizeCanvas).observe(stage);
resizeCanvas();
