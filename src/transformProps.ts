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
  ChartProps,
  DataRecord,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  QueryFormColumn,
} from "@superset-ui/core";
import { DEFAULT_COUNT_METRIC, firstColumn } from "./buildQuery";
import {
  buildFunnelSteps,
  orderStepsForRendering,
  RawStep,
  toFiniteNumber,
} from "./funnelData";
import { resolveStepColors } from "./funnelColors";
import {
  ConversionColumnContent,
  DataMode,
  DEFAULT_FORM_DATA,
  FunnelColorMode,
  FunnelQueryFormData,
  FunnelShape,
  FunnelStatusKind,
  FunnelStep,
  FunnelTransformedProps,
  LabelContentType,
} from "./types";

const noOp = () => {};

/**
 * ChartProps.formData is camelCased while DEFAULT_FORM_DATA and raw form
 * state use snake_case keys. The camelCase value (the live control value)
 * must win over the snake_case default, so check it first.
 */
function pick<T>(
  source: unknown,
  camelKey: string,
  snakeKey: string,
  fallback: T,
): T {
  const bag = source as Record<string, unknown>;
  const camelValue = bag?.[camelKey];
  if (camelValue !== undefined && camelValue !== null) {
    return camelValue as T;
  }
  const snakeValue = bag?.[snakeKey];
  if (snakeValue !== undefined && snakeValue !== null) {
    return snakeValue as T;
  }
  return fallback;
}

function cellValue(row: DataRecord, col: QueryFormColumn | undefined) {
  if (!col) {
    return undefined;
  }
  const label = getColumnLabel(col);
  if (!label) {
    return undefined;
  }
  if (label in row) {
    return row[label];
  }
  const lower = label.toLowerCase();
  const match = Object.keys(row).find((key) => key.toLowerCase() === lower);
  return match ? row[match] : undefined;
}

function isFilledColumn(col: unknown): col is QueryFormColumn {
  return col !== null && col !== undefined && col !== "";
}

export default function transformProps(
  chartProps: ChartProps,
): FunnelTransformedProps {
  const {
    width,
    height,
    formData,
    rawFormData,
    queriesData,
    hooks,
    filterState,
    emitCrossFilters,
    behaviors,
  } = chartProps;

  const fd = {
    ...DEFAULT_FORM_DATA,
    ...(formData as FunnelQueryFormData),
  };
  const raw = (rawFormData || {}) as FunnelQueryFormData;

  const dataMode = pick<DataMode>(fd, "dataMode", "data_mode", "dimension");
  const metric = fd.metric ?? raw.metric;
  const metricLabel = getMetricLabel(metric ?? DEFAULT_COUNT_METRIC);
  const shape = pick<FunnelShape>(fd, "shape", "shape", "bars");
  const colorMode = pick<FunnelColorMode>(
    fd,
    "colorMode",
    "color_mode",
    "gradient",
  );
  const labelContentType = pick<LabelContentType>(
    fd,
    "labelContentType",
    "label_content_type",
    "value",
  );
  // legacy show_conversion_column (boolean) maps to the content selector
  const legacyConversionVisible =
    (fd.show_conversion_column ?? fd.showConversionColumn ?? true) !== false;
  const conversionColumnContent = pick<ConversionColumnContent>(
    fd,
    "conversionColumnContent",
    "conversion_column_content",
    legacyConversionVisible ? "percent_previous" : "none",
  );
  const showLabels = pick<boolean>(fd, "showLabels", "show_labels", true);
  const gap = toFiniteNumber(pick<number>(fd, "gap", "gap", 8));
  const barHeightPct = toFiniteNumber(
    pick<number>(fd, "barHeightPct", "bar_height_pct", 50),
  );
  const numberFormat = pick<string>(
    fd,
    "numberFormat",
    "number_format",
    "SMART_NUMBER",
  );
  const percentFormat = pick<string>(
    fd,
    "percentFormat",
    "percent_format",
    ".1%",
  );
  const tooltipTemplate = pick<string>(
    fd,
    "tooltipTemplate",
    "tooltip_template",
    "",
  );
  const tooltipContents = ensureIsArray(
    fd.tooltipContents ?? fd.tooltip_contents,
  );

  let statusKind: FunnelStatusKind = null;
  const rawSteps: RawStep[] = [];
  let dimensionFilterColumn = "";

  if (dataMode === "fields") {
    const fields = ensureIsArray(fd.fields ?? raw.fields).filter(
      isFilledColumn,
    );
    if (fields.length === 0) {
      statusKind = "no_fields";
    } else {
      fields.forEach((field, index) => {
        const rows: DataRecord[] = queriesData?.[index]?.data || [];
        rawSteps.push({
          label: getColumnLabel(field),
          value: toFiniteNumber(cellValue(rows[0] || {}, metricLabel)),
          extra: {},
        });
      });
    }
  } else {
    const dimension = firstColumn(fd.groupby ?? raw.groupby);
    if (!dimension) {
      statusKind = "no_dimension";
    } else {
      const rows: DataRecord[] = queriesData?.[0]?.data || [];
      dimensionFilterColumn = getColumnLabel(dimension);
      rows.forEach((row) => {
        const labelValue = cellValue(row, dimension);
        rawSteps.push({
          label:
            labelValue === null || labelValue === undefined
              ? ""
              : String(labelValue),
          value: toFiniteNumber(cellValue(row, metricLabel)),
          filterValue: labelValue ?? "",
          extra: row,
        });
      });
      if (rawSteps.length === 0) {
        statusKind = "no_data";
      }
    }
  }

  const sorted = orderStepsForRendering(rawSteps, {
    shape,
    dataMode,
    sort: fd.sort ?? "value_desc",
  });
  // In the pyramid the process starts at the base (the widest, largest band),
  // so "first"/"previous" references are reversed.
  const base = buildFunnelSteps(sorted, shape === "pyramid");

  const colors = resolveStepColors({
    colorMode,
    scheme: pick(fd, "linearColorScheme", "linear_color_scheme", undefined),
    stepColors: pick(fd, "stepColors", "step_colors", undefined),
    labels: base.map((step) => step.label),
  });

  const steps: FunnelStep[] = base.map((step, index) => ({
    ...step,
    color: colors[index],
    filterColumn: dataMode === "fields" ? step.label : dimensionFilterColumn,
  }));

  return {
    width,
    height,
    steps,
    dataMode,
    shape,
    labelContentType,
    conversionColumnContent,
    showLabels,
    gap,
    barHeightPct,
    numberFormat,
    percentFormat,
    metricLabel,
    statusKind,
    filterState: filterState || {},
    setDataMask: hooks?.setDataMask ?? noOp,
    emitCrossFilters,
    behaviors: behaviors || [],
    formData: fd,
    tooltipTemplate,
    tooltipContents,
  };
}
