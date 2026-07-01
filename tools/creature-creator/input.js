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
  drag = { kind, id, offsetX: p.x - item.x, offsetY: p.y - item.y, startX: item.x, startY: item.y };
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

// ends the current drag, recording the move for undo if the item actually moved
function endDrag() {
  if (drag) {
    const item = drag.kind === 'limb' ? findLimb(drag.id) : findJoint(drag.id);
    if (item && (item.x !== drag.startX || item.y !== drag.startY)) {
      const { kind, id, startX, startY } = drag;
      pushUndo(() => moveItemTo(kind, id, startX, startY));
    }
  }
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', endDrag);
}

let connectDrag = null; // { fromId, line }

// finds the joint whose marker is within a screen-space radius of a stage-local point
function jointNearScreen(localX, localY, radius) {
  let best = null;
  let bestD = radius;
  joints.forEach(j => {
    const d = Math.hypot(panX + j.x * zoom - localX, panY + j.y * zoom - localY);
    if (d <= bestD) {
      bestD = d;
      best = j;
    }
  });
  return best;
}

// starts a joint connection drag if the right-click landed near a joint
function startConnectDrag(e) {
  const r = stageEl.getBoundingClientRect();
  const from = jointNearScreen(e.clientX - r.left, e.clientY - r.top, CONNECT_RADIUS);
  if (!from) return;
  const line = makeLine(from.x, from.y, from.x, from.y);
  line.setAttribute('class', 'joint-link');
  linksEl.appendChild(line);
  connectDrag = { fromId: from.id, line };
  window.addEventListener('pointermove', onConnectMove);
  window.addEventListener('pointerup', onConnectUp);
}

// stretches the pending connection line to follow the pointer
function onConnectMove(e) {
  if (!connectDrag) return;
  const p = stagePoint(e);
  connectDrag.line.setAttribute('x2', p.x);
  connectDrag.line.setAttribute('y2', p.y);
}

// connects the two joints if the drag ended near a different joint
function onConnectUp(e) {
  if (!connectDrag) return;
  const r = stageEl.getBoundingClientRect();
  const target = jointNearScreen(e.clientX - r.left, e.clientY - r.top, CONNECT_RADIUS);
  const fromId = connectDrag.fromId;
  connectDrag.line.remove();
  connectDrag = null;
  window.removeEventListener('pointermove', onConnectMove);
  window.removeEventListener('pointerup', onConnectUp);

  const from = findJoint(fromId);
  if (from && target && target.id !== fromId && !from.jointConnections.has(target.id)) {
    toggleJointConnection(fromId, target.id);
    renderJointList();
  } else {
    renderLinks();
  }
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

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('reset-view').addEventListener('click', resetView);
const toggleNamesBtn = document.getElementById('toggle-joint-names');
toggleNamesBtn.addEventListener('click', () => {
  const hidden = worldEl.classList.toggle('hide-joint-names');
  toggleNamesBtn.textContent = hidden ? 'Show joint names' : 'Hide joint names';
});

const toggleConnBtn = document.getElementById('toggle-connections');
toggleConnBtn.addEventListener('click', () => {
  hideConnections = !hideConnections;
  toggleConnBtn.textContent = hideConnections ? 'Show sprite connections' : 'Hide sprite connections';
  updateSelectionStyles();
  renderLinks();
});

const toggleJointConnBtn = document.getElementById('toggle-joint-connections');
toggleJointConnBtn.addEventListener('click', () => {
  hideJointConnections = !hideJointConnections;
  toggleJointConnBtn.textContent = hideJointConnections ? 'Show joint connections' : 'Hide joint connections';
  renderLinks();
});
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

stageEl.addEventListener('contextmenu', e => e.preventDefault());

// intercepts right-click before item handlers to start a joint connection drag
stageEl.addEventListener('pointerdown', e => {
  if (e.button !== 2) return;
  e.preventDefault();
  e.stopPropagation();
  startConnectDrag(e);
}, true);

stageEl.addEventListener('wheel', e => {
  e.preventDefault();
  const r = stageEl.getBoundingClientRect();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
}, { passive: false });

document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undo();
    return;
  }

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
    const ox = l.x;
    const oy = l.y;
    pushUndo(() => moveItemTo('limb', l.id, ox, oy));
    l.x += dir.x * step;
    l.y += dir.y * step;
    positionLimbEl(l);
    renderLinks();
  } else if (selectedJoint != null) {
    const j = findJoint(selectedJoint);
    if (!j) return;
    e.preventDefault();
    const ox = j.x;
    const oy = j.y;
    pushUndo(() => moveItemTo('joint', j.id, ox, oy));
    j.x += dir.x * step;
    j.y += dir.y * step;
    positionJointEl(j);
    renderLinks();
  }
});
