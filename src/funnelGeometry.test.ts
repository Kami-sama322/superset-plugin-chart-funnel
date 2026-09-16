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
  hermiteToBezier,
  monotoneTangents,
  splitCubicFirstPart,
} from "./funnelGeometry";

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
