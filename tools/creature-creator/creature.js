const stageEl = document.getElementById('stage');
const worldEl = document.getElementById('world');
const linksEl = document.getElementById('links');
const stageHint = document.getElementById('stage-hint');
const limbFile = document.getElementById('limb-file');
const creatureFile = document.getElementById('creature-file');
const nameInput = document.getElementById('creature-name');
const limbListEl = document.getElementById('limb-list');
const jointListEl = document.getElementById('joint-list');
const connSection = document.getElementById('connections-section');
const connJointName = document.getElementById('conn-joint-name');
const connListEl = document.getElementById('conn-list');

const SVGNS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ARROW_STEPS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }
};

const limbs = [];  // { id, name, url, blob, x, y, width, height, hidden, el }
const joints = []; // { id, name, x, y, el, connections: Set<limbId> }

// reusable selection box and name label, kept above all sprites for the selected limb
const limbSel = document.createElement('div');
limbSel.className = 'limb-sel';
limbSel.hidden = true;
const limbLabel = document.createElement('span');
limbLabel.className = 'limb-label';
limbSel.appendChild(limbLabel);
worldEl.appendChild(limbSel);

let idSeq = 0;
let jointCount = 0;
let placeCount = 0;
let selectedLimb = null;
let selectedJoint = null;
let drag = null;

// view transform: world coords stay in true pixels, only the display scales
let zoom = 1;
let panX = 0;
let panY = 0;

// returns the next unique id
function nextId() {
  return ++idSeq;
}

// looks up a limb by id
function findLimb(id) {
  return limbs.find(l => l.id === id);
}

// looks up a joint by id
function findJoint(id) {
  return joints.find(j => j.id === id);
}

// converts a pointer event to world coordinates, undoing pan and zoom
function stagePoint(e) {
  const r = stageEl.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - panX) / zoom,
    y: (e.clientY - r.top - panY) / zoom
  };
}

// applies the current pan and zoom to the world layer
function applyView() {
  worldEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  joints.forEach(scaleJointEl);
}

// counter-scales a joint marker so it stays a fixed screen size while zooming
function scaleJointEl(joint) {
  joint.el.style.transform = `scale(${1 / zoom})`;
}

// clamps a number to a range
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// zooms toward a stage-local point, keeping the world point under it fixed
function zoomAt(localX, localY, factor) {
  const wx = (localX - panX) / zoom;
  const wy = (localY - panY) / zoom;
  zoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
  panX = localX - wx * zoom;
  panY = localY - wy * zoom;
  applyView();
}

// resets the view to a 1:1 pixel zoom at the origin
function resetView() {
  zoom = 1;
  panX = 0;
  panY = 0;
  applyView();
}

// loads each selected png as a limb
function addLimbsFromFiles(fileList) {
  const files = Array.from(fileList).filter(f =>
    f.type === 'image/png' || /\.png$/i.test(f.name));
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => createLimb(file.name, url, file, img.naturalWidth, img.naturalHeight);
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
}

// builds a limb element and record without inserting it into the layer list
function makeLimb(name, url, blob, w, h, x, y, hidden) {
  const el = document.createElement('img');
  el.className = 'limb';
  el.src = url;
  el.draggable = false;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  if (hidden) el.classList.add('hidden');

  const limb = { id: nextId(), name, url, blob, x, y, width: w, height: h, hidden, el };
  el.addEventListener('pointerdown', e => onItemPointerDown('limb', limb.id, e));
  worldEl.appendChild(el);
  positionLimbEl(limb);
  return limb;
}

// creates a limb on the stage as the new top layer and selects it
function createLimb(name, url, blob, w, h) {
  const x = 40 + (placeCount % 6) * 30;
  const y = 40 + (placeCount % 6) * 30;
  placeCount++;
  const limb = makeLimb(name, url, blob, w, h, x, y, false);
  limbs.unshift(limb);
  applyZOrder();
  renderLimbList();
  renderConnList();
  selectLimb(limb.id);
  updateHint();
}

