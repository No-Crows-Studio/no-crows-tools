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
  selectLimb(limb.id);
  updateHint();
  pushUndo(() => deleteLimb(limb.id));
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
  layoutLimbBox(limbSel, l);
  limbLabel.textContent = l.name;
  limbLabel.title = l.name;
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
  pushUndo(() => reorderLimb(id, -dir));
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
  const connectedJointIds = joints.filter(j => j.connections.has(id)).map(j => j.id);
  pushUndo(() => restoreLimb({
    idx: i, name: limb.name, blob: limb.blob,
    x: limb.x, y: limb.y, width: limb.width, height: limb.height,
    hidden: limb.hidden, connectedJointIds
  }));
  joints.forEach(j => j.connections.delete(id));
  limb.el.remove();
  URL.revokeObjectURL(limb.url);
  limbs.splice(i, 1);
  if (selectedLimb === id) selectedLimb = null;
  applyZOrder();
  renderLimbList();
  updateSelectionStyles();
  renderLinks();
  updateHint();
}
