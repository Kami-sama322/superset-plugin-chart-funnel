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
  getCategoricalSchemeRegistry,
  getSequentialSchemeRegistry,
} from "@superset-ui/core";
import { FunnelColorMode } from "./types";

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  transparent: "#00000000",
};

export function parseColorToHex(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const input = value.trim().toLowerCase();
  if (!input) {
    return null;
  }
  if (input.startsWith("#")) {
    if (/^#[0-9a-f]{3}$/.test(input) || /^#[0-9a-f]{4}$/.test(input)) {
      return `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}`;
    }
    if (/^#[0-9a-f]{6}$/.test(input) || /^#[0-9a-f]{8}$/.test(input)) {
      return input.slice(0, 7);
    }
    return null;
  }
  const rgbMatch = input.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/,
  );
  if (rgbMatch) {
    const channel = (raw: string) => {
      const hex = Math.max(0, Math.min(255, Number(raw)))
        .toString(16)
        .padStart(2, "0");
      return hex;
    };
    return `#${channel(rgbMatch[1])}${channel(rgbMatch[2])}${channel(rgbMatch[3])}`;
  }
  return NAMED_COLORS[input] || null;
}

export function normalizeHexColor(value: unknown): string | null {
  return parseColorToHex(value);
}

function categoricalSchemeColors(): string[] {
  const scheme = getCategoricalSchemeRegistry().get();
  return (scheme && scheme.colors) || [];
}

export function fallbackColors(count: number): string[] {
  if (count <= 0) {
    return [];
  }
  const colors = categoricalSchemeColors();
  const safeColors =
    colors.length > 0 ? colors : ["#1fa8c9", "#454e7c", "#5ac18e"];
  return Array.from(
    { length: count },
    (_, index) => safeColors[index % safeColors.length],
  );
}

export function gradientColors(
  scheme: string | string[] | undefined,
  count: number,
): string[] {
  if (count <= 0) {
    return [];
  }
  if (Array.isArray(scheme)) {
    const normalized = scheme
      .map((color) => parseColorToHex(color))
      .filter((color): color is string => color !== null);
    if (normalized.length === 0) {
      return fallbackColors(count);
    }
    if (normalized.length === 1) {
      return Array.from({ length: count }, () => normalized[0]);
    }
    return Array.from({ length: count }, (_, index) => {
      const position =
        count === 1 ? 0 : (index / (count - 1)) * (normalized.length - 1);
      return normalized[Math.round(position)];
    });
  }
  const registry = getSequentialSchemeRegistry();
  const resolved = scheme ? registry.get(scheme) : registry.get();
  if (!resolved || resolved.colors.length === 0) {
    return fallbackColors(count);
  }
  return resolved
    .getColors(count)
    .map((color) => parseColorToHex(color) || color);
}

export function resolveStepColors(options: {
  colorMode: FunnelColorMode;
  scheme?: string | string[];
  stepColors?: Record<string, string>;
  labels: string[];
}): string[] {
  const { colorMode, scheme, stepColors, labels } = options;
  if (colorMode === "custom") {
    const fallback = fallbackColors(labels.length);
    return labels.map(
      (label, index) =>
        normalizeHexColor(stepColors?.[label]) || fallback[index],
    );
  }
  return gradientColors(scheme, labels.length);
}

export function isDarkColor(color: string): boolean {
  const hex = parseColorToHex(color);
  if (!hex) {
    return false;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55;
}