// builds a joint element and record without inserting it into the joint list
function makeJoint(name, x, y) {
  const el = document.createElement('div');
  el.className = 'joint';
  el.innerHTML = '<span class="joint-dot"></span><span class="joint-label"></span>';
  el.querySelector('.joint-label').textContent = name;

  const joint = { id: nextId(), name, x, y, el, connections: new Set() };
  el.addEventListener('pointerdown', e => onItemPointerDown('joint', joint.id, e));
  worldEl.appendChild(el);
  positionJointEl(joint);
  return joint;
}

// creates a joint marker at the given stage coordinates and selects it
function createJoint(x, y) {
  jointCount++;
  const joint = makeJoint(`Joint ${jointCount}`, x, y);
  joints.push(joint);
  renderJointList();
  selectJoint(joint.id);
  updateHint();
}

// writes a limb's position to its element
function positionLimbEl(limb) {
  limb.el.style.left = limb.x + 'px';
  limb.el.style.top = limb.y + 'px';
  if (limb.id === selectedLimb) updateLimbLabel();
}

// positions the selection box and name label over the selected limb
function updateLimbLabel() {
  const l = selectedLimb != null ? findLimb(selectedLimb) : null;
  if (!l || l.hidden) {
    limbSel.hidden = true;
    return;
  }
  limbSel.hidden = false;
  limbSel.style.left = l.x + 'px';
  limbSel.style.top = l.y + 'px';
  limbSel.style.width = l.width + 'px';
  limbSel.style.height = l.height + 'px';
  limbLabel.textContent = l.name;
  limbLabel.title = l.name;
}

// writes a joint's position to its element
function positionJointEl(joint) {
  joint.el.style.left = joint.x + 'px';
  joint.el.style.top = joint.y + 'px';
  scaleJointEl(joint);
}

// reassigns z-index so the top of the list is the top layer
function applyZOrder() {
  limbs.forEach((l, i) => { l.el.style.zIndex = limbs.length - i; });
}

// moves a limb one step forward or back in stacking order
function reorderLimb(id, dir) {
  const i = limbs.findIndex(l => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= limbs.length) return;
  [limbs[i], limbs[j]] = [limbs[j], limbs[i]];
  applyZOrder();
  renderLimbList();
}

// toggles a limb's hidden state, deselecting it when it becomes hidden
function toggleLimbHidden(id) {
  const limb = findLimb(id);
  if (!limb) return;
  limb.hidden = !limb.hidden;
  limb.el.classList.toggle('hidden', limb.hidden);
  if (limb.hidden && selectedLimb === id) {
    selectedLimb = null;
    updateSelectionStyles();
  }
  renderLimbList();
}

// removes a limb and scrubs it from every joint
function deleteLimb(id) {
  const i = limbs.findIndex(l => l.id === id);
  if (i < 0) return;
  const limb = limbs[i];
  joints.forEach(j => j.connections.delete(id));
  limb.el.remove();
  URL.revokeObjectURL(limb.url);
  limbs.splice(i, 1);
  if (selectedLimb === id) selectedLimb = null;
  applyZOrder();
  renderLimbList();
  renderConnList();
  updateSelectionStyles();
  renderLinks();
  updateHint();
}

// removes a joint and clears any state pointing at it
function deleteJoint(id) {
  const i = joints.findIndex(j => j.id === id);
  if (i < 0) return;
  joints[i].el.remove();
  joints.splice(i, 1);
  if (selectedJoint === id) selectedJoint = null;
  renderJointList();
  renderConnList();
  updateSelectionStyles();
  renderLinks();
  updateHint();
}

// toggles whether a limb is connected to a joint
function toggleConnection(jointId, limbId) {
  const j = findJoint(jointId);
  if (!j) return;
  if (j.connections.has(limbId)) j.connections.delete(limbId);
  else j.connections.add(limbId);
  updateSelectionStyles();
  renderLinks();
}

// selects a limb for layering and deletion, clearing any joint selection
function selectLimb(id) {
  const l = findLimb(id);
  if (l && l.hidden) return;
  selectedLimb = id;
  selectedJoint = null;
  updateSelectionStyles();
  renderLimbList();
  renderJointList();
  renderConnList();
  renderLinks();
}

