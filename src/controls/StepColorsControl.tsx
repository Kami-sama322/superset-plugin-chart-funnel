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
import { colorToHex } from "./colorToHex";

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
  }));

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
        {rows.map(({ label, fallback }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.sizeUnit,
              minHeight: 28,
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
                emit({ ...colors, [label]: colorToHex(color) })
              }
              presets={[{ label: t("Chart colors"), colors: presetColors }]}
            />
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
