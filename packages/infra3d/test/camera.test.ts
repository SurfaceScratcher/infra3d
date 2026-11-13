import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA_ANGLE, fitCamera, sceneBox, type Box } from '../src/camera.js';
import { computeLayout, type Vec3 } from '../src/layout.js';
import { topo } from './fixture.js';

const FOV = 45;
const box: Box = { min: [-60, 0, -10], max: [60, 30, 10] };

/** Largest |x| / depth and |y| / depth of the box corners as seen from the fitted camera. */
function extent(b: Box, aspect: number) {
  const { position, target } = fitCamera(b, { fov: FOV, aspect, padding: 0 });
  const forward = norm(sub(target, position));
  const right = norm([-forward[2], 0, forward[0]]);
  const up = cross(right, forward);
  let h = 0;
  let v = 0;
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    const c = sub([x, y, z], position);
    const depth = dot(c, forward);
    h = Math.max(h, Math.abs(dot(c, right)) / depth);
    v = Math.max(v, Math.abs(dot(c, up)) / depth);
  }
  return { h, v };
}

describe('fitCamera', () => {
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);

  for (const aspect of [16 / 9, 1, 9 / 19.5]) {
    it(`keeps every corner in view and touches the edge at aspect ${aspect.toFixed(2)}`, () => {
      const { h, v } = extent(box, aspect);
      expect(h).toBeLessThanOrEqual(tanV * aspect + 1e-9);
      expect(v).toBeLessThanOrEqual(tanV + 1e-9);
      // tight: one direction is fully used
      expect(Math.max(h / (tanV * aspect), v / tanV)).toBeCloseTo(1, 6);
    });
  }

  it('moves back on narrow portrait screens', () => {
    const landscape = fitCamera(box, { fov: FOV, aspect: 16 / 9 });
    const portrait = fitCamera(box, { fov: FOV, aspect: 9 / 19.5 });
    expect(portrait.distance).toBeGreaterThan(landscape.distance * 2);
  });

  it('keeps the viewing angle and looks at the box centre', () => {
    const { position, target, distance } = fitCamera(box, { fov: FOV, aspect: 1.5 });
    expect(target).toEqual([0, 15, 0]);
    const back = norm(sub(position, target));
    const { azimuth, polar } = DEFAULT_CAMERA_ANGLE;
    expect(back[1]).toBeCloseTo(Math.cos(polar), 9);
    expect(Math.atan2(back[0], back[2])).toBeCloseTo(azimuth, 9);
    expect(Math.hypot(...sub(position, target))).toBeCloseTo(distance, 9);
  });

  it('adds padding', () => {
    expect(fitCamera(box, { fov: FOV, aspect: 1, padding: 0.2 }).distance).toBeGreaterThan(fitCamera(box, { fov: FOV, aspect: 1, padding: 0 }).distance);
  });
});

describe('sceneBox', () => {
  it('covers all node positions and every layer', () => {
    const layout = computeLayout(topo);
    const b = sceneBox(layout);
    for (const [x, y, z] of layout.positions.values()) {
      expect(x).toBeGreaterThan(b.min[0]);
      expect(x).toBeLessThan(b.max[0]);
      expect(z).toBeGreaterThan(b.min[2]);
      expect(z).toBeLessThan(b.max[2]);
      expect(y).toBeGreaterThan(b.min[1]);
      expect(y).toBeLessThan(b.max[1]);
    }
  });
});

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
