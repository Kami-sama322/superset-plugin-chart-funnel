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
  buildDimensionDataMask,
  buildFieldDataMask,
  isSelectedValue,
  toggleSelectedValue,
} from "./crossFilter";

test("isSelectedValue matches by string form", () => {
  expect(isSelectedValue(["a", 1], "a")).toBe(true);
  expect(isSelectedValue(["a", 1], 1)).toBe(true);
  expect(isSelectedValue(["a"], "b")).toBe(false);
  expect(isSelectedValue(null, "a")).toBe(false);
  expect(isSelectedValue(undefined, "a")).toBe(false);
});

test("toggleSelectedValue adds and removes without mutating the input", () => {
  const current = ["a"];
  const added = toggleSelectedValue(current, "b");
  expect(added).toEqual(["a", "b"]);
  expect(current).toEqual(["a"]);
  const removed = toggleSelectedValue(added, "a");
  expect(removed).toEqual(["b"]);
  const reRemoved = toggleSelectedValue(added, "b");
  expect(reRemoved).toEqual(["a"]);
  expect(toggleSelectedValue(null, "a")).toEqual(["a"]);
});

test("buildDimensionDataMask emits IN filter for selection", () => {
  const mask = buildDimensionDataMask("stage", ["lead", "deal"], (v) =>
    String(v),
  );
  expect(mask.extraFormData?.filters).toEqual([
    { col: "stage", op: "IN", val: ["lead", "deal"] },
  ]);
  expect(mask.filterState?.value).toEqual(["lead", "deal"]);
  expect(mask.filterState?.selectedValues).toEqual(["lead", "deal"]);
  expect(mask.filterState?.label).toBe("lead, deal");
});

test("buildDimensionDataMask clears the filter on empty selection", () => {
  const mask = buildDimensionDataMask("stage", [], (v) => String(v));
  expect(mask.extraFormData?.filters).toEqual([]);
  expect(mask.filterState?.value).toBeNull();
  expect(mask.filterState?.selectedValues).toBeNull();
});

test("buildDimensionDataMask clears the filter when column is missing", () => {
  const mask = buildDimensionDataMask("", ["lead"], (v) => String(v));
  expect(mask.extraFormData?.filters).toEqual([]);
});

test("buildFieldDataMask emits IS NOT NULL filter when selected", () => {
  const mask = buildFieldDataMask("purchased", true);
  expect(mask.extraFormData?.filters).toEqual([
    { col: "purchased", op: "IS NOT NULL" },
  ]);
  expect(mask.filterState?.value).toEqual(["purchased"]);
  expect(mask.filterState?.label).toBe("purchased");
});

test("buildFieldDataMask clears the filter when deselected", () => {
  const mask = buildFieldDataMask("purchased", false);
  expect(mask.extraFormData?.filters).toEqual([]);
  expect(mask.filterState?.value).toBeNull();
  expect(mask.filterState?.selectedValues).toBeNull();
});
