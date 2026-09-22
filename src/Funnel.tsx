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
import {
  buildSmoothBandPath,
  buildSmoothHalfBandPath,
  labelBoxForBand,
  labelBoxForHalfBand,
  monotoneTangents,
  smoothBandBottomWidth,
} from "./funnelGeometry";
import {
  buildTooltipHtml,
  buildTooltipRows,
  tooltipContentFields,
} from "./tooltipUtils";
import {
  buildValueText,
  cssFont,
  LABEL_FONT_WEIGHT,
  LABEL_INNER_PAD,
  LABEL_OUT_GAP,
  measureTextWidth,
  NAMES_GAP,
  percentText,
  truncateName,
} from "./labelUtils";
import { FunnelStep, FunnelTransformedProps } from "./types";
import { useTooltipPosition } from "./useTooltipPosition";

const PAD = 8;
const CONVERSION_COL_WIDTH = 76;
/** Font weight of the conversion column text (regular, unlike the labels) */
const CONVERSION_FONT_WEIGHT = 400;
/** Funnel area narrower than this switches to the half-funnel layout */
const HALF_FUNNEL_TRIGGER_PX = 240;
/** Minimum room to the left of a band for the shifted-out value */
const MIN_SHIFT_ROOM_PX = 24;
const TOOLTIP_OFFSET = 14;
const TOOLTIP_WIDTH = 240;
const TOOLTIP_HEIGHT = 150;
/** Minimum rendered bar height after the fit scaling */
const MIN_BAR_HEIGHT = 2;
/** Minimum visible chart height for the viewport cap to kick in */
const MIN_VISIBLE_HEIGHT = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    conversionColumnContent,
    conversionColumnPosition,
    labelAlignment,
    labelColor,
    labelFontSize,
    sort,
    showLabels,
    gap,
    barHeightPct,
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

  // Canvas font shorthand matching the rendered label styles — used to
  // size the step-name column.
  const labelFont = useMemo(
    () => cssFont(labelFontSize, theme.fontFamily || "sans-serif"),
    [labelFontSize, theme.fontFamily],
  );

  // Step names live in their own left column, always left-aligned and
  // truncated to MAX_NAME_CHARS. The column hugs the longest truncated
  // name, so short names never squeeze the funnel.
  const namesWidth = useMemo(() => {
    let max = 0;
    for (const step of steps) {
      const w = measureTextWidth(truncateName(step.label), labelFont);
      if (w > max) {
        max = w;
      }
    }
    return steps.length > 0 ? max : 0;
  }, [steps, labelFont]);
  const namesZone = namesWidth > 0 ? namesWidth + NAMES_GAP : 0;

  const valueTexts = useMemo(
    () =>
      steps.map((step) =>
        buildValueText(
          step,
          labelContentType,
          valueFormatter,
          percentFormatter,
        ),
      ),
    [steps, labelContentType, valueFormatter, percentFormatter],
  );

  const conversionShown = conversionColumnContent !== "none";
  // Conversion column font follows Label font size, so its zone width is
  // measured from the actual texts (same regular weight the column uses),
  // floored at the historical fixed width to keep default charts stable.
  const conversionFont = useMemo(
    () =>
      cssFont(
        labelFontSize,
        theme.fontFamily || "sans-serif",
        CONVERSION_FONT_WEIGHT,
      ),
    [labelFontSize, theme.fontFamily],
  );
  const conversionTexts = useMemo(
    () =>
      steps.map((step) =>
        conversionColumnContent === "value"
          ? valueFormatter(step.value)
          : conversionColumnContent === "percent_first"
            ? percentText(step.percentFirst, percentFormatter)
            : percentText(step.percentPrevious, percentFormatter),
      ),
    [steps, conversionColumnContent, valueFormatter, percentFormatter],
  );
  const conversionWidth = useMemo(() => {
    if (!conversionShown) {
      return 0;
    }
    let max = 0;
    for (const text of conversionTexts) {
      const w = measureTextWidth(text, conversionFont);
      if (w > max) {
        max = w;
      }
    }
    return Math.max(CONVERSION_COL_WIDTH, Math.ceil(max) + 16);
  }, [conversionShown, conversionTexts, conversionFont]);

  const selectedValues = useMemo(
    () => ensureIsArray(filterState?.value) as DataRecordValue[],
    [filterState],
  );

  const extraFields = useMemo(
    () => tooltipContentFields(tooltipContents),
    [tooltipContents],
  );

  const stepCount = steps.length;
  const conversionOnLeft =
    conversionShown && conversionColumnPosition === "left";
  // Row zones: [conversion (left pos)][step names][funnel][conversion
  // (right pos)]. Step names always form the leftmost column next to the
  // funnel; the conversion column in the left position moves in front of
  // them. The funnel scales to whatever space is left.
  const namesLeft = PAD + (conversionOnLeft ? conversionWidth : 0);
  const contentLeft = namesLeft + namesZone;
  const innerWidth = Math.max(
    10,
    width - PAD * 2 - conversionWidth - namesZone,
  );
  const innerHeight = Math.max(10, chartHeight - PAD * 2);

  const isPyramid = shape === "pyramid";
  // DESC sorts mirror the pyramid geometry: the wide base sits on top and
  // the apex points down (the removed "inverted pyramid" shape lives on
  // through the Sort control). In the fields mode the control only flips
  // the display, so the same rule holds there.
  const pyramidMirrored = isPyramid && sort === "value_desc";

  // Layout model: request the layout from Bar height % (share of the full
  // height) + Gap, then scale the whole thing down uniformly when it does
  // not fit. Bars and gap shrink together — the chart always uses exactly
  // the available height and never jitters or overflows.
  const reqGap = isPyramid ? 0 : gap;
  const reqBar =
    stepCount > 0 ? (innerHeight / stepCount) * (barHeightPct / 100) : 0;
  const requestedTotal = stepCount * reqBar + (stepCount - 1) * reqGap;
  const fitScale =
    requestedTotal > 0 ? Math.min(1, innerHeight / requestedTotal) : 1;
  const barHeight = Math.max(MIN_BAR_HEIGHT, reqBar * fitScale);
  const effectiveGap = Math.max(0, reqGap * fitScale);
  const rowsHeight = stepCount * barHeight + (stepCount - 1) * effectiveGap;
  const topOffset = PAD + Math.max(0, (innerHeight - rowsHeight) / 2);
  const centerX = contentLeft + innerWidth / 2;
  // Compact layout for small charts: bands hang on a vertical axis at the
  // right edge of the funnel area (the left half of the funnel shape), so
  // the graph stays readable instead of shrinking into a tiny symmetric
  // triangle. Band extents stay the same, only the anchoring changes.
  const halfFunnel = innerWidth < HALF_FUNNEL_TRIGGER_PX;
  const axisX = contentLeft + innerWidth;

  const stepTop = (index: number) =>
    topOffset + index * (barHeight + effectiveGap);
  // Bars never disappear completely: a step with a value keeps a small
  // visible minimum width even in linear scale with huge outliers.
  const MIN_BAR_WIDTH_PX = 2;
  const barWidth = (step: FunnelStep) => {
    const scaled = step.widthRatio * innerWidth;
    return step.value > 0 ? Math.max(scaled, MIN_BAR_WIDTH_PX) : 0;
  };
  const barLeft = (step: FunnelStep) => centerX - barWidth(step) / 2;
  /** top/bottom width of the geometric pyramid band at the given index */
  const pyramidBandWidths = (index: number) => {
    const fromApexTop = (index / stepCount) * innerWidth;
    const fromApexBottom = ((index + 1) / stepCount) * innerWidth;
    if (pyramidMirrored) {
      return {
        top: innerWidth - fromApexTop,
        bottom: innerWidth - fromApexBottom,
      };
    }
    return { top: fromApexTop, bottom: fromApexBottom };
  };

  const smoothKnots =
    shape === "funnel_smooth" && stepCount > 0
      ? (() => {
          const knotsY = steps.map((_, index) => stepTop(index));
          knotsY.push(stepTop(stepCount - 1) + barHeight);
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
  // In the fields mode every step can carry its own metric — the tooltip
  // names the metric that actually produced this step's value.
  const tooltipMetricLabel = tooltipStep?.metricLabel ?? metricLabel;

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
              // Bands are purely visual — pointer events live on the
              // row-wide hit rects rendered after them.
              const bandStyle = {
                transition: "opacity 120ms ease-out, filter 120ms ease-out",
                opacity: tooltip && !hovered ? 0.82 : 1,
                filter: hovered ? "brightness(1.06)" : undefined,
              };
              if (shape === "bars") {
                return (
                  <rect
                    key={step.label + index}
                    x={halfFunnel ? axisX - barWidth(step) : barLeft(step)}
                    y={stepTop(index)}
                    width={Math.max(0, barWidth(step))}
                    height={barHeight}
                    rx={2}
                    fill={step.color}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    style={bandStyle}
                  />
                );
              }
              if (isPyramid) {
                const { top: topWidth, bottom: bottomWidth } =
                  pyramidBandWidths(index);
                const y1 = stepTop(index);
                const y2 = y1 + barHeight;
                const points = halfFunnel
                  ? [
                      [axisX, y1],
                      [axisX - topWidth, y1],
                      [axisX - bottomWidth, y2],
                      [axisX, y2],
                    ]
                  : [
                      [centerX - topWidth / 2, y1],
                      [centerX + topWidth / 2, y1],
                      [centerX + bottomWidth / 2, y2],
                      [centerX - bottomWidth / 2, y2],
                    ];
                return (
                  <polygon
                    key={step.label + index}
                    points={points.map(([x, y]) => `${x},${y}`).join(" ")}
                    fill={step.color}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    style={bandStyle}
                  />
                );
              }
              if (shape === "funnel_smooth" && smoothKnots) {
                const shared = {
                  y0: stepTop(index),
                  height: barHeight,
                  knotsY: smoothKnots.knotsY,
                  knotsW: smoothKnots.knotsW,
                  tangents: smoothKnots.tangents,
                  index,
                };
                const d = halfFunnel
                  ? buildSmoothHalfBandPath({ axis: axisX, ...shared })
                  : buildSmoothBandPath({ cx: centerX, ...shared });
                return (
                  <path
                    key={step.label + index}
                    d={d}
                    fill={step.color}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    style={bandStyle}
                  />
                );
              }
              // shape === "funnel": trapezoids with sharp transitions; each
              // band keeps its own height so equal values render equally
              const nextStep = steps[index + 1];
              const topWidth = barWidth(step);
              const bottomWidth = nextStep ? barWidth(nextStep) : topWidth;
              const y1 = stepTop(index);
              const y2 = y1 + barHeight;
              const points = halfFunnel
                ? [
                    [axisX, y1],
                    [axisX - topWidth, y1],
                    [axisX - bottomWidth, y2],
                    [axisX, y2],
                  ]
                : [
                    [centerX - topWidth / 2, y1],
                    [centerX + topWidth / 2, y1],
                    [centerX + bottomWidth / 2, y2],
                    [centerX - bottomWidth / 2, y2],
                  ];
              return (
                <polygon
                  key={step.label + index}
                  points={points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill={step.color}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  style={bandStyle}
                />
              );
            })}
            {/* Row-wide transparent hit targets: a narrow band (the funnel
                apex, thin rows) is nearly impossible to hover or click
                directly, so every step gets an invisible strip covering the
                whole funnel area — for the tooltip and the cross-filter
                click. Strips tile the rows exactly (half a gap on each
                side) and never overlap. */}
            {steps.map((step, index) => (
              <rect
                key={`hit-${step.label}-${index}`}
                x={contentLeft}
                y={stepTop(index) - effectiveGap / 2}
                width={innerWidth}
                height={barHeight + effectiveGap}
                fill="transparent"
                cursor={cursor}
                onMouseMove={(event: ReactMouseEvent) =>
                  showTooltip(index, event)
                }
                onClick={() => handleStepClick(step)}
              />
            ))}
          </svg>
          {steps.map((step, index) => {
            // The label is vertically centered in the band, so for slanted
            // shapes (funnel, smooth funnel, pyramid) its box must match
            // the band width at that middle row — sizing it by the top
            // edge alone puts left/right aligned text outside the shape.
            let topWidth: number;
            let bottomWidth: number;
            if (isPyramid) {
              ({ top: topWidth, bottom: bottomWidth } =
                pyramidBandWidths(index));
            } else {
              topWidth = barWidth(step);
              const nextWidth = steps[index + 1]
                ? barWidth(steps[index + 1])
                : topWidth;
              // the smooth edge spans (height + gap) between knots, so the
              // band's own bottom sits part-way along it
              bottomWidth =
                shape === "funnel_smooth"
                  ? smoothBandBottomWidth({
                      topWidth,
                      nextWidth,
                      height: barHeight,
                      gap: effectiveGap,
                    })
                  : nextWidth;
            }
            const { left: bandLabelLeft, width: bandLabelWidth } =
              halfFunnel
                ? labelBoxForHalfBand({
                    axis: axisX,
                    topWidth,
                    bottomWidth,
                    slanted: shape !== "bars",
                  })
                : labelBoxForBand({
                    centerX,
                    topWidth,
                    bottomWidth,
                    slanted: shape !== "bars",
                  });
            const labelJustify =
              labelAlignment === "center"
                ? "center"
                : labelAlignment === "right"
                  ? "flex-end"
                  : "flex-start";
            const valueText = valueTexts[index];
            // A value wider than its band moves out to the left of the
            // band's edge (onto the empty background), right-aligned with
            // it, instead of being clipped — in both the symmetric and the
            // half-funnel layouts. When there is no room to the left (the
            // widest band), it falls back to ellipsis inside the band.
            const valueFits =
              measureTextWidth(valueText, labelFont) <=
              Math.max(0, bandLabelWidth - LABEL_INNER_PAD * 2);
            const shiftRoom = Math.max(
              0,
              bandLabelLeft - LABEL_OUT_GAP - contentLeft,
            );
            const valueShiftedOut = !valueFits && shiftRoom >= MIN_SHIFT_ROOM_PX;
            const labelTextStyle: CSSProperties = {
              fontSize: labelFontSize,
              fontWeight: LABEL_FONT_WEIGHT,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            };
            return (
              <div key={`overlay-${step.label}-${index}`}>
                <span
                  style={{
                    position: "absolute",
                    left: namesLeft,
                    top: stepTop(index),
                    width: namesWidth,
                    height: barHeight,
                    display: "flex",
                    alignItems: "center",
                    color: theme.colorText,
                    pointerEvents: "none",
                    ...labelTextStyle,
                  }}
                >
                  {truncateName(step.label)}
                </span>
                {showLabels ? (
                  valueShiftedOut ? (
                    <span
                      style={{
                        position: "absolute",
                        right: width - bandLabelLeft + LABEL_OUT_GAP,
                        maxWidth: shiftRoom,
                        top: stepTop(index),
                        height: barHeight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        overflow: "hidden",
                        color: labelColor || theme.colorText,
                        pointerEvents: "none",
                        ...labelTextStyle,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{valueText}</span>
                    </span>
                  ) : (
                    <span
                      style={{
                        position: "absolute",
                        left: bandLabelLeft,
                        top: stepTop(index),
                        width: Math.max(0, bandLabelWidth),
                        height: barHeight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: labelJustify,
                        padding: `0 ${LABEL_INNER_PAD}px`,
                        boxSizing: "border-box",
                        color:
                          labelColor ||
                          (isDarkColor(step.color) ? "#fff" : theme.colorText),
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        pointerEvents: "none",
                        ...labelTextStyle,
                      }}
                    >
                      {valueText}
                    </span>
                  )
                ) : null}
                {conversionShown ? (
                  <span
                    style={{
                      position: "absolute",
                      // the left column sits in the band reserved between
                      // PAD and contentLeft — outside the funnel area
                      ...(conversionOnLeft
                        ? { left: PAD + 4 }
                        : { right: PAD + 4 }),
                      top: stepTop(index),
                      height: barHeight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: conversionOnLeft
                        ? "flex-start"
                        : "flex-end",
                      width: conversionWidth - 12,
                      color: theme.colorTextSecondary,
                      fontSize: labelFontSize,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                  >
                    {conversionTexts[index]}
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
              tooltipMetricLabel,
            )}
            rows={buildTooltipRows(
              tooltipInputFor(tooltipStep),
              tooltipMetricLabel,
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
