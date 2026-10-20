/**
 * Just enough TopoJSON to draw the boundary files: decode quantized arcs into
 * rings of longitude/latitude, project them, and turn them into SVG paths. A
 * library would do the same in far more code than phones need to download.
 */

type Position = [number, number];

interface Geometry {
  type: 'Polygon' | 'MultiPolygon' | string;
  arcs: number[][] | number[][][];
  properties: Record<string, unknown>;
}

export interface Topology {
  type: 'Topology';
  transform?: { scale: Position; translate: Position };
  arcs: Position[][];
  objects: Record<string, { geometries: Geometry[] }>;
}

export interface Shape {
  properties: Record<string, unknown>;
  /** Polygons, each a list of rings, each a list of [longitude, latitude]. */
  polygons: Position[][][];
}

/** Every shape in the file's first object, as polygons of longitude/latitude rings. */
export function decode(topology: Topology): Shape[] {
  const { scale, translate } = topology.transform ?? { scale: [1, 1], translate: [0, 0] };
  // Arcs are delta-encoded integers when the file is quantized.
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]): Position => {
      if (topology.transform) {
        x += dx;
        y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
      }
      return [dx, dy];
    });
  });
  const ring = (indexes: number[]) => {
    const points: Position[] = [];
    for (const index of indexes) {
      // A negative index is the arc ~index, walked backwards.
      const arc = index < 0 ? [...arcs[~index]!].reverse() : arcs[index]!;
      // Consecutive arcs share their joining point; keep it once.
      points.push(...(points.length ? arc.slice(1) : arc));
    }
    return points;
  };
  const object = Object.values(topology.objects)[0];
  return (object?.geometries ?? []).flatMap((geometry): Shape[] => {
    if (geometry.type === 'Polygon') {
      return [
        { properties: geometry.properties, polygons: [(geometry.arcs as number[][]).map(ring)] },
      ];
    }
    if (geometry.type === 'MultiPolygon') {
      return [
        {
          properties: geometry.properties,
          polygons: (geometry.arcs as number[][][]).map((polygon) => polygon.map(ring)),
        },
      ];
    }
    return [];
  });
}

export interface Projection {
  /** SVG path for a shape. */
  path: (shape: Shape) => string;
  width: number;
  height: number;
}

/**
 * Fit shapes into a box of the given width. An equirectangular projection
 * corrected for latitude is accurate enough at the scale of the Philippines.
 */
export function fit(shapes: Shape[], width: number): Projection {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const shape of shapes) {
    for (const polygon of shape.polygons) {
      for (const [lon, lat] of polygon[0] ?? []) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  if (!Number.isFinite(west)) return { path: () => '', width, height: width };
  const squeeze = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const spanX = Math.max((east - west) * squeeze, 1e-6);
  const spanY = Math.max(north - south, 1e-6);
  const k = width / spanX;
  const height = Math.round(spanY * k);
  const point = ([lon, lat]: Position) =>
    `${((lon - west) * squeeze * k).toFixed(1)},${((north - lat) * k).toFixed(1)}`;
  return {
    width,
    height,
    path: (shape) =>
      shape.polygons
        .map((polygon) => polygon.map((ring) => `M${ring.map(point).join('L')}Z`).join(''))
        .join(''),
  };
}
