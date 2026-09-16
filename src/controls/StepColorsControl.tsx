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
import { useMemo } from "react";
import { t } from "@apache-superset/core/translation";
import { useTheme } from "@apache-superset/core/theme";
import { ColorPicker, type ColorValue } from "@superset-ui/core/components";
import { ControlHeader } from "@superset-ui/chart-controls";
import { getCategoricalSchemeRegistry } from "@superset-ui/core";

type Props = {
  value?: Record<string, string> | null;
  onChange?: (value: Record<string, string>) => void;
  /** Step labels in display order, from the query result or step fields */
  stepNames?: string[];
  /**
   * Colors the chart falls back to when a step has no custom color —
   * lets the picker mirror what is actually rendered.
   */
  defaultColors?: string[];
  label?: string;
  description?: string;
  name?: string;
};

function toHex(color: ColorValue): string {
  const rgb = color.toRgb();
  const channel = (value: number) => {
    const hex = Math.round(value).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

export default function StepColorsControl({
  value,
  onChange,
  stepNames = [],
  defaultColors = [],
  ...headerProps
}: Props) {
  const theme = useTheme();
  const colors: Record<string, string> = useMemo(
    () => ({ ...(value || {}) }),
    [value],
  );

  const emit = (next: Record<string, string>) => {
    if (onChange) {
      onChange(next);
    }
  };

  const presetColors = (
    getCategoricalSchemeRegistry().get()?.colors || []
  ).slice(0, 9);

  const rows = stepNames.map((label, index) => ({
    label,
    fallback: defaultColors[index] || presetColors[0] || "#1fa8c9",
    removable: false,
  }));
  // Stale entries: colors set for steps that are no longer rendered
  Object.keys(colors)
    .filter((label) => !stepNames.includes(label))
    .forEach((label, index) =>
      rows.push({
        label,
        fallback:
          defaultColors[stepNames.length + index] ||
          presetColors[0] ||
          "#1fa8c9",
        removable: true,
      }),
    );

  return (
    <div>
      <ControlHeader {...headerProps} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.sizeUnit / 2,
        }}
      >
        {rows.map(({ label, fallback, removable }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.sizeUnit,
              minHeight: 28,
              padding: `0 ${theme.sizeUnit / 2}px`,
              margin: `0 -${theme.sizeUnit / 2}px`,
              borderRadius: theme.borderRadius,
              transition: "background-color 120ms ease-out",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme.colorFillQuaternary;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span
              style={{
                flex: "1 1 auto",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={label}
            >
              {label}
            </span>
            <ColorPicker
              value={colors[label] || fallback}
              onChangeComplete={(color: ColorValue) =>
                emit({ ...colors, [label]: toHex(color) })
              }
              presets={[{ label: "Theme colors", colors: presetColors }]}
            />
            {removable ? (
              <button
                type="button"
                onClick={() => {
                  const next = { ...colors };
                  delete next[label];
                  emit(next);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: theme.colorTextSecondary,
                  fontSize: 14,
                  lineHeight: 1,
                  width: 24,
                  height: 24,
                  borderRadius: theme.borderRadius,
                  transition:
                    "color 120ms ease-out, background-color 120ms ease-out",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.color = theme.colorError;
                  event.currentTarget.style.backgroundColor =
                    theme.colorFillQuaternary;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.color = theme.colorTextSecondary;
                  event.currentTarget.style.backgroundColor = "transparent";
                }}
                title={t("Remove color")}
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <span style={{ color: theme.colorTextSecondary, fontSize: 12 }}>
            {t("Run the query to see the steps here")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
