const SVGNS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const CONNECT_RADIUS = 20;
const ARROW_STEPS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }
};

// joint types, each with a marker shape and a distinct color; selected joints render blue
const JOINT_TYPES = [
  { key: 'skeleton', label: 'Skeleton', shape: 'square', color: '#7a7a7a' },
  { key: 'head-base', label: 'Head base', shape: 'diamond', color: '#00bcd4' },
  { key: 'head-tip', label: 'Head tip', shape: 'diamond', color: '#00bcd4' },
  { key: 'shoulder', label: 'Shoulder', shape: 'triangle', color: '#e23030' },
  { key: 'elbow', label: 'Elbow', shape: 'triangle', color: '#ff7a00' },
  { key: 'hand', label: 'Hand', shape: 'triangle', color: '#d4b106' },
  { key: 'hip', label: 'Hip', shape: 'circle', color: '#4caf50' },
  { key: 'knee', label: 'Knee', shape: 'circle', color: '#009688' },
  { key: 'foot', label: 'Foot', shape: 'circle', color: '#8bc34a' },
  { key: 'tail-segment', label: 'Tail segment', shape: 'star', color: '#e91e63' },
  { key: 'tail-bone', label: 'Tail bone', shape: 'star', color: '#9c27b0' },
  { key: 'tail-tip', label: 'Tail tip', shape: 'star', color: '#ff5722' }
];
const DEFAULT_JOINT_TYPE = 'skeleton';

// svg inner markup for each marker shape, drawn in a 16x16 viewbox
const JOINT_SHAPES = {
  square: '<rect class="joint-shape" x="3" y="3" width="10" height="10"/>',
  diamond: '<polygon class="joint-shape" points="8,1 15,8 8,15 1,8"/>',
  circle: '<circle class="joint-shape" cx="8" cy="8" r="6"/>',
  triangle: '<polygon class="joint-shape" points="8,2 14.5,13.5 1.5,13.5"/>',
  star: '<polygon class="joint-shape" points="8,1 9.76,5.57 14.66,5.84 10.85,8.93 12.11,13.66 8,11 3.89,13.66 5.15,8.93 1.34,5.84 6.24,5.57"/>'
};

// returns the joint type definition for a key, falling back to the default type
function jointTypeDef(key) {
  return JOINT_TYPES.find(t => t.key === key) || JOINT_TYPES[0];
}

// google material icon svg paths, 24x24 viewbox
const ICONS = {
  hide: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  show: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
  up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z'
};
