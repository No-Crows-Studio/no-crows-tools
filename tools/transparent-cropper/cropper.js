const dropEl = document.getElementById('drop');
const fileEl = document.getElementById('file');
const gridEl = document.getElementById('grid');
const emptyMsg = document.getElementById('emptyMsg');
const thresholdEl = document.getElementById('threshold');
const paddingEl = document.getElementById('padding');
const downloadAllBtn = document.getElementById('downloadAll');
const clearBtn = document.getElementById('clear');

const results = []; // { name, url }

dropEl.addEventListener('click', () => fileEl.click());
fileEl.addEventListener('change', e => handleFiles(e.target.files));

['dragenter', 'dragover'].forEach(ev =>
  dropEl.addEventListener(ev, e => { e.preventDefault(); dropEl.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev =>
  dropEl.addEventListener(ev, e => { e.preventDefault(); dropEl.classList.remove('drag'); }));
dropEl.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f =>
    f.type === 'image/png' || /\.png$/i.test(f.name));
  files.forEach(processFile);
}

function baseName(name) {
  return name.replace(/\.png$/i, '');
}

function clampInt(val, min, max, fallback) {
  let n = parseInt(val, 10);
  if (isNaN(n)) n = fallback;
  return Math.min(max, Math.max(min, n));
}

async function processFile(file) {
  const threshold = clampInt(thresholdEl.value, 0, 255, 0);
  const padding = clampInt(paddingEl.value, 0, 100000, 0);

  const img = await loadImage(file);
  const w = img.naturalWidth, h = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, w, h).data;

  // Find tight bounds of pixels with alpha above the threshold.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const outName = baseName(file.name) + '_tcropped.png';

  // Fully transparent: nothing to keep, emit a 1x1 transparent pixel.
  if (maxX < 0) {
    const blank = document.createElement('canvas');
    blank.width = 1; blank.height = 1;
    const blob = await canvasToBlob(blank);
    addResult(outName, blob, { orig: [w, h], crop: [1, 1], note: 'fully transparent' });
    return;
  }

  // Apply padding, clamped to the original bounds.
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);

  const blob = await canvasToBlob(out);
  const unchanged = (cw === w && ch === h);
  addResult(outName, blob, { orig: [w, h], crop: [cw, ch], unchanged });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function addResult(name, blob, info) {
  const url = URL.createObjectURL(blob);
  results.push({ name, url });
  addCard(name, url, info);
  downloadAllBtn.disabled = false;
  clearBtn.disabled = false;
}

function addCard(name, url, info) {
  if (emptyMsg && emptyMsg.parentNode) emptyMsg.remove();

  const [ow, oh] = info.orig;
  const [cw, ch] = info.crop;
  let meta;
  if (info.note) meta = `${ow}×${oh} → ${info.note}`;
  else if (info.unchanged) meta = `${ow}×${oh} (no transparent border)`;
  else meta = `${ow}×${oh} → ${cw}×${ch}`;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    `<div class="thumb"><img src="${url}" alt=""></div>` +
    `<div class="name">${name}</div>` +
    `<div class="meta">${meta}</div>`;

  const dl = document.createElement('button');
  dl.textContent = 'Download';
  dl.onclick = () => downloadOne(name, url);
  card.appendChild(dl);

  gridEl.appendChild(card);
}

function downloadOne(name, url) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

downloadAllBtn.addEventListener('click', () => {
  results.forEach((r, i) => setTimeout(() => downloadOne(r.name, r.url), i * 120));
});

clearBtn.addEventListener('click', () => {
  results.forEach(r => URL.revokeObjectURL(r.url));
  results.length = 0;
  gridEl.innerHTML = '<p id="emptyMsg">No images yet.</p>';
  downloadAllBtn.disabled = true;
  clearBtn.disabled = true;
  fileEl.value = '';
});
