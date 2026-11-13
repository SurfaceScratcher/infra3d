import type { Layout, Vec3 } from './layout.js';

export interface CameraAngle {
  /** Rotation around the vertical axis in radians; 0 looks along -z. */
  azimuth: number;
  /** Angle from straight above in radians; π/2 is a side view. */
  polar: number;
}

/** Slightly from the right and well above, so that all layers stay visible. */
export const DEFAULT_CAMERA_ANGLE: CameraAngle = { azimuth: Math.atan2(10, 85), polar: Math.atan2(Math.hypot(10, 85), 45) };

export interface FitOptions {
  /** Vertical field of view in degrees. */
  fov: number;
  /** Viewport width / height. */
  aspect: number;
  angle?: CameraAngle;
  /** Extra room around the box as a fraction of the view, e.g. 0.08. */
  padding?: number;
}

export interface CameraFit {
  target: Vec3;
  position: Vec3;
  distance: number;
}

export interface Box {
  min: Vec3;
  max: Vec3;
}

/** The space the scene occupies, including the layer planes drawn around the nodes. */
export function sceneBox(layout: Layout, margin = 6): Box {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const ys = [...layout.layerY.values()];
  return {
    min: [minX - margin, Math.min(0, ...ys) - 1, minZ - margin],
    max: [maxX + margin, Math.max(0, ...ys) + 2, maxZ + margin],
  };
}

/**
 * Camera position that shows the whole box from the given angle. Unlike CameraControls.fitToBox
 * it keeps the angle, and it accounts for the aspect ratio, so narrow portrait screens move
 * the camera further back instead of cutting off the sides.
 */
export function fitCamera(box: Box, { fov, aspect, angle = DEFAULT_CAMERA_ANGLE, padding = 0.08 }: FitOptions): CameraFit {
  const target: Vec3 = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as Vec3;
  const { azimuth, polar } = angle;
  // Unit vector from the target towards the camera, and the camera's right and up axes
  const back: Vec3 = [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)];
  const right: Vec3 = normalize([back[2], 0, -back[0]]);
  const up = cross(back, right);

  const tanV = Math.tan(((fov / 2) * Math.PI) / 180) * (1 - padding);
  const tanH = tanV * aspect;
  let distance = 0;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const c: Vec3 = [x - target[0], y - target[1], z - target[2]];
        // A corner at depth `toward` in front of the target needs |offset| <= (distance - toward) * tan
        const toward = dot(c, back);
        distance = Math.max(distance, toward + Math.abs(dot(c, right)) / tanH, toward + Math.abs(dot(c, up)) / tanV);
      }
    }
  }
  return { target, distance, position: [0, 1, 2].map((i) => target[i] + back[i] * distance) as Vec3 };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