// selects a joint and highlights its connected limbs, clearing any limb selection
function selectJoint(id) {
  selectedJoint = id;
  selectedLimb = null;
  updateSelectionStyles();
  renderLimbList();
  renderJointList();
  renderConnList();
  renderLinks();
}

// clears both selections
function deselectAll() {
  selectedLimb = null;
  selectedJoint = null;
  updateSelectionStyles();
  renderLimbList();
  renderJointList();
  renderConnList();
  renderLinks();
}

// applies the highlight class and selection box based on current selection
function updateSelectionStyles() {
  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  limbs.forEach(l => {
    l.el.classList.toggle('highlight', !!joint && joint.connections.has(l.id));
  });
  joints.forEach(j => j.el.classList.toggle('selected', j.id === selectedJoint));
  updateLimbLabel();
}

// draws connector lines from the selected joint to its connected limbs
function renderLinks() {
  while (linksEl.firstChild) linksEl.removeChild(linksEl.firstChild);
  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  if (!joint) return;
  joint.connections.forEach(limbId => {
    const l = findLimb(limbId);
    if (!l) return;
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', joint.x);
    line.setAttribute('y1', joint.y);
    line.setAttribute('x2', l.x + l.width / 2);
    line.setAttribute('y2', l.y + l.height / 2);
    line.setAttribute('class', 'link');
    linksEl.appendChild(line);
  });
}

// rebuilds the limb list panel
function renderLimbList() {
  limbListEl.innerHTML = '';
  limbs.forEach((l, i) => {
    const li = document.createElement('li');
    if (l.id === selectedLimb) li.className = 'active';
    if (l.hidden) li.classList.add('hidden-row');

    const num = document.createElement('span');
    num.className = 'layer-num';
    num.textContent = limbs.length - 1 - i;

    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = l.name;
    name.title = l.name;
    if (!l.hidden) name.addEventListener('click', () => selectLimb(l.id));

    li.appendChild(num);
    li.appendChild(name);
    li.appendChild(makeIconButton(l.hidden ? ICONS.show : ICONS.hide, l.hidden ? 'Show' : 'Hide', () => toggleLimbHidden(l.id)));
    li.appendChild(makeIconButton(ICONS.up, 'Move up', () => reorderLimb(l.id, -1)));
    li.appendChild(makeIconButton(ICONS.down, 'Move down', () => reorderLimb(l.id, 1)));
    li.appendChild(makeButton('×', () => deleteLimb(l.id)));
    limbListEl.appendChild(li);
  });
}

// rebuilds the joint list panel with editable names
function renderJointList() {
  jointListEl.innerHTML = '';
  joints.forEach(j => {
    const li = document.createElement('li');
    if (j.id === selectedJoint) li.className = 'active';
    li.addEventListener('click', () => selectJoint(j.id));

    const input = document.createElement('input');
    input.type = 'text';
    input.value = j.name;
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('input', () => renameJoint(j.id, input.value));

    const del = makeButton('×', () => deleteJoint(j.id));
    del.addEventListener('click', e => e.stopPropagation());

    li.appendChild(input);
    li.appendChild(del);
    jointListEl.appendChild(li);
  });
}

// rebuilds the connection checkboxes for the selected joint
function renderConnList() {
  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  connSection.hidden = !joint;
  if (!joint) return;
  connJointName.textContent = joint.name;
  connListEl.innerHTML = '';
  limbs.forEach(l => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = joint.connections.has(l.id);
    cb.addEventListener('change', () => toggleConnection(joint.id, l.id));
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + l.name));
    li.appendChild(label);
    connListEl.appendChild(li);
  });
}

// updates a joint's name across its label and panels
function renameJoint(id, name) {
  const j = findJoint(id);
  if (!j) return;
  j.name = name;
  j.el.querySelector('.joint-label').textContent = name;
  if (selectedJoint === id) connJointName.textContent = name;
}

// shows the stage hint only while the stage is empty
function updateHint() {
  stageHint.hidden = limbs.length > 0 || joints.length > 0;
}

