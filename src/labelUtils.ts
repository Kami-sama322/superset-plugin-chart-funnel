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
import { FunnelStep, LabelContentType } from "./types";

/** Horizontal padding inside the funnel-bar value box (px) */
export const LABEL_INNER_PAD = 10;
/** Gap between a shifted-out value and the band edge it hangs on (px) */
export const LABEL_OUT_GAP = 6;
/** Font weight of the chart labels (kept in sync with the label styles) */
export const LABEL_FONT_WEIGHT = 500;
/** Maximum rendered length of a step name in the left column */
export const MAX_NAME_CHARS = 20;
/** Gap between the step-name column and the funnel / conversion zone (px) */
export const NAMES_GAP = 12;

const NAME_ELLIPSIS = "...";

export function percentText(
  value: number | null,
  format: (v: number) => string,
): string {
  return value === null ? "" : format(value);
}

/** Step name for the left column, capped at MAX_NAME_CHARS with "..." */
export function truncateName(name: string): string {
  return name.length > MAX_NAME_CHARS
    ? name.slice(0, MAX_NAME_CHARS - NAME_ELLIPSIS.length) + NAME_ELLIPSIS
    : name;
}

/**
 * Value part of a funnel bar label: the metric content selected by
 * Label content (value / percents / combos), rendered inside the bar.
 * The step name lives in the separate left column, never here.
 */
export function buildValueText(
  step: FunnelStep,
  contentType: LabelContentType,
  formatValue: (v: number) => string,
  formatPercent: (v: number) => string,
): string {
  const value = formatValue(step.value);
  switch (contentType) {
    case "percent_first":
      return percentText(step.percentFirst, formatPercent);
    case "percent_previous":
      return percentText(step.percentPrevious, formatPercent);
    case "value_percent_first":
      return `${value} · ${percentText(step.percentFirst, formatPercent)}`;
    case "value_percent_previous":
      return `${value} · ${percentText(step.percentPrevious, formatPercent)}`;
    case "value":
    default:
      return value;
  }
}

/** CSS font shorthand for canvas text measurement. */
export function cssFont(
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string = LABEL_FONT_WEIGHT,
): string {
  return `${fontWeight} ${fontSize}px ${fontFamily}`;
}

type MeasureContextFactory = () => CanvasRenderingContext2D | null;

function defaultContextFactory(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.createElement("canvas").getContext("2d");
}

let contextFactory: MeasureContextFactory = defaultContextFactory;
let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * Test seam: replace the canvas context factory (jsdom has no canvas).
 * `null` restores the default factory.
 */
export function setMeasureContextFactory(
  factory: MeasureContextFactory | null,
): void {
  contextFactory = factory ?? defaultContextFactory;
  measureContext = undefined;
}

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext === undefined) {
    measureContext = contextFactory();
  }
  return measureContext;
}

/** Bounded result cache — measureText runs on every render of the chart
 * (tooltip mouse moves re-render the whole component), and measuring the
 * same string/font pair over and over is pure waste. */
const MEASURE_CACHE_LIMIT = 500;
let measureCache: Record<string, number> = {};

/**
 * Rendered width of `text` in the given CSS font via canvas measureText.
 * Returns 0 when no canvas is available (SSR, unit tests) — the caller
 * then sees a zero-width name column and keeps the funnel full-width.
 */
export function measureTextWidth(text: string, font: string): number {
  if (!text) {
    return 0;
  }
  const ctx = getMeasureContext();
  if (!ctx) {
    return 0;
  }
  const cacheKey = `${font}\u0000${text}`;
  const { [cacheKey]: cached } = measureCache;
  if (cached !== undefined) {
    return cached;
  }
  ctx.font = font;
  const { width } = ctx.measureText(text);
  if (Object.keys(measureCache).length >= MEASURE_CACHE_LIMIT) {
    measureCache = {};
  }
  measureCache[cacheKey] = width;
  return width;
}
