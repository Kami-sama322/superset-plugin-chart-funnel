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

/** Horizontal padding inside the in-band label box (px) */
export const LABEL_INNER_PAD = 10;
/** Gap between a shifted-out label and the band edge it hangs on (px) */
export const LABEL_OUT_GAP = 6;
/** Font weight of the band labels (kept in sync with the label style) */
export const LABEL_FONT_WEIGHT = 500;

const NBSP = "\u00A0";
const SEP = `${NBSP}·${NBSP}`;

export function percentText(
  value: number | null,
  format: (v: number) => string,
): string {
  return value === null ? "" : format(value);
}

function metricsText(
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

/**
 * Exact text rendered in a band label: "<label>·<metrics>" with
 * non-breaking spaces around the separator. Shared by the renderer and
 * the overflow measurement so both always see the same string.
 */
export function buildLabelText(
  step: FunnelStep,
  contentType: LabelContentType,
  formatValue: (v: number) => string,
  formatPercent: (v: number) => string,
): string {
  return `${step.label}${SEP}${metricsText(
    step,
    contentType,
    formatValue,
    formatPercent,
  )}`;
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
 * same label/font pair over and over is pure waste. */
const MEASURE_CACHE_LIMIT = 500;
let measureCache: Record<string, number> = {};

/**
 * Rendered width of `text` in the given CSS font via canvas measureText.
 * Returns 0 when no canvas is available (SSR, unit tests) — the caller
 * then never sees an overflow and keeps the classic in-band layout.
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

export type LabelMeasure = (text: string) => number;

/** True when the label text is wider than the space it is given. */
export function labelOverflows(
  text: string,
  availableWidth: number,
  measure: LabelMeasure,
): boolean {
  return measure(text) > availableWidth;
}
