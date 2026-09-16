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
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { t } from "@apache-superset/core/translation";
import { useTheme } from "@apache-superset/core/theme";
import {
  DataRecordValue,
  ensureIsArray,
  getNumberFormatter,
} from "@superset-ui/core";
import ChartTooltip from "./ChartTooltip";
import {
  buildDimensionDataMask,
  buildFieldDataMask,
  isSelectedValue,
  toggleSelectedValue,
} from "./crossFilter";
import { isDarkColor } from "./funnelColors";
import { buildSmoothBandPath, monotoneTangents } from "./funnelGeometry";
import {
  buildTooltipHtml,
  buildTooltipRows,
  tooltipContentFields,
} from "./tooltipUtils";
import { FunnelStep, FunnelTransformedProps, LabelContentType } from "./types";
import { useTooltipPosition } from "./useTooltipPosition";

const PAD = 8;
const CONVERSION_COL_WIDTH = 76;
const TOOLTIP_OFFSET = 14;
const TOOLTIP_WIDTH = 240;
const TOOLTIP_HEIGHT = 150;
const MIN_STEP_HEIGHT_COMPRESSED = 4;
/** Minimum visible chart height for the viewport cap to kick in */
const MIN_VISIBLE_HEIGHT = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percentText(
  value: number | null,
  format: (v: number) => string,
): string {
  return value === null ? "" : format(value);
}

