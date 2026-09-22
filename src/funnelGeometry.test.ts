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
import {
  buildSmoothBandPath,
  buildSmoothHalfBandPath,
  hermiteToBezier,
  labelBoxForBand,
  labelBoxForHalfBand,
  monotoneTangents,
  smoothBandBottomWidth,
  splitCubicFirstPart,
} from "./funnelGeometry";

test("smoothBandBottomWidth interpolates within the band span", () => {
  // no gap: the band bottom reaches the next knot
  expect(
    smoothBandBottomWidth({
      topWidth: 100,
      nextWidth: 300,
      height: 40,
      gap: 0,
    }),
  ).toBe(300);
  // gap equals height: the band bottom is half-way along the spline span
  expect(
    smoothBandBottomWidth({
      topWidth: 100,
      nextWidth: 300,
      height: 40,
      gap: 40,
    }),
  ).toBe(200);
  // degenerate span falls back to the next knot
  expect(
    smoothBandBottomWidth({ topWidth: 100, nextWidth: 300, height: 0, gap: 0 }),
  ).toBe(300);
});

test("labelBoxForBand keeps the band width for constant-width bars", () => {
  const box = labelBoxForBand({
    centerX: 100,
    topWidth: 80,
    bottomWidth: 20,
    slanted: false,
  });
  expect(box.width).toBe(80);
  expect(box.left).toBe(60);
});

test("labelBoxForBand sizes slanted bands at their middle row", () => {
  // funnel band narrowing down: top 300, bottom 100 -> mid width 200
  const narrowing = labelBoxForBand({
    centerX: 200,
    topWidth: 300,
    bottomWidth: 100,
    slanted: true,
  });
  expect(narrowing.width).toBe(200);
  expect(narrowing.left).toBe(100);
  // widening down is symmetric
  const widening = labelBoxForBand({
    centerX: 200,
    topWidth: 100,
    bottomWidth: 300,
    slanted: true,
  });
  expect(widening.width).toBe(200);
  expect(widening.left).toBe(100);
});

test("labelBoxForBand defaults the bottom edge to the top width", () => {
  // last band without a next step keeps its own width
  const box = labelBoxForBand({ centerX: 50, topWidth: 40, slanted: true });
  expect(box.width).toBe(40);
  expect(box.left).toBe(30);
});

test("labelBoxForHalfBand anchors the box to the axis", () => {
  // bars: box spans the band extent, right edge on the axis
  const bars = labelBoxForHalfBand({
    axis: 200,
    topWidth: 80,
    slanted: false,
  });
  expect(bars.width).toBe(80);
  expect(bars.left).toBe(120);
  // slanted band: mid-row extent, right edge on the axis
  const slanted = labelBoxForHalfBand({
    axis: 200,
    topWidth: 300,
    bottomWidth: 100,
    slanted: true,
  });
  expect(slanted.width).toBe(200);
  expect(slanted.left).toBe(0);
  // negative widths collapse to a zero box at the axis
  const degenerate = labelBoxForHalfBand({
    axis: 50,
    topWidth: -10,
    slanted: false,
  });
  expect(degenerate.width).toBe(0);
  expect(degenerate.left).toBe(50);
});

test("buildSmoothHalfBandPath keeps the right edge on the axis", () => {
  const d = buildSmoothHalfBandPath({
    axis: 200,
    y0: 0,
    height: 20,
    knotsY: [0, 20, 40],
    knotsW: [100, 60, 30],
    tangents: monotoneTangents([0, 20, 40], [100, 60, 30]),
    index: 0,
  });
  expect(d.startsWith("M200 0")).toBe(true);
  expect(d).toContain("C");
  expect(d.endsWith("Z")).toBe(true);
  // top-left corner is the top extent to the left of the axis
  expect(d).toContain("L100 0");
  // bottom edge returns to the axis at the band bottom
  expect(d).toContain("L200 20");
  // every x stays at or left of the axis
  const xs = [...d.matchAll(/-?[\d.]+(?= )/g)].map((match) =>
    Number(match[0]),
  );
  xs.filter((x) => Number.isFinite(x)).forEach((x) => expect(x).toBeLessThanOrEqual(200));
});

