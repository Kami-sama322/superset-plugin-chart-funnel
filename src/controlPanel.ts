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
import { t } from "@apache-superset/core/translation";
import {
  ensureIsArray,
  getMetricLabel,
  type DataRecord,
} from "@superset-ui/core";
import {
  ControlPanelConfig,
  ControlPanelState,
  ControlPanelsContainerProps,
  D3_FORMAT_DOCS,
  D3_FORMAT_OPTIONS,
  DEFAULT_NUMBER_FORMAT,
  defineSavedMetrics,
  sharedControls,
} from "@superset-ui/chart-controls";
import StepColorsControl from "./controls/StepColorsControl";
import StepMetricsControl from "./controls/StepMetricsControl";
import LabelColorControl from "./controls/LabelColorControl";
import { stepMetricKey } from "./stepMetrics";
import {
  normalizeSort,
  orderStepsForRendering,
  toFiniteNumber,
} from "./funnelData";
import {
  fallbackColors,
  parseColorToHex,
  resolveStepColors,
  schemePaletteColors,
} from "./funnelColors";
import {
  tooltipContentsControl,
  tooltipTemplateControl,
} from "./tooltipControl";

const dataModeValue = (
  controls: ControlPanelsContainerProps["controls"] | undefined,
): string => {
  const value = controls?.data_mode?.value;
  return value === "fields" || value === "dimension" ? value : "dimension";
};

const inDimensionMode = ({ controls }: ControlPanelsContainerProps) =>
  dataModeValue(controls) === "dimension";

const inFieldsMode = ({ controls }: ControlPanelsContainerProps) =>
  dataModeValue(controls) === "fields";

const inGradientMode = ({ controls }: ControlPanelsContainerProps) =>
  controls?.color_mode?.value !== "custom";

const inCustomMode = ({ controls }: ControlPanelsContainerProps) =>
  controls?.color_mode?.value === "custom";

const isGroupableColumn = (column: unknown) =>
  (column as { groupby?: boolean } | null)?.groupby !== false;

/** Query responses of the active chart (explore passes it as the 3rd
 * mapStateToProps argument). */
type ChartQueries = {
  queriesResponse?: { data?: DataRecord[] }[] | null;
};

const cellValue = (row: DataRecord, key: string): unknown => {
  if (key in row) {
    return row[key];
  }
  const match = Object.keys(row).find(
    (k) => k.toLowerCase() === key.toLowerCase(),
  );
  return match ? row[match] : undefined;
};

const metricLabelOf = (state: ControlPanelState): string => {
  const metric = state.form_data?.metric;
  return metric ? getMetricLabel(metric) : "COUNT(*)";
};

const columnLabel = (col: unknown): string => {
  if (typeof col === "string") {
    return col;
  }
  if (col && typeof col === "object") {
    const obj = col as Record<string, unknown>;
    if (typeof obj.column_name === "string" && obj.column_name) {
      return obj.column_name;
    }
    if (typeof obj.label === "string" && obj.label) {
      return obj.label;
    }
  }
  return "";
};

/**
 * Steps in the exact order the chart renders them, with their values —
 * reuses the chart's own ordering so the color list always matches.
 */
const orderedStepPairs = (
  state: ControlPanelState,
  chart?: ChartQueries,
): { label: string; value: number }[] => {
  const responses = chart?.queriesResponse || [];
  const sort = normalizeSort(state.form_data?.sort);
  const metricLabel = metricLabelOf(state);
  const dataMode =
    state.form_data?.data_mode === "fields" ? "fields" : "dimension";

  if (dataMode === "fields") {
    // The field order IS the step order; the Sort control only flips the
    // display (ASC puts the apex — the last field — on top), so this list
    // mirrors the rendered rows
    const pairs = ensureIsArray(state.form_data?.fields)
      .map(columnLabel)
      .filter((label: string) => Boolean(label))
      .map((label: string, index: number) => {
        const row: DataRecord = responses[index]?.data?.[0] || {};
        return {
          label,
          value: toFiniteNumber(cellValue(row, metricLabel)),
        };
      });
    return sort === "value_asc" ? [...pairs].reverse() : pairs;
  }

  const dimension = columnLabel(state.form_data?.groupby);
  if (!dimension) {
    return [];
  }
  const rows: DataRecord[] = responses[0]?.data || [];
  const pairs: { label: string; value: number }[] = [];
  const seen = new Set<string>();
  rows.forEach((row) => {
    const raw = cellValue(row, dimension);
    if (raw === null || raw === undefined || raw === "") {
      return;
    }
    const text = String(raw);
    if (seen.has(text)) {
      return;
    }
    seen.add(text);
    pairs.push({
      label: text,
      value: toFiniteNumber(cellValue(row, metricLabel)),
    });
  });
  return orderStepsForRendering(pairs, { sort });
};