function labelText(
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

const STATUS_MESSAGES: Record<string, string> = {
  no_dimension: "Select a dimension column",
  no_fields: "Add step fields",
  no_data: "No data",
};

export default function Funnel(props: FunnelTransformedProps) {
  const {
    width,
    height,
    steps,
    dataMode,
    shape,
    labelContentType,
    showConversionColumn,
    showLabels,
    gap,
    stepThickness,
    numberFormat,
    percentFormat,
    metricLabel,
    statusKind,
    filterState,
    setDataMask,
    emitCrossFilters,
    tooltipTemplate,
    tooltipContents,
  } = props;

  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { tooltip, showTooltip, hideTooltip } = useTooltipPosition();

  // Keep the whole chart inside the visible part of the screen: if the
  // allocated height extends below the viewport bottom, cap it. The layout
  // above the chart (status bars, panels, filter bars) can shift at any time,
  // so re-measure on every render and on container/viewport resizes.
  const [cappedHeight, setCappedHeight] = useState(height);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") {
      return undefined;
    }
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - PAD * 2;
      const capped =
        available > MIN_VISIBLE_HEIGHT ? Math.min(height, available) : height;
      setCappedHeight((previous) =>
        Math.abs(previous - capped) < 0.5 ? previous : capped,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });
  const chartHeight = Math.max(50, Math.min(height, cappedHeight));

  const valueFormatter = useMemo(
    () => getNumberFormatter(numberFormat),
    [numberFormat],
  );
  const percentFormatter = useMemo(
    () => getNumberFormatter(percentFormat),
    [percentFormat],
  );

  const selectedValues = useMemo(
    () => ensureIsArray(filterState?.value) as DataRecordValue[],
    [filterState],
  );

  const extraFields = useMemo(
    () => tooltipContentFields(tooltipContents),
    [tooltipContents],
  );

  const stepCount = steps.length;
  const conversionWidth = showConversionColumn ? CONVERSION_COL_WIDTH : 0;
  const innerWidth = Math.max(10, width - PAD * 2 - conversionWidth);
  const innerHeight = Math.max(10, chartHeight - PAD * 2);
  const fixedThickness = stepThickness > 0;
  const isPyramid = shape === "pyramid" || shape === "pyramid_inverted";
  const isInvertedPyramid = shape === "pyramid_inverted";

  // Gap is compressed when there is no room for it; pyramids have none.
  const maxGap =
    stepCount > 1
      ? Math.max(
          0,
          (innerHeight - stepCount * MIN_STEP_HEIGHT_COMPRESSED) /
            (stepCount - 1),
        )
      : 0;
  const effectiveGap = isPyramid ? 0 : Math.min(gap, maxGap);
  // Bars always fit: a fixed thickness is scaled down uniformly when the
  // steps would overflow the chart height.
  const availableForBars = Math.max(
    0,
    innerHeight - (stepCount - 1) * effectiveGap,
  );
  const stepHeight =
    stepCount > 0
      ? Math.min(
          availableForBars / stepCount,
          Math.max(
            MIN_STEP_HEIGHT_COMPRESSED,
            fixedThickness ? stepThickness : availableForBars / stepCount,
          ),
        )
      : 0;
  const rowsHeight = stepCount * stepHeight + (stepCount - 1) * effectiveGap;
  const topOffset = PAD + Math.max(0, (innerHeight - rowsHeight) / 2);
  const centerX = PAD + innerWidth / 2;

  const stepTop = (index: number) =>
    topOffset + index * (stepHeight + effectiveGap);
  const barWidth = (step: FunnelStep) => step.widthRatio * innerWidth;
  const barLeft = (step: FunnelStep) => centerX - barWidth(step) / 2;
  /** top/bottom width of the geometric pyramid band at the given index */
  const pyramidBandWidths = (index: number) => {
    const fromApexTop = (index / stepCount) * innerWidth;
    const fromApexBottom = ((index + 1) / stepCount) * innerWidth;
    if (isInvertedPyramid) {
      return {
        top: innerWidth - fromApexTop,
        bottom: innerWidth - fromApexBottom,
      };
    }
    return { top: fromApexTop, bottom: fromApexBottom };
  };
  /** band width at its vertical middle — used for label placement */
  const pyramidLabelWidth = (index: number) => {
    const { top, bottom } = pyramidBandWidths(index);
    return (top + bottom) / 2;
  };

  const smoothKnots =
    shape === "funnel_smooth" && stepCount > 0
      ? (() => {
          const knotsY = steps.map((_, index) => stepTop(index));
          knotsY.push(stepTop(stepCount - 1) + stepHeight);
          const knotsW = steps.map((step) => barWidth(step));
          knotsW.push(knotsW[stepCount - 1]);
          return { knotsY, knotsW, tangents: monotoneTangents(knotsY, knotsW) };
        })()
      : null;

  const isStepSelected = (step: FunnelStep) =>
    isSelectedValue(
      selectedValues,
      dataMode === "fields" ? step.filterColumn : step.filterValue,
    );

  const handleStepClick = (step: FunnelStep) => {
    if (!emitCrossFilters) {
      return;
    }
    if (dataMode === "fields") {
      const currentlySelected = isSelectedValue(
        selectedValues,
        step.filterColumn,
      );
      setDataMask(buildFieldDataMask(step.filterColumn, !currentlySelected));
      return;
    }
    if (!step.filterColumn) {
      return;
    }
    const next = toggleSelectedValue(selectedValues, step.filterValue);
    const labelByValue = (value: DataRecordValue) =>
      steps.find((candidate) => String(candidate.filterValue) === String(value))
        ?.label ?? String(value);
    setDataMask(buildDimensionDataMask(step.filterColumn, next, labelByValue));
  };

  const tooltipInputFor = (step: FunnelStep) => ({
    label: step.label,
    value: step.value,
    valueFormatted: valueFormatter(step.value),
    percentFirst: step.percentFirst,
    percentFirstFormatted: percentText(step.percentFirst, percentFormatter),
    percentPrevious: step.percentPrevious,
    percentPreviousFormatted: percentText(
      step.percentPrevious,
      percentFormatter,
    ),
    extra: step.extra,
    extraFields,
  });

  const cursor = emitCrossFilters ? "pointer" : "default";

  const statusMessage = statusKind ? STATUS_MESSAGES[statusKind] : null;

  // The step list can shrink while the tooltip is open (query re-run) —
  // hide the tooltip instead of reading past the end of the array.
  const tooltipStep =
    tooltip && tooltip.stepIndex < steps.length
      ? steps[tooltip.stepIndex]
      : null;

  const tooltipStyle: CSSProperties | undefined = tooltip
    ? {
        position: "absolute",
        left: clamp(
          tooltip.x -
            (containerRef.current?.getBoundingClientRect().left ?? 0) +
            TOOLTIP_OFFSET,
          0,
          Math.max(0, width - TOOLTIP_WIDTH),
        ),
        top: clamp(
          tooltip.y -
            (containerRef.current?.getBoundingClientRect().top ?? 0) +
            TOOLTIP_OFFSET,
          0,
          Math.max(0, chartHeight - TOOLTIP_HEIGHT),
        ),
        zIndex: 10,
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width, height, overflow: "hidden" }}
      onMouseLeave={hideTooltip}
    >
      {statusMessage ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            color: theme.colorTextSecondary,
            fontSize: 14,
          }}
        >
          {t(statusMessage)}
        </div>
      ) : (
        <>
          <svg width={width} height={chartHeight} style={{ display: "block" }}>
            {steps.map((step, index) => {
              const selected = isStepSelected(step);
              const stroke = selected ? theme.colorPrimary : "transparent";
              const strokeWidth = selected ? 2 : 0;
              const hovered = tooltip?.stepIndex === index;
              const commonProps = {
                fill: step.color,
                stroke,
                strokeWidth,
                cursor,
                style: {
                  transition: "opacity 120ms ease-out, filter 120ms ease-out",
                  opacity: tooltip && !hovered ? 0.82 : 1,
                  filter: hovered ? "brightness(1.06)" : undefined,
                },
                onMouseMove: (event: ReactMouseEvent) =>
                  showTooltip(index, event),
                onClick: () => handleStepClick(step),
              };
              if (shape === "bars") {
                return (
                  <rect
                    key={step.label + index}
                    x={barLeft(step)}
                    y={stepTop(index)}
                    width={Math.max(0, barWidth(step))}
                    height={stepHeight}
                    rx={2}
                    {...commonProps}
                  />
                );
              }
              if (isPyramid) {
                const { top: topWidth, bottom: bottomWidth } =
                  pyramidBandWidths(index);
                const y1 = stepTop(index);
                const y2 = y1 + stepHeight;
                const points = [
                  [centerX - topWidth / 2, y1],
                  [centerX + topWidth / 2, y1],
                  [centerX + bottomWidth / 2, y2],
                  [centerX - bottomWidth / 2, y2],
                ]
                  .map(([x, y]) => `${x},${y}`)
                  .join(" ");
                return (
                  <polygon
                    key={step.label + index}
                    points={points}
                    {...commonProps}
                  />
                );
              }
              if (shape === "funnel_smooth" && smoothKnots) {
                const d = buildSmoothBandPath({
                  cx: centerX,
                  y0: stepTop(index),
                  height: stepHeight,
                  knotsY: smoothKnots.knotsY,
                  knotsW: smoothKnots.knotsW,
                  tangents: smoothKnots.tangents,
                  index,
                });
                return <path key={step.label + index} d={d} {...commonProps} />;
              }
              // shape === "funnel": trapezoids with sharp transitions
              const nextStep = steps[index + 1];
              const topWidth = barWidth(step);
              const bottomWidth = nextStep ? barWidth(nextStep) : topWidth;
              const y1 = stepTop(index);
              const y2 = y1 + stepHeight + (nextStep ? effectiveGap : 0);
              const points = [
                [centerX - topWidth / 2, y1],
                [centerX + topWidth / 2, y1],
                [centerX + bottomWidth / 2, y2],
                [centerX - bottomWidth / 2, y2],
              ]
                .map(([x, y]) => `${x},${y}`)
                .join(" ");
              return (
                <polygon
                  key={step.label + index}
                  points={points}
                  {...commonProps}
                />
              );
            })}
          </svg>
          {steps.map((step, index) => {
            const bandLabelWidth = isPyramid
              ? pyramidLabelWidth(index)
              : barWidth(step);
            const bandLabelLeft = isPyramid
              ? centerX - bandLabelWidth / 2
              : barLeft(step);
            return (
              <div key={`overlay-${step.label}-${index}`}>
                {showLabels ? (
                  <span
                    style={{
                      position: "absolute",
                      left: bandLabelLeft + 10,
                      top: stepTop(index),
                      width: Math.max(0, bandLabelWidth - 20),
                      height: stepHeight,
                      display: "flex",
                      alignItems: "center",
                      color: isDarkColor(step.color) ? "#fff" : theme.colorText,
                      fontSize: 12,
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                    title={step.label}
                  >
                    {step.label}&nbsp;·&nbsp;
                    {labelText(
                      step,
                      labelContentType,
                      valueFormatter,
                      percentFormatter,
                    )}
                  </span>
                ) : null}
                {showConversionColumn ? (
                  <span
                    style={{
                      position: "absolute",
                      right: PAD + 4,
                      top: stepTop(index),
                      height: stepHeight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      width: conversionWidth - 12,
                      color: theme.colorTextSecondary,
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                      pointerEvents: "none",
                    }}
                  >
                    {percentText(step.percentPrevious, percentFormatter)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </>
      )}
      {tooltip && tooltipStep ? (
        <div style={tooltipStyle}>
          <ChartTooltip
            html={buildTooltipHtml(
              tooltipTemplate,
              tooltipInputFor(tooltipStep),
              metricLabel,
            )}
            rows={buildTooltipRows(tooltipInputFor(tooltipStep), metricLabel)}
          />
        </div>
      ) : null}
    </div>
  );
}
