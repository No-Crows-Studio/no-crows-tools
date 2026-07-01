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
  layoutOverlays();
  renderLinks();
}

// counter-scales a joint marker so it stays a fixed screen size while zooming
function scaleJointEl(joint) {
  joint.el.style.transform = `scale(${1 / zoom})`;
}

// sizes an overlay box to hug a limb while its border stays a fixed screen size
function layoutLimbBox(el, limb) {
  el.style.left = limb.x + 'px';
  el.style.top = limb.y + 'px';
  el.style.width = limb.width * zoom + 'px';
  el.style.height = limb.height * zoom + 'px';
  el.style.transform = `scale(${1 / zoom})`;
}

// repositions the selection box and highlight boxes for the current zoom
function layoutOverlays() {
  const l = selectedLimb != null ? findLimb(selectedLimb) : null;
  if (l && !l.hidden) layoutLimbBox(limbSel, l);
  highlightBoxes.forEach(b => layoutLimbBox(b.el, b.limb));
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
