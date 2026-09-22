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
  buildValueText,
  cssFont,
  measureTextWidth,
  percentText,
  setMeasureContextFactory,
  truncateName,
} from "./labelUtils";
import { FunnelStep } from "./types";

const step: FunnelStep = {
  label: "Signup",
  value: 1000,
  percentFirst: 100,
  percentPrevious: 50,
  widthRatio: 0.5,
  color: "#3366cc",
  filterColumn: "stage",
  filterValue: "Signup",
  extra: {},
};

const fmtValue = (v: number) => String(v);
const fmtPct = (v: number) => `${v}%`;

test("percentText formats values and renders null as empty string", () => {
  expect(percentText(12.5, fmtPct)).toBe("12.5%");
  expect(percentText(null, fmtPct)).toBe("");
});

test("truncateName keeps names within the 20 char budget", () => {
  expect(truncateName("Signup")).toBe("Signup");
  expect(truncateName("x".repeat(20))).toBe("x".repeat(20));
  expect(truncateName("y".repeat(21))).toBe(`${"y".repeat(17)}...`);
  expect(truncateName("z".repeat(100))).toBe(`${"z".repeat(17)}...`);
  expect(truncateName("")).toBe("");
});

test("buildValueText renders only the metrics content for all types", () => {
  expect(buildValueText(step, "value", fmtValue, fmtPct)).toBe("1000");
  expect(buildValueText(step, "percent_first", fmtValue, fmtPct)).toBe("100%");
  expect(buildValueText(step, "percent_previous", fmtValue, fmtPct)).toBe(
    "50%",
  );
  expect(buildValueText(step, "value_percent_first", fmtValue, fmtPct)).toBe(
    "1000 · 100%",
  );
  expect(
    buildValueText(step, "value_percent_previous", fmtValue, fmtPct),
  ).toBe("1000 · 50%");
});

test("buildValueText keeps parity for null percents (empty string)", () => {
  expect(
    buildValueText(
      { ...step, percentFirst: null },
      "percent_first",
      fmtValue,
      fmtPct,
    ),
  ).toBe("");
});

test("cssFont builds a canvas font shorthand with the label weight", () => {
  expect(cssFont(12, "Inter, sans-serif")).toBe("500 12px Inter, sans-serif");
  expect(cssFont(14, "Roboto", 700)).toBe("700 14px Roboto");
});

test("measureTextWidth returns 0 for empty text without touching the canvas", () => {
  expect(measureTextWidth("", "500 12px sans-serif")).toBe(0);
});

test("measureTextWidth measures via canvas, applies the font and caches", () => {
  const measured: string[] = [];
  const fakeContext = {
    font: "",
    measureText: (text: string) => {
      measured.push(text);
      return { width: text.length * 10 };
    },
  } as unknown as CanvasRenderingContext2D;
  setMeasureContextFactory(() => fakeContext);
  try {
    expect(measureTextWidth("abcdef", "700 20px ReviewFont")).toBe(60);
    expect(fakeContext.font).toBe("700 20px ReviewFont");
    expect(measureTextWidth("abcdef", "700 20px ReviewFont")).toBe(60);
    expect(measured).toEqual(["abcdef"]);
    expect(measureTextWidth("abcdef", "800 20px ReviewFont")).toBe(60);
    expect(measured).toEqual(["abcdef", "abcdef"]);
  } finally {
    setMeasureContextFactory(null);
  }
});
