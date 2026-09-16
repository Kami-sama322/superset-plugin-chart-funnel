/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Fritsch–Carlson monotone cubic tangents for points (ys[i], ws[i]).
 * Guarantees the interpolated curve stays within [min(w_i, w_i+1), max(...)]
 * on every segment (no overshoot), which keeps funnel edges free of bulges
 * even for pear-shaped data.
 */
export function monotoneTangents(ys: number[], ws: number[]): number[] {
  const n = ys.length;
  if (n < 2) {
    return ys.map(() => 0);
  }
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dy = ys[i + 1] - ys[i];
    deltas.push(dy === 0 ? 0 : (ws[i + 1] - ws[i]) / dy);
  }
  const tangents: number[] = new Array(n);
  tangents[0] = deltas[0];
  tangents[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (deltas[i - 1] + deltas[i]) / 2;
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (deltas[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / deltas[i];
    const b = tangents[i + 1] / deltas[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tangents[i] = tau * a * deltas[i];
      tangents[i + 1] = tau * b * deltas[i];
    }
  }
  return tangents;
}

export type CubicControl = {
  /** control point 1: { y, w } */
  c1: [number, number];
  /** control point 2: { y, w } */
  c2: [number, number];
};

/** Convert a Hermite segment to cubic bezier control points in (y, w) space. */
export function hermiteToBezier(
  y0: number,
  w0: number,
  m0: number,
  y1: number,
  w1: number,
  m1: number,
): CubicControl {
  const dy = y1 - y0;
  return {
    c1: [y0 + dy / 3, w0 + (m0 * dy) / 3],
    c2: [y1 - dy / 3, w1 - (m1 * dy) / 3],
  };
}

/** de Casteljau split of a cubic at parameter t; returns the first part. */
export function splitCubicFirstPart(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): [number, number, number] {
  const p01 = p0 + (p1 - p0) * t;
  const p12 = p1 + (p2 - p1) * t;
  const p23 = p2 + (p3 - p2) * t;
  const p012 = p01 + (p12 - p01) * t;
  const p123 = p12 + (p23 - p12) * t;
  const p0123 = p012 + (p123 - p012) * t;
  return [p01, p012, p0123];
}

export type LabelBox = {
  /** left x of the label box */
  left: number;
  /** width of the label box */
  width: number;
};

/**
 * Box for a vertically centered band label. Slanted bands (funnel, smooth
 * funnel, pyramid) are widest at one of their horizontal edges — sizing
 * the box by the top edge alone pushes left/right aligned text outside
 * the shape, so the box uses the band width at the label's middle row:
 * the average of the top and bottom edge widths. Constant-width bands
 * (bars) use the band width as is.
 */
export function labelBoxForBand(params: {
  centerX: number;
  /** width of the band's top edge (the band width itself for bars) */
  topWidth: number;
  /** width of the band's bottom edge; defaults to topWidth */
  bottomWidth?: number;
  /** true for slanted shapes (funnel, smooth funnel, pyramid) */
  slanted: boolean;
}): LabelBox {
  const { centerX, topWidth, bottomWidth = topWidth, slanted } = params;
  const width = slanted ? (topWidth + bottomWidth) / 2 : topWidth;
  return { left: centerX - width / 2, width };
}

/**
 * Width of a smooth band's bottom edge. The knot spline spans
 * (height + gap) vertically between band tops, but the band itself only
 * (height) — its bottom edge sits part-way along the segment. Linear in
 * the knot widths: exact for straight edges, a close estimate for the
 * monotone cubic ones (the limiter keeps the curve near the chord).
 */
export function smoothBandBottomWidth(params: {
  topWidth: number;
  nextWidth: number;
  height: number;
  gap: number;
}): number {
  const span = params.height + params.gap;
  if (span <= 0) {
    return params.nextWidth;
  }
  const t = Math.min(1, params.height / span);
  return params.topWidth + (params.nextWidth - params.topWidth) * t;
}

export type SmoothBandParams = {
  cx: number;
  /** band top y */
  y0: number;
  /** band height */
  height: number;
  /** knot ys (band tops + final bottom), strictly increasing */
  knotsY: number[];
  /** knot widths, same length as knotsY */
  knotsW: number[];
  /** monotone tangents at the knots */
  tangents: number[];
  /** index of the band (its top is knotsY[index]) */
  index: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build the SVG path of one band of a smooth funnel. The band's side edges
 * follow a globally smooth monotone cubic through the knot widths; when the
 * band bottom lies between two knots (gapped layout) the cubic is split with
 * de Casteljau.
 */
export function buildSmoothBandPath(params: SmoothBandParams): string {
  const { cx, y0, height, knotsY, knotsW, tangents, index } = params;
  const y1 = y0 + height;
  const n = knotsY.length;
  const segIndex = Math.min(index, n - 2);
  const isLast = index >= n - 2;
  const seg = hermiteToBezier(
    knotsY[segIndex],
    knotsW[segIndex],
    tangents[segIndex],
    knotsY[segIndex + 1],
    knotsW[segIndex + 1],
    tangents[segIndex + 1],
  );
  let c1 = seg.c1;
  let c2 = seg.c2;
  let endY = knotsY[segIndex + 1];
  let endW = knotsW[segIndex + 1];
  if (!isLast && y1 < endY) {
    // the band bottom lies inside the segment (gapped layout) — split it
    const t = (y1 - knotsY[segIndex]) / (endY - knotsY[segIndex]);
    const yPart = splitCubicFirstPart(knotsY[segIndex], c1[0], c2[0], endY, t);
    const wPart = splitCubicFirstPart(knotsW[segIndex], c1[1], c2[1], endW, t);
    c1 = [yPart[0], wPart[0]];
    c2 = [yPart[1], wPart[1]];
    endY = yPart[2];
    endW = wPart[2];
  }
  const startW = knotsW[segIndex];
  const x = (w: number, side: -1 | 1) => cx + (side * w) / 2;
  return [
    `M${round(x(startW, -1))} ${round(y0)}`,
    `C${round(x(c1[1], -1))} ${round(c1[0])} ${round(x(c2[1], -1))} ${round(c2[0])} ${round(x(endW, -1))} ${round(endY)}`,
    `L${round(x(endW, 1))} ${round(endY)}`,
    `C${round(x(c2[1], 1))} ${round(c2[0])} ${round(x(c1[1], 1))} ${round(c1[0])} ${round(x(startW, 1))} ${round(y0)}`,
    "Z",
  ].join(" ");
}
