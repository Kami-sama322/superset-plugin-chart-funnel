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
  buildFunnelSteps,
  orderStepsForRendering,
  RawStep,
  sortRawSteps,
  toFiniteNumber,
} from "./funnelData";

test("toFiniteNumber maps non-numeric values to 0", () => {
  expect(toFiniteNumber(42)).toBe(42);
  expect(toFiniteNumber("3.5")).toBe(3.5);
  expect(toFiniteNumber("abc")).toBe(0);
  expect(toFiniteNumber(null)).toBe(0);
  expect(toFiniteNumber(undefined)).toBe(0);
  expect(toFiniteNumber(Number.NaN)).toBe(0);
});

test("sortRawSteps sorts by value descending by default", () => {
  const steps: RawStep[] = [
    { label: "B", value: 10 },
    { label: "A", value: 30 },
    { label: "C", value: 20 },
  ];
  expect(sortRawSteps(steps, "value_desc").map((s) => s.label)).toEqual([
    "A",
    "C",
    "B",
  ]);
  expect(sortRawSteps(steps, "unknown" as never).map((s) => s.label)).toEqual([
    "A",
    "C",
    "B",
  ]);
});

test("sortRawSteps sorts by value ascending without mutating input", () => {
  const steps: RawStep[] = [
    { label: "B", value: 10 },
    { label: "A", value: 30 },
  ];
  const result = sortRawSteps(steps, "value_asc");
  expect(result.map((s) => s.label)).toEqual(["B", "A"]);
  expect(steps.map((s) => s.label)).toEqual(["B", "A"]);
});

test("sortRawSteps sorts alphabetically in both directions", () => {
  const steps: RawStep[] = [
    { label: "Won", value: 1 },
    { label: "Lead", value: 5 },
    { label: "Deal", value: 3 },
  ];
  expect(sortRawSteps(steps, "alpha_asc").map((s) => s.label)).toEqual([
    "Deal",
    "Lead",
    "Won",
  ]);
  expect(sortRawSteps(steps, "alpha_desc").map((s) => s.label)).toEqual([
    "Won",
    "Lead",
    "Deal",
  ]);
});

test("buildFunnelSteps computes conversion percentages", () => {
  const [first, second, third] = buildFunnelSteps([
    { label: "a", value: 100 },
    { label: "b", value: 50 },
    { label: "c", value: 25 },
  ]);
  expect(first.percentFirst).toBe(1);
  expect(first.percentPrevious).toBeNull();
  expect(second.percentFirst).toBeCloseTo(0.5);
  expect(second.percentPrevious).toBeCloseTo(0.5);
  expect(third.percentFirst).toBeCloseTo(0.25);
  expect(third.percentPrevious).toBeCloseTo(0.5);
});

test("buildFunnelSteps uses the first step value, not the max, for percentFirst", () => {
  const steps = buildFunnelSteps([
    { label: "a", value: 20 },
    { label: "b", value: 50 },
  ]);
  expect(steps[1].percentFirst).toBeCloseTo(2.5);
});

test("buildFunnelSteps handles pear-shaped funnel widths", () => {
  const steps = buildFunnelSteps([
    { label: "a", value: 20 },
    { label: "b", value: 50 },
  ]);
  expect(steps[0].widthRatio).toBeCloseTo(0.4);
  expect(steps[1].widthRatio).toBeCloseTo(1);
});

test("buildFunnelSteps clamps negative values to zero width but keeps raw percent", () => {
  const steps = buildFunnelSteps([
    { label: "a", value: 10 },
    { label: "b", value: -5 },
  ]);
  expect(steps[1].widthRatio).toBe(0);
  expect(steps[1].value).toBe(-5);
});

test("buildFunnelSteps guards division by zero", () => {
  const steps = buildFunnelSteps([
    { label: "a", value: 0 },
    { label: "b", value: 0 },
  ]);
  expect(steps[0].widthRatio).toBe(1);
  expect(steps[1].widthRatio).toBe(1);
  expect(steps[1].percentFirst).toBeNull();
  expect(steps[1].percentPrevious).toBeNull();
});

