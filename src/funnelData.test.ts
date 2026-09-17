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
  normalizeSort,
  orderStepsForDataMode,
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
    { reverseReference: true },
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
    { reverseReference: true },
  );
  expect(steps[1].percentFirst).toBe(1);
  expect(steps[0].percentFirst).toBeNull();
  expect(steps[0].percentPrevious).toBeNull();
});

test("fields mode anchors percentages at the first field (the base)", () => {
  // the user owns the field order: the first field is always the 100%
  // reference even when later fields are wider
  const steps = buildFunnelSteps(
    [
      { label: "signups", value: 500 },
      { label: "visits", value: 1000 },
      { label: "purchases", value: 250 },
    ],
    { reverseReference: false },
  );
  expect(steps[0].percentFirst).toBe(1);
  expect(steps[0].percentPrevious).toBeNull();
  expect(steps[1].percentFirst).toBeCloseTo(2);
  expect(steps[1].percentPrevious).toBeCloseTo(2);
  expect(steps[2].percentFirst).toBeCloseTo(0.5);
  // percent of previous = of the preceding field (visits), not of the base
  expect(steps[2].percentPrevious).toBeCloseTo(0.25);
});

test("ascending sort with the base at the bottom keeps conversions at or under 100%", () => {
  const steps = buildFunnelSteps(
    [
      { label: "small", value: 25 },
      { label: "mid", value: 50 },
      { label: "wide", value: 100 },
    ],
    { reverseReference: true },
  );
  expect(steps[0].percentFirst).toBeCloseTo(0.25);
  expect(steps[0].percentPrevious).toBeCloseTo(0.5);
  expect(steps[1].percentFirst).toBeCloseTo(0.5);
  expect(steps[1].percentPrevious).toBeCloseTo(0.5);
  expect(steps[2].percentFirst).toBe(1);
  expect(steps[2].percentPrevious).toBeNull();
});

test("buildFunnelSteps sqrt and log scales compress the width range", () => {
  const raw = [
    { label: "huge", value: 10000 },
    { label: "tiny", value: 1 },
  ];
  const linear = buildFunnelSteps(raw, { widthScale: "linear" });
  const sqrt = buildFunnelSteps(raw, { widthScale: "sqrt" });
  const log = buildFunnelSteps(raw, { widthScale: "log" });
  expect(linear[1].widthRatio).toBeCloseTo(0.0001);
  // sqrt lifts the small value far above linear
  expect(sqrt[1].widthRatio).toBeCloseTo(0.01);
  // log lifts it even higher
  expect(log[1].widthRatio).toBeGreaterThan(sqrt[1].widthRatio);
  // tops stay at full width
  expect(linear[0].widthRatio).toBe(1);
  expect(sqrt[0].widthRatio).toBe(1);
  expect(log[0].widthRatio).toBe(1);
});

test("buildFunnelSteps width scale guards zero max", () => {
  const steps = buildFunnelSteps([{ label: "a", value: 0 }], {
    widthScale: "log",
  });
  expect(steps[0].widthRatio).toBe(1);
});

const orderSteps: RawStep[] = [
  { label: "big", value: 100 },
  { label: "mid", value: 50 },
  { label: "small", value: 10 },
];

test("sortRawSteps breaks value ties by name in the sort direction", () => {
  const tied: RawStep[] = [
    { label: "global_search", value: 1 },
    { label: "commits", value: 1 },
  ];
  // ascending: alphabetical; descending: reverse alphabetical, so DESC is
  // the exact reverse of ASC and the apex keeps the same step
  expect(sortRawSteps(tied, "value_asc").map((s) => s.label)).toEqual([
    "commits",
    "global_search",
  ]);
  expect(sortRawSteps(tied, "value_desc").map((s) => s.label)).toEqual([
    "global_search",
    "commits",
  ]);
  // independent of the input order
  const flipped: RawStep[] = [tied[0], tied[1]];
  expect(sortRawSteps(flipped, "value_asc").map((s) => s.label)).toEqual([
    "commits",
    "global_search",
  ]);
  expect(sortRawSteps(flipped, "value_desc").map((s) => s.label)).toEqual([
    "global_search",
    "commits",
  ]);
});

