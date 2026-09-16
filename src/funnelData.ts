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
import { DataRecordValue } from "@superset-ui/core";
import { DataMode, SortMode, ValueSortMode } from "./types";

export type RawStep = {
  label: string;
  value: number;
  filterValue?: DataRecordValue;
  extra?: Record<string, unknown>;
};

export type FunnelStepBase = {
  label: string;
  value: number;
  percentFirst: number | null;
  percentPrevious: number | null;
  widthRatio: number;
  filterValue: DataRecordValue;
  extra: Record<string, unknown>;
};

export function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareLabels(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function sortRawSteps(steps: RawStep[], sort: SortMode): RawStep[] {
  const sorted = [...steps];
  switch (sort) {
    // ties break by label in the SAME direction as the value sort, so DESC
    // is the exact reverse of ASC and the apex keeps the same step in both
    // directions
    case "value_asc":
      return sorted.sort(
        (a, b) => a.value - b.value || compareLabels(a.label, b.label),
      );
    case "alpha_asc":
      return sorted.sort((a, b) => compareLabels(a.label, b.label));
    case "alpha_desc":
      return sorted.sort((a, b) => compareLabels(b.label, a.label));
    case "value_desc":
    default:
      return sorted.sort(
        (a, b) => b.value - a.value || compareLabels(b.label, a.label),
      );
  }
}

/**
 * The Sort control offers ASC / DESC by metric value (ties break by name).
 * `alpha_*` are legacy values from saved dashboards — they map onto the
 * corresponding value sorts, anything unknown falls back to ASC.
 */
export function normalizeSort(sort: unknown): ValueSortMode {
  if (sort === "value_desc" || sort === "alpha_desc") {
    return "value_desc";
  }
  return "value_asc";
}

/**
 * Final step order before the geometric layout — the exact top-to-bottom
 * render order. Dimension mode applies the Sort control: ascending by
 * value by default, ties alphabetical, so the same dataset renders in the
 * same sequence regardless of the shape (for the pyramid, DESC mirrors the
 * geometry — base at the top, apex at the bottom). Fields mode never
 * re-orders: the step order is the field order.
 */
export function orderStepsForDataMode(
  steps: RawStep[],
  options: { dataMode: DataMode; sort: SortMode },
): RawStep[] {
  if (options.dataMode === "fields") {
    return [...steps];
  }
  return sortRawSteps(steps, normalizeSort(options.sort));
}

/**
 * Dimension-mode render order: applies the (normalized) Sort control.
 * Used by the control panel to keep lists in sync with the chart.
 */
export function orderStepsForRendering(
  steps: RawStep[],
  options: {
    sort: SortMode;
  },
): RawStep[] {
  return sortRawSteps(steps, normalizeSort(options.sort));
}

export type WidthScale = "linear" | "sqrt" | "log";

/**
 * The process starts at the widest band, so the 100% reference must sit on
 * the wide side of the shape: with the descending sort the widest step is
 * on top (direct references), with the ascending sort it is at the bottom
 * (reverse references) — either way the percentages stay ≤ 100%. The
 * fields mode always starts at the first field, whatever its value.
 */
export function isReverseReference(options: {
  dataMode: DataMode;
  sort: ValueSortMode;
}): boolean {
  return options.dataMode === "dimension" && options.sort === "value_asc";
}

export function widthRatioFor(
  value: number,
  maxValue: number,
  scale: WidthScale,
): number {
  const v = Math.max(0, value);
  const m = Math.max(0, maxValue);
  if (m <= 0) {
    return 1;
  }
  if (scale === "sqrt") {
    return Math.sqrt(v) / Math.sqrt(m);
  }
  if (scale === "log") {
    return Math.log1p(v) / Math.log1p(m);
  }
  return v / m;
}

export function buildFunnelSteps(
  sorted: RawStep[],
  options: { reverseReference?: boolean; widthScale?: WidthScale } = {},
): FunnelStepBase[] {
  const { reverseReference = false, widthScale = "linear" } = options;
  const n = sorted.length;
  const maxValue = sorted.reduce(
    (max, step) => Math.max(max, toFiniteNumber(step.value)),
    0,
  );
  const referenceValue = toFiniteNumber(
    sorted[reverseReference ? n - 1 : 0]?.value,
  );
  return sorted.map((step, index) => {
    const value = toFiniteNumber(step.value);
    const isFirst = reverseReference ? index === n - 1 : index === 0;
    const previousValue = reverseReference
      ? index < n - 1
        ? toFiniteNumber(sorted[index + 1].value)
        : null
      : index > 0
        ? toFiniteNumber(sorted[index - 1].value)
        : null;
    return {
      label: step.label,
      value,
      percentFirst: isFirst
        ? 1
        : referenceValue > 0
          ? value / referenceValue
          : null,
      percentPrevious:
        isFirst || previousValue === null
          ? null
          : previousValue > 0
            ? value / previousValue
            : null,
      widthRatio: widthRatioFor(value, maxValue, widthScale),
      filterValue: step.filterValue ?? step.label,
      extra: step.extra || {},
    };
  });
}