test("buildFunnelSteps handles a single step", () => {
  const [only] = buildFunnelSteps([{ label: "a", value: 7 }]);
  expect(only.percentFirst).toBe(1);
  expect(only.percentPrevious).toBeNull();
  expect(only.widthRatio).toBe(1);
});

test("buildFunnelSteps keeps filterValue and extra", () => {
  const [step] = buildFunnelSteps([
    { label: "a", value: 7, filterValue: "raw", extra: { col: 1 } },
  ]);
  expect(step.filterValue).toBe("raw");
  expect(step.extra).toEqual({ col: 1 });
});

test("buildFunnelSteps reverseReference treats the last step as first", () => {
  const steps = buildFunnelSteps(
    [
      { label: "apex", value: 10 },
      { label: "mid", value: 20 },
      { label: "base", value: 40 },
    ],
    true,
  );
  // base (largest, last) is the process start
  expect(steps[2].percentFirst).toBe(1);
  expect(steps[2].percentPrevious).toBeNull();
  // mid converts from the band below (base)
  expect(steps[1].percentFirst).toBeCloseTo(0.5);
  expect(steps[1].percentPrevious).toBeCloseTo(0.5);
  // apex converts from mid
  expect(steps[0].percentFirst).toBeCloseTo(0.25);
  expect(steps[0].percentPrevious).toBeCloseTo(0.5);
});

test("buildFunnelSteps reverseReference guards zero reference", () => {
  const steps = buildFunnelSteps(
    [
      { label: "apex", value: 5 },
      { label: "base", value: 0 },
    ],
    true,
  );
  expect(steps[1].percentFirst).toBe(1);
  expect(steps[0].percentFirst).toBeNull();
  expect(steps[0].percentPrevious).toBeNull();
});

const orderSteps: RawStep[] = [
  { label: "big", value: 100 },
  { label: "mid", value: 50 },
  { label: "small", value: 10 },
];

test("orderStepsForRendering keeps insertion order in fields mode for regular shapes", () => {
  const result = orderStepsForRendering(
    [
      { label: "b", value: 1 },
      { label: "a", value: 9 },
    ],
    { shape: "bars", dataMode: "fields", sort: "value_desc" },
  );
  expect(result.map((s) => s.label)).toEqual(["b", "a"]);
});

test("orderStepsForRendering puts the smallest value at the pyramid apex in fields mode too", () => {
  const result = orderStepsForRendering(
    [
      { label: "big", value: 9 },
      { label: "small", value: 1 },
    ],
    { shape: "pyramid", dataMode: "fields", sort: "value_desc" },
  );
  expect(result.map((s) => s.label)).toEqual(["small", "big"]);
  const inverted = orderStepsForRendering(
    [
      { label: "big", value: 9 },
      { label: "small", value: 1 },
    ],
    { shape: "pyramid_inverted", dataMode: "fields", sort: "value_asc" },
  );
  expect(inverted.map((s) => s.label)).toEqual(["big", "small"]);
});

test("orderStepsForRendering puts the smallest value at the pyramid apex", () => {
  const result = orderStepsForRendering(orderSteps, {
    shape: "pyramid",
    dataMode: "dimension",
    sort: "value_desc",
  });
  expect(result.map((s) => s.label)).toEqual(["small", "mid", "big"]);
});

test("orderStepsForRendering puts the largest value at the inverted pyramid top", () => {
  const result = orderStepsForRendering(orderSteps, {
    shape: "pyramid_inverted",
    dataMode: "dimension",
    sort: "value_asc",
  });
  expect(result.map((s) => s.label)).toEqual(["big", "mid", "small"]);
});

test("orderStepsForRendering follows the sort control for other shapes", () => {
  const asc = orderStepsForRendering(orderSteps, {
    shape: "funnel",
    dataMode: "dimension",
    sort: "value_asc",
  });
  expect(asc.map((s) => s.label)).toEqual(["small", "mid", "big"]);
  const desc = orderStepsForRendering(orderSteps, {
    shape: "bars",
    dataMode: "dimension",
    sort: "value_desc",
  });
  expect(desc.map((s) => s.label)).toEqual(["big", "mid", "small"]);
});