test("normalizeSort keeps value sorts and maps legacy alphabetical sorts", () => {
  expect(normalizeSort("value_asc")).toBe("value_asc");
  expect(normalizeSort("value_desc")).toBe("value_desc");
  expect(normalizeSort("alpha_asc")).toBe("value_asc");
  expect(normalizeSort("alpha_desc")).toBe("value_desc");
  expect(normalizeSort(undefined)).toBe("value_asc");
  expect(normalizeSort("garbage")).toBe("value_asc");
});

test("orderStepsForDataMode keeps the field order in fields mode (DESC)", () => {
  const steps: RawStep[] = [
    { label: "b", value: 1 },
    { label: "a", value: 9 },
  ];
  expect(
    orderStepsForDataMode(steps, {
      dataMode: "fields",
      sort: "value_desc",
    }).map((s) => s.label),
  ).toEqual(["b", "a"]);
});

test("orderStepsForDataMode flips the fields display for ASC (apex on top)", () => {
  const steps: RawStep[] = [
    { label: "b", value: 1 },
    { label: "a", value: 9 },
  ];
  expect(
    orderStepsForDataMode(steps, {
      dataMode: "fields",
      sort: "value_asc",
    }).map((s) => s.label),
  ).toEqual(["a", "b"]);
});

test("orderStepsForDataMode applies the sort control in dimension mode", () => {
  const steps: RawStep[] = [
    { label: "b", value: 1 },
    { label: "a", value: 9 },
  ];
  expect(
    orderStepsForDataMode(steps, {
      dataMode: "dimension",
      sort: "value_asc",
    }).map((s) => s.label),
  ).toEqual(["b", "a"]);
  expect(
    orderStepsForDataMode(steps, {
      dataMode: "dimension",
      sort: "alpha_desc",
    }).map((s) => s.label),
  ).toEqual(["a", "b"]);
});

test("orderStepsForRendering sorts by value ascending", () => {
  const result = orderStepsForRendering(
    [
      { label: "b", value: 1 },
      { label: "a", value: 9 },
    ],
    { sort: "value_asc" },
  );
  expect(result.map((s) => s.label)).toEqual(["b", "a"]);
});

test("orderStepsForRendering puts the smallest value at the pyramid apex", () => {
  const result = orderStepsForRendering(
    [
      { label: "big", value: 9 },
      { label: "small", value: 1 },
    ],
    { sort: "value_asc" },
  );
  expect(result.map((s) => s.label)).toEqual(["small", "big"]);
});

test("orderStepsForRendering puts the smallest value at the pyramid apex", () => {
  const result = orderStepsForRendering(orderSteps, {
    sort: "value_asc",
  });
  expect(result.map((s) => s.label)).toEqual(["small", "mid", "big"]);
});

test("orderStepsForRendering applies the same sort to the funnel family", () => {
  const funnel = orderStepsForRendering(orderSteps, {
    sort: "value_asc",
  });
  expect(funnel.map((s) => s.label)).toEqual(["small", "mid", "big"]);
  const bars = orderStepsForRendering(orderSteps, {
    sort: "value_desc",
  });
  expect(bars.map((s) => s.label)).toEqual(["big", "mid", "small"]);
});

test("orderStepsForRendering breaks value ties by name following the direction", () => {
  const tied: RawStep[] = [
    { label: "commits", value: 1 },
    { label: "global_search", value: 1 },
  ];
  const options = { sort: "value_desc" as const };
  const result = orderStepsForRendering(tied, options);
  expect(result.map((s) => s.label)).toEqual(["global_search", "commits"]);
});

test("orderStepsForRendering follows the sort control for other shapes", () => {
  const asc = orderStepsForRendering(orderSteps, {
    sort: "value_asc",
  });
  expect(asc.map((s) => s.label)).toEqual(["small", "mid", "big"]);
  const desc = orderStepsForRendering(orderSteps, {
    sort: "value_desc",
  });
  expect(desc.map((s) => s.label)).toEqual(["big", "mid", "small"]);
});