// builds a small panel button
function makeButton(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// google material icon svg paths, 24x24 viewbox
const ICONS = {
  hide: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  show: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
  up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z'
};

// builds a small panel button showing a google material icon
function makeIconButton(path, title, onClick) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  b.addEventListener('click', onClick);
  return b;
}

// selects an item and begins dragging it
function onItemPointerDown(kind, id, e) {
  e.preventDefault();
  e.stopPropagation();
  if (kind === 'limb') selectLimb(id);
  else selectJoint(id);
  beginDrag(kind, id, e);
}

// starts a drag, recording the grab offset and attaching move handlers
function beginDrag(kind, id, e) {
  const item = kind === 'limb' ? findLimb(id) : findJoint(id);
  if (!item) return;
  const p = stagePoint(e);
  drag = { kind, id, offsetX: p.x - item.x, offsetY: p.y - item.y };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', endDrag);
}

// repositions the dragged item to follow the pointer
function onPointerMove(e) {
  if (!drag) return;
  const item = drag.kind === 'limb' ? findLimb(drag.id) : findJoint(drag.id);
  if (!item) {
    endDrag();
    return;
  }
  const p = stagePoint(e);
  item.x = p.x - drag.offsetX;
  item.y = p.y - drag.offsetY;
  if (drag.kind === 'limb') positionLimbEl(item);
  else positionJointEl(item);
  renderLinks();
}

// ends the current drag and detaches move handlers
function endDrag() {
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', endDrag);
}

// strips a name down to letters, numbers, underscores, and dashes
function cleanName(name) {
  return (name || '').replace(/[^A-Za-z0-9_-]/g, '');
}

// returns the current creature name, falling back to a default
function creatureName() {
  return cleanName(nameInput.value) || 'creature';
}

// builds the joint payload of offsets from each connected limb center
function buildJointData() {
  return {
    joints: joints.map(j => ({
      name: j.name,
      position: { x: Math.round(j.x), y: Math.round(j.y) },
      connectedLimbs: [...j.connections].map(limbId => {
        const l = findLimb(limbId);
        const cx = l.x + l.width / 2;
        const cy = l.y + l.height / 2;
        // limb center relative to the joint, in a +x right / +y up frame
        const dx = cx - j.x;
        const dy = j.y - cy;
        return {
          limb: l.name,
          offsetFromCenter: { x: Math.round(dx), y: Math.round(dy) }
        };
      })
    }))
  };
}

// exports the joint offset data as a json file
function exportJson() {
  downloadBlob(`${creatureName()}-joints.json`,
    new TextEncoder().encode(JSON.stringify(buildJointData(), null, 2)),
    'application/json');
}

// builds a full scene manifest describing limbs, layer order, and joints
function buildManifest() {
  return {
    version: 1,
    name: creatureName(),
    limbs: limbs.map((l, i) => ({
      name: l.name,
      file: `limbs/${i}-${l.name.replace(/[\\/]/g, '_')}`,
      x: Math.round(l.x),
      y: Math.round(l.y),
      width: l.width,
      height: l.height,
      hidden: l.hidden
    })),
    joints: joints.map(j => ({
      name: j.name,
      x: Math.round(j.x),
      y: Math.round(j.y),
      connections: [...j.connections]
        .map(id => limbs.findIndex(l => l.id === id))
        .filter(idx => idx >= 0)
    }))
  };
}

// exports the whole creature (manifest, joint data, and pngs) as a zip
async function exportFullCreature() {
  const enc = new TextEncoder();
  const manifest = buildManifest();
  const files = [
    { name: 'creature.json', data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'joints.json', data: enc.encode(JSON.stringify(buildJointData(), null, 2)) }
  ];
  for (let i = 0; i < limbs.length; i++) {
    const buf = await limbs[i].blob.arrayBuffer();
    files.push({ name: manifest.limbs[i].file, data: new Uint8Array(buf) });
  }
  downloadBlob(`${creatureName()}.zip`, createZip(files), 'application/zip');
}

