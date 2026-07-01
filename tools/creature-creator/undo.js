const undoStack = [];
const UNDO_LIMIT = 10;
let isUndoing = false;

// records how to revert the most recent action, capping history at 10 entries
function pushUndo(revert) {
  if (isUndoing) return;
  undoStack.push(revert);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

// reverts the most recent action; reverts never record new undo entries
function undo() {
  const revert = undoStack.pop();
  if (!revert) return;
  isUndoing = true;
  revert();
  isUndoing = false;
}

// moves a limb or joint back to a position, used to revert a drag or nudge
function moveItemTo(kind, id, x, y) {
  const item = kind === 'limb' ? findLimb(id) : findJoint(id);
  if (!item) return;
  item.x = x;
  item.y = y;
  if (kind === 'limb') positionLimbEl(item);
  else positionJointEl(item);
  renderLinks();
}

// recreates a deleted limb at its old layer with its joint connections
function restoreLimb(d) {
  const url = URL.createObjectURL(d.blob);
  const limb = makeLimb(d.name, url, d.blob, d.width, d.height, d.x, d.y, d.hidden);
  limbs.splice(Math.min(d.idx, limbs.length), 0, limb);
  d.connectedJointIds.forEach(jid => {
    const j = findJoint(jid);
    if (j) j.connections.add(limb.id);
  });
  applyZOrder();
  renderLimbList();
  updateSelectionStyles();
  renderLinks();
  updateHint();
}

// recreates a deleted joint at its old index with its connections
function restoreJoint(d) {
  const joint = makeJoint(d.name, d.x, d.y, d.type);
  d.limbIds.forEach(lid => { if (findLimb(lid)) joint.connections.add(lid); });
  joints.splice(Math.min(d.idx, joints.length), 0, joint);
  d.jointIds.forEach(jid => {
    const o = findJoint(jid);
    if (o) {
      joint.jointConnections.add(jid);
      o.jointConnections.add(joint.id);
    }
  });
  renderJointList();
  updateSelectionStyles();
  renderLinks();
  updateHint();
}
