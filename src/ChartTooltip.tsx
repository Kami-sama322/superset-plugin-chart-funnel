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
import type { CSSProperties } from "react";
import { useTheme } from "@apache-superset/core/theme";
import type { TooltipRow } from "./tooltipUtils";

type Props = {
  html: string;
  rows: TooltipRow[];
};

export default function ChartTooltip({ html, rows }: Props) {
  const theme = useTheme();
  const boxStyle: CSSProperties = {
    background: "rgba(20, 20, 20, 0.92)",
    color: "#fff",
    padding: `${theme.sizeUnit}px ${theme.sizeUnit * 1.5}px`,
    borderRadius: theme.borderRadius,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
    maxWidth: 320,
    fontSize: 12,
    lineHeight: 1.45,
    pointerEvents: "none",
    overflow: "visible",
    whiteSpace: "normal",
    wordBreak: "break-word",
  };
  const innerStyle: CSSProperties = {
    overflow: "visible",
    whiteSpace: "normal",
    wordBreak: "break-word",
    fontVariantNumeric: "tabular-nums",
  };
  const hasHtml = Boolean(html.trim());
  return (
    <div
      className="funnel-tooltip"
      data-tooltip-type="custom"
      role="tooltip"
      style={boxStyle}
    >
      {hasHtml ? (
        <div style={innerStyle} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        rows.map((row, index) => (
          <div key={`${row.label}-${row.value}-${index}`}>
            {row.label ? `${row.label}: ` : null}
            <strong>{row.value}</strong>
          </div>
        ))
      )}
    </div>
  );
}