// reads a full-creature zip and rebuilds the scene from it
function importFullCreature(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const entries = readZip(reader.result);
    const manifestEntry = entries.find(e => e.name === 'creature.json');
    if (!manifestEntry) return;
    loadCreature(JSON.parse(new TextDecoder().decode(manifestEntry.data)), entries);
  };
  reader.readAsArrayBuffer(file);
}

// rebuilds the scene from a manifest and its zip entries
function loadCreature(manifest, entries) {
  clearScene();
  nameInput.value = cleanName(manifest.name) || 'creature';
  const fileMap = {};
  entries.forEach(e => { fileMap[e.name] = e.data; });

  (manifest.limbs || []).forEach(m => {
    const data = fileMap[m.file];
    if (!data) return;
    const blob = new Blob([data], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    limbs.push(makeLimb(m.name, url, blob, m.width, m.height, m.x, m.y, !!m.hidden));
  });
  applyZOrder();

  (manifest.joints || []).forEach(m => {
    const joint = makeJoint(m.name, m.x, m.y);
    (m.connections || []).forEach(idx => {
      const l = limbs[idx];
      if (l) joint.connections.add(l.id);
    });
    joints.push(joint);
  });
  jointCount = joints.length;

  renderLimbList();
  renderJointList();
  renderConnList();
  renderLinks();
  updateHint();
}

// removes every limb and joint and resets selection state
function clearScene() {
  limbs.forEach(l => { l.el.remove(); URL.revokeObjectURL(l.url); });
  joints.forEach(j => j.el.remove());
  limbs.length = 0;
  joints.length = 0;
  selectedLimb = null;
  selectedJoint = null;
  jointCount = 0;
  placeCount = 0;
}

// downloads a byte array as a named file
function downloadBlob(filename, data, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('add-limbs').addEventListener('click', () => limbFile.click());
limbFile.addEventListener('change', e => {
  addLimbsFromFiles(e.target.files);
  limbFile.value = '';
});

document.getElementById('add-joint').addEventListener('click', () => {
  const r = stageEl.getBoundingClientRect();
  const cx = (r.width / 2 - panX) / zoom;
  const cy = (r.height / 2 - panY) / zoom;
  createJoint(cx + (jointCount % 5) * 16, cy + (jointCount % 5) * 16);
});

nameInput.addEventListener('input', () => {
  const clean = cleanName(nameInput.value);
  if (clean !== nameInput.value) nameInput.value = clean;
});

document.getElementById('reset-view').addEventListener('click', resetView);
document.getElementById('export-joints').addEventListener('click', exportJson);
document.getElementById('export-full').addEventListener('click', exportFullCreature);
document.getElementById('import-full').addEventListener('click', () => creatureFile.click());
creatureFile.addEventListener('change', e => {
  if (e.target.files[0]) importFullCreature(e.target.files[0]);
  creatureFile.value = '';
});

stageEl.addEventListener('pointerdown', e => {
  if (e.target === stageEl || e.target === worldEl || e.target === linksEl || e.target === stageHint) {
    deselectAll();
  }
});

stageEl.addEventListener('contextmenu', e => {
  e.preventDefault();
  const p = stagePoint(e);
  createJoint(p.x, p.y);
});

stageEl.addEventListener('wheel', e => {
  e.preventDefault();
  const r = stageEl.getBoundingClientRect();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
}, { passive: false });

document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedLimb != null) {
      e.preventDefault();
      deleteLimb(selectedLimb);
    } else if (selectedJoint != null) {
      e.preventDefault();
      deleteJoint(selectedJoint);
    }
    return;
  }

  const dir = ARROW_STEPS[e.key];
  if (!dir) return;
  const step = e.shiftKey ? 10 : 1;
  if (selectedLimb != null) {
    const l = findLimb(selectedLimb);
    if (!l) return;
    e.preventDefault();
    l.x += dir.x * step;
    l.y += dir.y * step;
    positionLimbEl(l);
    renderLinks();
  } else if (selectedJoint != null) {
    const j = findJoint(selectedJoint);
    if (!j) return;
    e.preventDefault();
    j.x += dir.x * step;
    j.y += dir.y * step;
    positionJointEl(j);
    renderLinks();
  }
});
