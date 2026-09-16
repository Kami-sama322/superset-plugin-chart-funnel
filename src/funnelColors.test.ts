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
  getSequentialSchemeRegistry,
  SequentialScheme,
} from "@superset-ui/core";
import {
  fallbackColors,
  gradientColors,
  isDarkColor,
  normalizeHexColor,
  parseColorToHex,
  resolveStepColors,
} from "./funnelColors";

const TEST_SCHEME_ID = "funnel_test_black_white";

getSequentialSchemeRegistry().registerValue(
  TEST_SCHEME_ID,
  new SequentialScheme({
    id: TEST_SCHEME_ID,
    colors: ["black", "white"],
  }),
);

test("gradientColors distributes a registered scheme across steps", () => {
  const colors = gradientColors(TEST_SCHEME_ID, 4);
  expect(colors).toHaveLength(4);
  expect(colors[0]).toBe("#000000");
  expect(colors[3]).toBe("#ffffff");
  expect(colors[1]).not.toBe(colors[2]);
});

test("gradientColors samples from an inline color array", () => {
  const colors = gradientColors(["#ff0000", "#00ff00", "#0000ff"], 5);
  expect(colors).toEqual([
    "#ff0000",
    "#00ff00",
    "#00ff00",
    "#0000ff",
    "#0000ff",
  ]);
});

test("gradientColors normalizes rgb() and named colors in arrays", () => {
  const colors = gradientColors(["rgb(0, 0, 0)", "white"], 2);
  expect(colors).toEqual(["#000000", "#ffffff"]);
});

test("gradientColors returns fallback for unknown scheme id", () => {
  const colors = gradientColors("no_such_scheme_id_xyz", 2);
  expect(colors).toHaveLength(2);
  expect(colors.every((color) => color.startsWith("#"))).toBe(true);
});

test("gradientColors handles empty input", () => {
  expect(gradientColors(undefined, 0)).toEqual([]);
});

test("resolveStepColors in custom mode maps labels and falls back", () => {
  const colors = resolveStepColors({
    colorMode: "custom",
    stepColors: { Lead: "#112233" },
    labels: ["Lead", "Deal", "Won"],
  });
  expect(colors[0]).toBe("#112233");
  expect(colors[1]).toMatch(/^#/);
  expect(colors[2]).toMatch(/^#/);
});

test("resolveStepColors in custom mode ignores invalid entries", () => {
  const colors = resolveStepColors({
    colorMode: "custom",
    stepColors: { Lead: "not-a-color" },
    labels: ["Lead", "Deal"],
  });
  expect(colors[0]).not.toBe("not-a-color");
  expect(colors[0]).toMatch(/^#/);
});

test("resolveStepColors in gradient mode ignores stepColors", () => {
  const colors = resolveStepColors({
    colorMode: "gradient",
    scheme: TEST_SCHEME_ID,
    stepColors: { Lead: "#112233" },
    labels: ["Lead", "Deal"],
  });
  expect(colors).toEqual(gradientColors(TEST_SCHEME_ID, 2));
});

test("parseColorToHex supports hex, rgb and named colors", () => {
  expect(parseColorToHex("#fff")).toBe("#ffffff");
  expect(parseColorToHex("#AABBCC")).toBe("#aabbcc");
  expect(parseColorToHex("#AABBCCDD")).toBe("#aabbcc");
  expect(parseColorToHex("rgb(255, 0, 0)")).toBe("#ff0000");
  expect(parseColorToHex("rgba(0, 255, 0, 0.5)")).toBe("#00ff00");
  expect(parseColorToHex("white")).toBe("#ffffff");
  expect(parseColorToHex("BLACK")).toBe("#000000");
  expect(parseColorToHex("hsl(1, 2, 3)")).toBeNull();
  expect(parseColorToHex("")).toBeNull();
  expect(parseColorToHex(null)).toBeNull();
  expect(parseColorToHex(42)).toBeNull();
});

test("normalizeHexColor normalizes hex, rgb and named colors", () => {
  expect(normalizeHexColor("#fff")).toBe("#ffffff");
  expect(normalizeHexColor("red")).toBe("#ff0000");
  expect(normalizeHexColor("#12345")).toBeNull();
  expect(normalizeHexColor(null)).toBeNull();
});

test("isDarkColor detects text contrast needs", () => {
  expect(isDarkColor("#000000")).toBe(true);
  expect(isDarkColor("#112233")).toBe(true);
  expect(isDarkColor("rgb(0, 0, 0)")).toBe(true);
  expect(isDarkColor("#ffffff")).toBe(false);
  expect(isDarkColor("#ffff00")).toBe(false);
  expect(isDarkColor("not-a-color")).toBe(false);
});

test("fallbackColors cycles palette entries", () => {
  const colors = fallbackColors(3);
  expect(colors).toHaveLength(3);
  expect(fallbackColors(0)).toEqual([]);
});
