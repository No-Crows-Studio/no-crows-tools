// selects a limb for layering and deletion, clearing any joint selection
function selectLimb(id) {
  const l = findLimb(id);
  if (l && l.hidden) return;
  selectedLimb = id;
  selectedJoint = null;
  updateSelectionStyles();
  renderLimbList();
  renderJointList();
  renderLinks();
}

// selects a joint and highlights its connected limbs, clearing any limb selection
function selectJoint(id) {
  selectedJoint = id;
  selectedLimb = null;
  updateSelectionStyles();
  renderLimbList();
  renderJointList();
  renderLinks();
}

// clears both selections
function deselectAll() {
  selectedLimb = null;
  selectedJoint = null;
  updateSelectionStyles();
  renderLimbList();
  renderJointList();
  renderLinks();
}

// applies the highlight class and selection box based on current selection
function updateSelectionStyles() {
  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  highlightLayer.innerHTML = '';
  highlightBoxes.length = 0;
  if (joint && !hideConnections) {
    joint.connections.forEach(id => {
      const l = findLimb(id);
      if (!l || l.hidden) return;
      const box = document.createElement('div');
      box.className = 'limb-highlight';
      layoutLimbBox(box, l);
      highlightLayer.appendChild(box);
      highlightBoxes.push({ el: box, limb: l });
    });
  }
  joints.forEach(j => j.el.classList.toggle('selected', j.id === selectedJoint));
  updateLimbLabel();
}

// builds an svg line in world coordinates with a fixed screen stroke width
function makeLine(x1, y1, x2, y2) {
  const line = document.createElementNS(SVGNS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke-width', 1.5 / zoom);
  return line;
}

// draws joint-to-joint links and the selected joint's limb links
function renderLinks() {
  while (linksEl.firstChild) linksEl.removeChild(linksEl.firstChild);

  if (!hideJointConnections) {
    const drawn = new Set();
    joints.forEach(j => {
      j.jointConnections.forEach(otherId => {
        const o = findJoint(otherId);
        if (!o) return;
        const key = j.id < otherId ? `${j.id}-${otherId}` : `${otherId}-${j.id}`;
        if (drawn.has(key)) return;
        drawn.add(key);
        const line = makeLine(j.x, j.y, o.x, o.y);
        line.setAttribute('class', 'joint-link');
        if (selectedJoint === j.id || selectedJoint === o.id) line.classList.add('selected');
        linksEl.appendChild(line);
      });
    });
  }

  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  if (!joint || hideConnections) return;
  joint.connections.forEach(limbId => {
    const l = findLimb(limbId);
    if (!l) return;
    const line = makeLine(joint.x, joint.y, l.x + l.width / 2, l.y + l.height / 2);
    line.setAttribute('class', 'link');
    line.setAttribute('stroke-dasharray', `${4 / zoom} ${3 / zoom}`);
    linksEl.appendChild(line);
  });
}

// rebuilds the limb list panel
function renderLimbList() {
  const joint = selectedJoint != null ? findJoint(selectedJoint) : null;
  limbListEl.innerHTML = '';
  limbs.forEach((l, i) => {
    const li = document.createElement('li');
    if (l.id === selectedLimb) li.className = 'active';
    if (l.hidden) li.classList.add('hidden-row');

    if (joint) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'conn-check';
      cb.checked = joint.connections.has(l.id);
      cb.title = `Connect to ${joint.name}`;
      cb.addEventListener('change', () => toggleConnection(joint.id, l.id));
      li.appendChild(cb);
    }

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

    if (selectedJoint != null && j.id !== selectedJoint) {
      const sel = findJoint(selectedJoint);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'conn-check';
      cb.checked = sel.jointConnections.has(j.id);
      cb.title = `Connect to ${sel.name}`;
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => toggleJointConnection(selectedJoint, j.id));
      li.appendChild(cb);
    }

    const type = document.createElement('select');
    type.className = 'joint-type';
    JOINT_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.key;
      opt.textContent = t.label;
      type.appendChild(opt);
    });
    type.value = j.type;
    type.addEventListener('click', e => e.stopPropagation());
    type.addEventListener('change', () => setJointType(j.id, type.value));

    li.appendChild(input);
    li.appendChild(type);
    li.appendChild(del);
    jointListEl.appendChild(li);
  });
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