test("monotoneTangents recovers the slope for linear data", () => {
  const m = monotoneTangents([0, 10, 20, 30], [100, 80, 60, 40]);
  expect(m[0]).toBeCloseTo(-2);
  expect(m[3]).toBeCloseTo(-2);
  m.slice(1, 3).forEach((t) => expect(t).toBeCloseTo(-2));
});

test("monotoneTangents flattens at local extrema (no overshoot)", () => {
  // widths dip in the middle: 100 -> 50 -> 90
  const m = monotoneTangents([0, 10, 20], [100, 50, 90]);
  expect(m[1]).toBe(0);
  // control points must stay within the segment's value range
  const seg = hermiteToBezier(0, 100, m[0], 10, 50, m[1]);
  const w1 = seg.c1[1];
  const w2 = seg.c2[1];
  expect(w1).toBeLessThanOrEqual(100);
  expect(w1).toBeGreaterThanOrEqual(50);
  expect(w2).toBeLessThanOrEqual(100);
  expect(w2).toBeGreaterThanOrEqual(50);
});

test("monotoneTangents handles constant data", () => {
  const m = monotoneTangents([0, 10, 20], [5, 5, 5]);
  m.forEach((t) => expect(t).toBe(0));
});

test("monotoneTangents handles single point and empty input", () => {
  expect(monotoneTangents([1], [2])).toEqual([0]);
  expect(monotoneTangents([], [])).toEqual([]);
});

test("splitCubicFirstPart midpoint equals linear de Casteljau value", () => {
  const [c1, c2, p3] = splitCubicFirstPart(0, 10, 20, 30, 0.5);
  expect(p3).toBeCloseTo(15);
  expect(c1).toBeCloseTo(5);
  expect(c2).toBeCloseTo(10);
});

test("splitCubicFirstPart at t=0 and t=1 keeps the endpoints", () => {
  const atZero = splitCubicFirstPart(0, 10, 20, 30, 0);
  expect(atZero).toEqual([0, 0, 0]);
  const atOne = splitCubicFirstPart(0, 10, 20, 30, 1);
  expect(atOne[2]).toBe(30);
});

test("buildSmoothBandPath builds a closed path with curved sides", () => {
  const d = buildSmoothBandPath({
    cx: 100,
    y0: 0,
    height: 20,
    knotsY: [0, 20, 40],
    knotsW: [100, 60, 30],
    tangents: monotoneTangents([0, 20, 40], [100, 60, 30]),
    index: 0,
  });
  expect(d.startsWith("M")).toBe(true);
  expect(d).toContain("C");
  expect(d.endsWith("Z")).toBe(true);
  // top-left corner starts at cx - w/2 (top knot w=100)
  expect(d).toContain("M50 0");
  // bottom edge connects the sides at the second knot (w=60 -> x=100±30)
  expect(d).toContain("L130 20");
});

test("buildSmoothBandPath clamps to the band height when gapped", () => {
  // knots at 0 and 30, band height 20 -> the edge is split inside the segment
  const d = buildSmoothBandPath({
    cx: 100,
    y0: 0,
    height: 20,
    knotsY: [0, 30, 60],
    knotsW: [100, 60, 30],
    tangents: monotoneTangents([0, 30, 60], [100, 60, 30]),
    index: 0,
  });
  // the path must not go below y=20 (the band bottom)
  const ys = [...d.matchAll(/[\d.]+(?= ?(?:L|C|Z))/g)].map((match) =>
    Number(match[0]),
  );
  ys.forEach((y) => expect(y).toBeLessThanOrEqual(20.01));
});

test("buildSmoothBandPath last band ends at its own width", () => {
  const d = buildSmoothBandPath({
    cx: 100,
    y0: 20,
    height: 20,
    knotsY: [0, 20, 40],
    knotsW: [100, 60, 60],
    tangents: monotoneTangents([0, 20, 40], [100, 60, 60]),
    index: 1,
  });
  // bottom width equals the final knot width (60) -> x = 100 +/- 30
  expect(d).toContain("L130 40");
  expect(d).toContain("M70 20");
});
