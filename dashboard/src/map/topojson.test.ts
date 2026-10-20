import { describe, expect, it } from 'vitest';
import { decode, fit, type Topology } from './topojson';

// One unit square, stored the way the boundary files store shapes: quantized,
// delta-encoded arcs, one of them walked backwards.
const SQUARE: Topology = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [120, 10] },
  arcs: [
    [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
  ],
  objects: {
    places: { geometries: [{ type: 'Polygon', arcs: [[0, ~1]], properties: { name: 'Square' } }] },
  },
};

describe('decode', () => {
  it('turns quantized arcs into longitude/latitude rings', () => {
    const [shape] = decode(SQUARE);

    expect(shape!.properties).toEqual({ name: 'Square' });
    expect(shape!.polygons).toEqual([
      [
        [
          [120, 10],
          [121, 10],
          [121, 11],
          [120, 11],
          [120, 10],
        ],
      ],
    ]);
  });
});

describe('fit', () => {
  it('fills the width and keeps north at the top', () => {
    const projection = fit(decode(SQUARE), 100);

    expect(projection.width).toBe(100);
    expect(projection.height).toBeGreaterThan(100); // a degree of longitude is shorter
    expect(projection.path(decode(SQUARE)[0]!)).toMatch(/^M0\.0,\d+\.\dL100\.0,/);
  });
});
