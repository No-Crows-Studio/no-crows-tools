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
      type: j.type,
      position: { x: Math.round(j.x), y: Math.round(j.y) },
      connectedJoints: [...j.jointConnections]
        .map(id => { const oj = findJoint(id); return oj ? oj.name : null; })
        .filter(Boolean),
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
    version: 2,
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
      type: j.type,
      x: Math.round(j.x),
      y: Math.round(j.y),
      connections: [...j.connections]
        .map(id => limbs.findIndex(l => l.id === id))
        .filter(idx => idx >= 0),
      jointConnections: [...j.jointConnections]
        .map(id => joints.findIndex(jj => jj.id === id))
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

  const jointDefs = manifest.joints || [];
  jointDefs.forEach(m => {
    const joint = makeJoint(m.name, m.x, m.y, m.type || DEFAULT_JOINT_TYPE);
    (m.connections || []).forEach(idx => {
      const l = limbs[idx];
      if (l) joint.connections.add(l.id);
    });
    joints.push(joint);
  });
  // wire joint-to-joint links after all joints exist; absent field means no links
  jointDefs.forEach((m, i) => {
    (m.jointConnections || []).forEach(idx => {
      const other = joints[idx];
      if (other && other !== joints[i]) joints[i].jointConnections.add(other.id);
    });
  });
  jointCount = joints.length;

  renderLimbList();
  renderJointList();
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
  undoStack.length = 0;
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
