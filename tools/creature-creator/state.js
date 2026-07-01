const stageEl = document.getElementById('stage');
const worldEl = document.getElementById('world');
const linksEl = document.getElementById('links');
const stageHint = document.getElementById('stage-hint');
const limbFile = document.getElementById('limb-file');
const creatureFile = document.getElementById('creature-file');
const nameInput = document.getElementById('creature-name');
const limbListEl = document.getElementById('limb-list');
const jointListEl = document.getElementById('joint-list');

const limbs = [];  // { id, name, url, blob, x, y, width, height, hidden, el }
const joints = []; // { id, name, type, x, y, el, connections: Set<limbId> }

// overlay boxes marking limbs connected to the selected joint
const highlightLayer = document.createElement('div');
worldEl.appendChild(highlightLayer);
const highlightBoxes = []; // { el, limb }

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
let hideConnections = false;
let hideJointConnections = false;

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

// clamps a number to a range
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
