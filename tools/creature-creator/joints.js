// builds a joint element and record without inserting it into the joint list
function makeJoint(name, x, y, type) {
  const el = document.createElement('div');
  el.className = 'joint';
  el.innerHTML = '<svg class="joint-svg" viewBox="0 0 16 16" aria-hidden="true"></svg><span class="joint-label"></span>';
  el.querySelector('.joint-label').textContent = name;

  const joint = { id: nextId(), name, type: type || DEFAULT_JOINT_TYPE, x, y, el, connections: new Set(), jointConnections: new Set() };
  applyJointShape(joint);
  el.addEventListener('pointerdown', e => onItemPointerDown('joint', joint.id, e));
  worldEl.appendChild(el);
  positionJointEl(joint);
  return joint;
}

// renders a joint marker's shape and color from its type
function applyJointShape(joint) {
  const def = jointTypeDef(joint.type);
  const svg = joint.el.querySelector('.joint-svg');
  svg.innerHTML = JOINT_SHAPES[def.shape] || JOINT_SHAPES.square;
  svg.querySelector('.joint-shape').setAttribute('fill', def.color);
}

// changes a joint's type and updates its marker
function setJointType(id, type) {
  const j = findJoint(id);
  if (!j) return;
  j.type = type;
  applyJointShape(j);
}

// creates a joint marker at the given stage coordinates and selects it
function createJoint(x, y) {
  jointCount++;
  const joint = makeJoint(`Joint ${jointCount}`, x, y, DEFAULT_JOINT_TYPE);
  joints.push(joint);
  renderJointList();
  selectJoint(joint.id);
  updateHint();
  pushUndo(() => deleteJoint(joint.id));
}

// writes a joint's position to its element
function positionJointEl(joint) {
  joint.el.style.left = joint.x + 'px';
  joint.el.style.top = joint.y + 'px';
  scaleJointEl(joint);
}

// removes a joint and clears any state pointing at it
function deleteJoint(id) {
  const i = joints.findIndex(j => j.id === id);
  if (i < 0) return;
  const j0 = joints[i];
  pushUndo(() => restoreJoint({
    idx: i, name: j0.name, type: j0.type, x: j0.x, y: j0.y,
    limbIds: [...j0.connections], jointIds: [...j0.jointConnections]
  }));
  joints[i].el.remove();
  joints.forEach(j => j.jointConnections.delete(id));
  joints.splice(i, 1);
  if (selectedJoint === id) selectedJoint = null;
  renderJointList();
  updateSelectionStyles();
  renderLinks();
  updateHint();
}

// updates a joint's name across its label and panels
function renameJoint(id, name) {
  const j = findJoint(id);
  if (!j) return;
  j.name = name;
  j.el.querySelector('.joint-label').textContent = name;
}

// toggles whether a limb is connected to a joint
function toggleConnection(jointId, limbId) {
  const j = findJoint(jointId);
  if (!j) return;
  if (j.connections.has(limbId)) j.connections.delete(limbId);
  else j.connections.add(limbId);
  updateSelectionStyles();
  renderLinks();
  pushUndo(() => toggleConnection(jointId, limbId));
}

// toggles a symmetric connection between two joints
function toggleJointConnection(aId, bId) {
  const a = findJoint(aId);
  const b = findJoint(bId);
  if (!a || !b) return;
  if (a.jointConnections.has(bId)) {
    a.jointConnections.delete(bId);
    b.jointConnections.delete(aId);
  } else {
    a.jointConnections.add(bId);
    b.jointConnections.add(aId);
  }
  renderLinks();
  pushUndo(() => toggleJointConnection(aId, bId));
}
