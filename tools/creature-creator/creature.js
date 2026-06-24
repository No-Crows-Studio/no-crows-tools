const stageEl = document.getElementById('stage');
const worldEl = document.getElementById('world');
const linksEl = document.getElementById('links');
const stageHint = document.getElementById('stage-hint');
const limbFile = document.getElementById('limb-file');
const limbListEl = document.getElementById('limb-list');
const jointListEl = document.getElementById('joint-list');
const connSection = document.getElementById('connections-section');
const connJointName = document.getElementById('conn-joint-name');
const connListEl = document.getElementById('conn-list');

const SVGNS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

const limbs = [];  // { id, name, url, x, y, width, height, el }
const joints = []; // { id, name, x, y, el, connections: Set<limbId> }

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
    img.onload = () => createLimb(file.name, url, img.naturalWidth, img.naturalHeight);
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
}

// creates a limb element on the stage and registers it
function createLimb(name, url, w, h) {
  const id = nextId();
  const x = 40 + (placeCount % 6) * 30;
  const y = 40 + (placeCount % 6) * 30;
  placeCount++;

  const el = document.createElement('img');
  el.className = 'limb';
  el.src = url;
  el.draggable = false;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.addEventListener('pointerdown', e => onItemPointerDown('limb', id, e));

  const limb = { id, name, url, x, y, width: w, height: h, el };
  limbs.push(limb);
  worldEl.appendChild(el);
  positionLimbEl(limb);
  applyZOrder();
  renderLimbList();
  renderConnList();
  selectLimb(id);
  updateHint();
}

// creates a joint marker at the given stage coordinates
function createJoint(x, y) {
  const id = nextId();
  jointCount++;
  const name = `Joint ${jointCount}`;

  const el = document.createElement('div');
  el.className = 'joint';
  el.innerHTML = '<span class="joint-dot"></span><span class="joint-label"></span>';
  el.querySelector('.joint-label').textContent = name;
  el.addEventListener('pointerdown', e => onItemPointerDown('joint', id, e));

  const joint = { id, name, x, y, el, connections: new Set() };
  joints.push(joint);
  worldEl.appendChild(el);
  positionJointEl(joint);
  renderJointList();
  selectJoint(id);
  updateHint();
}

// writes a limb's position to its element
function positionLimbEl(limb) {
  limb.el.style.left = limb.x + 'px';
  limb.el.style.top = limb.y + 'px';
}

// writes a joint's position to its element
function positionJointEl(joint) {
  joint.el.style.left = joint.x + 'px';
  joint.el.style.top = joint.y + 'px';
}

// reassigns z-index so list order drives stacking
function applyZOrder() {
  limbs.forEach((l, i) => { l.el.style.zIndex = i + 1; });
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

// selects a limb for layering and deletion
function selectLimb(id) {
  selectedLimb = id;
  updateSelectionStyles();
  renderLimbList();
}

// selects a joint and highlights its connected limbs
function selectJoint(id) {
  selectedJoint = id;
  updateSelectionStyles();
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

// applies selected and highlight classes based on current selection
function updateSelectionStyles() {
  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  limbs.forEach(l => {
    l.el.classList.toggle('selected', l.id === selectedLimb);
    l.el.classList.toggle('highlight', !!joint && joint.connections.has(l.id));
  });
  joints.forEach(j => j.el.classList.toggle('selected', j.id === selectedJoint));
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
  limbs.forEach(l => {
    const li = document.createElement('li');
    if (l.id === selectedLimb) li.className = 'active';

    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = l.name;
    name.title = l.name;
    name.addEventListener('click', () => selectLimb(l.id));

    li.appendChild(name);
    li.appendChild(makeButton('Up', () => reorderLimb(l.id, 1)));
    li.appendChild(makeButton('Dn', () => reorderLimb(l.id, -1)));
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

// builds the export payload of joint offsets and triggers a download
function exportJson() {
  const data = {
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
  download('creature-joints.json', JSON.stringify(data, null, 2));
}

// downloads text content as a named file
function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
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

document.getElementById('reset-view').addEventListener('click', resetView);
document.getElementById('export-json').addEventListener('click', exportJson);

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
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (selectedLimb != null) {
    e.preventDefault();
    deleteLimb(selectedLimb);
  } else if (selectedJoint != null) {
    e.preventDefault();
    deleteJoint(selectedJoint);
  }
});