const stepLabels = (state: ControlPanelState, chart?: ChartQueries): string[] =>
  orderedStepPairs(state, chart).map((pair) => pair.label);

/**
 * The palette the chart currently renders with, so the label color picker
 * offers the same colors that are on the bars: the sequential scheme in
 * the gradient mode, the resolved per-step colors in the custom mode.
 */
const chartPalette = (
  state: ControlPanelState,
  chart?: ChartQueries,
): string[] => {
  const colorMode =
    state.form_data?.color_mode === "custom" ? "custom" : "gradient";
  const scheme = state.form_data?.linear_color_scheme;
  // the scheme is only rendered in the gradient mode; the custom mode
  // paints steps with their own colors regardless of a stale scheme value
  if (colorMode === "gradient") {
    if (Array.isArray(scheme)) {
      const palette = scheme
        .map((color) => parseColorToHex(color))
        .filter((color): color is string => color !== null);
      if (palette.length > 0) {
        return palette;
      }
    } else {
      const palette = schemePaletteColors(
        typeof scheme === "string" ? scheme : undefined,
      );
      if (palette.length > 0) {
        return palette;
      }
    }
  }
  const colors = resolveStepColors({
    colorMode,
    scheme,
    stepColors: state.form_data?.step_colors,
    labels: stepLabels(state, chart),
  });
  return Array.from(new Set(colors));
};

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t("Query"),
      expanded: true,
      controlSetRows: [
        [
          {
            name: "data_mode",
            config: {
              type: "RadioButtonControl",
              label: t("Data mode"),
              description: t(
                "Dimension values: group the dataset by one column, one value is one funnel step. Fields as steps: each inserted column is a step in the order it was added; the metric of every step is set in Step metrics.",
              ),
              renderTrigger: false,
              default: "dimension",
              options: [
                { label: t("Dimension values"), value: "dimension" },
                { label: t("Fields as steps"), value: "fields" },
              ],
            },
          },
        ],
        [
          {
            name: "groupby",
            config: {
              ...sharedControls.groupby,
              label: t("Dimension"),
              description: t(
                "Column with funnel steps. Each distinct value becomes one step.",
              ),
              multi: false,
              clearable: true,
              default: null,
              validators: [],
              visibility: inDimensionMode,
            },
          },
        ],
        [
          {
            name: "fields",
            config: {
              type: "DndColumnSelect",
              label: t("Step fields"),
              description: t(
                "One column per funnel step. The order of steps matches the order of fields here.",
              ),
              multi: true,
              freeForm: true,
              clearable: true,
              default: [],
              ghostButtonText: t("Drop columns here or click"),
              visibility: inFieldsMode,
              shouldMapStateToProps: () => true,
              mapStateToProps: (state: ControlPanelState) => ({
                options: (state.datasource?.columns || []).filter(
                  isGroupableColumn,
                ),
              }),
            },
          },
        ],
        [
          {
            name: "step_metrics",
            config: {
              type: StepMetricsControl,
              label: t("Step metrics"),
              description: t(
                "Metric per step field. A newly added field starts with its own column and Count — switch the aggregate (e.g. Count distinct for unique counts, Sum for 0/1 flags), pick a saved metric, or write a custom SQL expression. A step without its own metric counts the rows where the field is filled (COUNT(*)).",
              ),
              renderTrigger: false,
              default: null,
              visibility: inFieldsMode,
              shouldMapStateToProps: () => true,
              mapStateToProps: (state: ControlPanelState) => ({
                fieldNames: ensureIsArray(state.form_data?.fields)
                  .map(stepMetricKey)
                  .filter(Boolean),
                columns: (state.datasource?.columns || []).filter(
                  isGroupableColumn,
                ),
                savedMetrics: defineSavedMetrics(state.datasource),
                fallbackMetricLabel: metricLabelOf(state),
              }),
            },
          },
        ],
        [
          {
            name: "metric",
            config: {
              ...sharedControls.metric,
              label: t("Metric"),
              description: t(
                "Metric for every step. In Fields as steps mode metrics are set per step in Step metrics; steps without their own metric fall back to this one, or COUNT(*) when empty.",
              ),
              validators: [],
              visibility: inDimensionMode,
            },
          },
        ],
        ["adhoc_filters"],
        [
          {
            name: "row_limit",
            config: {
              ...sharedControls.row_limit,
              default: 50,
              visibility: inDimensionMode,
            },
          },
        ],
        [
          {
            name: "sort",
            config: {
              type: "SelectControl",
              label: t("Sort"),
              description: t(
                "Dimension values: order by the metric value — ascending puts the smallest value on top, descending flips the chart; equal values are ordered by name in the same direction. Fields as steps: the field order defines the steps, and the control only flips the display — ascending puts the apex on top, descending the base.",
              ),
              renderTrigger: true,
              default: "value_asc",
              clearable: false,
              options: [
                { label: t("Ascending"), value: "value_asc" },
                { label: t("Descending"), value: "value_desc" },
              ],
            },
          },
        ],
      ],
    },
    {
      label: t("Display"),
      expanded: true,
      controlSetRows: [
        [
          {
            name: "shape",
            config: {
              type: "RadioButtonControl",
              label: t("Shape"),
              description: t(
                "Rectangles: separated centered bars, Power BI style. Funnel: trapezoids with sharp transitions. Smooth funnel: curved transitions. Pyramid: triangle, the smallest value at the apex. Inverted pyramid: the largest value at the top. In the fields mode the step order follows the field order.",
              ),
              renderTrigger: true,
              default: "bars",
              options: [
                ["bars", t("Rectangles")],
                ["funnel", t("Funnel")],
                ["funnel_smooth", t("Funnel (smooth)")],
                ["pyramid", t("Pyramid")],
              ],
            },
          },
        ],
        [
          {
            name: "color_mode",
            config: {
              type: "RadioButtonControl",
              label: t("Color mode"),
              renderTrigger: true,
              default: "gradient",
              options: [
                { label: t("Gradient"), value: "gradient" },
                { label: t("Custom"), value: "custom" },
              ],
            },
          },
        ],
        [
          {
            name: "linear_color_scheme",
            config: {
              ...sharedControls.linear_color_scheme,
              label: t("Gradient color scheme"),
              renderTrigger: true,
              visibility: inGradientMode,
            },
          },
        ],
        [
          {
            name: "step_colors",
            config: {
              type: StepColorsControl,
              label: t("Step colors"),
              description: t(
                "Set a color per step. Steps without a color use the categorical color scheme.",
              ),
              renderTrigger: true,
              default: null,
              visibility: inCustomMode,
              shouldMapStateToProps: () => true,
              mapStateToProps: (
                state: ControlPanelState,
                _controlState: unknown,
                chart?: ChartQueries,
              ) => {
                const stepNames = stepLabels(state, chart);
                return {
                  stepNames,
                  // same fallback the chart uses, so the picker shows the
                  // color that is actually rendered
                  defaultColors: fallbackColors(stepNames.length),
                };
              },
            },
          },
        ],
        [
          {
            name: "show_labels",
            config: {
              type: "CheckboxControl",
              label: t("Show labels"),
              renderTrigger: true,
              default: true,
            },
          },
        ],
        [
          {
            name: "label_alignment",
            config: {
              type: "SelectControl",
              label: t("Label alignment"),
              renderTrigger: true,
              default: "left",
              clearable: false,
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.show_labels?.value !== false,
              options: [
                { label: t("Left"), value: "left" },
                { label: t("Center"), value: "center" },
                { label: t("Right"), value: "right" },
              ],
            },
          },
        ],
        [
          {
            name: "label_color",
            config: {
              type: LabelColorControl,
              label: t("Label color"),
              description: t(
                "Font color for bar labels. Clear the color to use the automatic contrast.",
              ),
              renderTrigger: true,
              default: null,
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.show_labels?.value !== false,
              shouldMapStateToProps: () => true,
              mapStateToProps: (
                state: ControlPanelState,
                _controlState: unknown,
                chart?: ChartQueries,
              ) => ({
                // the picker offers the same palette the chart renders with
                chartColors: chartPalette(state, chart),
              }),
            },
          },
        ],
        [
          {
            name: "label_size",
            config: {
              type: "SliderControl",
              label: t("Label font size"),
              description: t("Label font size in pixels"),
              renderTrigger: true,
              min: 8,
              max: 28,
              step: 1,
              default: 12,
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.show_labels?.value !== false,
            },
          },
        ],
        [
          {
            name: "label_content_type",
            config: {
              type: "SelectControl",
              label: t("Label content"),
              description: t("What to show on each funnel bar"),
              renderTrigger: true,
              default: "value",
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.show_labels?.value !== false,
              options: [
                { label: t("Data value"), value: "value" },
                { label: t("Percent of first"), value: "percent_first" },
                { label: t("Percent of previous"), value: "percent_previous" },
                {
                  label: t("Data value, percent of first"),
                  value: "value_percent_first",
                },
                {
                  label: t("Data value, percent of previous"),
                  value: "value_percent_previous",
                },
              ],
            },
          },
        ],
        [
          {
            name: "show_conversion_column",
            config: {
              type: "CheckboxControl",
              label: t("Conversion column"),
              renderTrigger: true,
              default: true,
            },
          },
        ],
        [
          {
            name: "conversion_column_content",
            config: {
              type: "SelectControl",
              label: t("Conversion column content"),
              renderTrigger: true,
              default: "percent_previous",
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.show_conversion_column?.value !== false,
              options: [
                { label: t("Data value"), value: "value" },
                { label: t("Percent of previous"), value: "percent_previous" },
                { label: t("Percent of first"), value: "percent_first" },
              ],
            },
          },
        ],
        [
          {
            name: "conversion_column_position",
            config: {
              type: "SelectControl",
              label: t("Conversion column position"),
              renderTrigger: true,
              default: "right",
              clearable: false,
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                controls?.show_conversion_column?.value !== false,
              options: [
                { label: t("Left"), value: "left" },
                { label: t("Right"), value: "right" },
              ],
            },
          },
        ],
      ],
    },
    {
      label: t("Advanced display settings"),
      expanded: false,
      controlSetRows: [
        [
          {
            name: "gap",
            config: {
              type: "SliderControl",
              label: t("Gap between steps"),
              description: t("Ignored in pyramid shapes"),
              renderTrigger: true,
              min: 0,
              max: 40,
              step: 1,
              default: 8,
            },
          },
        ],
        [
          {
            name: "bar_height_pct",
            config: {
              type: "SliderControl",
              label: t("Bar height, %"),
              description: t(
                "100% — bars fill the screen (together with the gap), lower values make them thinner. Bars and gap scale down together when they do not fit.",
              ),
              renderTrigger: true,
              min: 10,
              max: 100,
              step: 5,
              default: 100,
            },
          },
        ],
        [
          {
            name: "width_scale",
            config: {
              type: "SelectControl",
              label: t("Width scale"),
              description: t(
                "How bar width maps to values. Logarithmic / square root smooth out extreme outliers so small steps stay visible.",
              ),
              renderTrigger: true,
              default: "sqrt",
              clearable: false,
              options: [
                { label: t("Linear"), value: "linear" },
                { label: t("Square root"), value: "sqrt" },
                { label: t("Logarithmic"), value: "log" },
              ],
            },
          },
        ],
        [
          {
            name: "number_format",
            config: {
              type: "SelectControl",
              label: t("Number format"),
              description: D3_FORMAT_DOCS,
              renderTrigger: true,
              default: DEFAULT_NUMBER_FORMAT,
              choices: D3_FORMAT_OPTIONS,
              tokenSeparators: ["\n", "\t", ";"],
            },
          },
        ],
        [
          {
            name: "percent_format",
            config: {
              type: "SelectControl",
              label: t("Percent format"),
              description: t("D3 format for conversion percentages"),
              renderTrigger: true,
              default: ".1%",
              options: [
                { label: "42%", value: ".0%" },
                { label: "42.0%", value: ".1%" },
                { label: "42.00%", value: ".2%" },
                { label: "42.000%", value: ".3%" },
              ],
            },
          },
        ],
      ],
    },
    {
      label: t("Tooltip"),
      expanded: false,
      controlSetRows: [[tooltipContentsControl], [tooltipTemplateControl]],
    },
  ],
};

export default config;
