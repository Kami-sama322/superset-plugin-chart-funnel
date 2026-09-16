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
  Behavior,
  DataRecordValue,
  FilterState,
  QueryFormColumn,
  QueryFormData,
  QueryFormMetric,
  SetDataMaskHook,
} from "@superset-ui/core";

export type DataMode = "dimension" | "fields";
export type FunnelShape = "bars" | "funnel" | "funnel_smooth" | "pyramid";
export type ConversionColumnContent =
  | "none"
  | "value"
  | "percent_previous"
  | "percent_first";
export type ConversionColumnPosition = "left" | "right";
export type LabelAlignment = "left" | "center" | "right";
export type WidthScale = "linear" | "sqrt" | "log";
export type FunnelColorMode = "gradient" | "custom";
export type SortMode = "value_desc" | "value_asc" | "alpha_asc" | "alpha_desc";
export type LabelContentType =
  | "value"
  | "percent_first"
  | "percent_previous"
  | "value_percent_first"
  | "value_percent_previous";

export type FunnelStep = {
  label: string;
  value: number;
  percentFirst: number | null;
  percentPrevious: number | null;
  widthRatio: number;
  color: string;
  /** Column used for the cross-filter emitted on click */
  filterColumn: string;
  /** Raw dimension value used for the cross-filter (dimension mode) */
  filterValue: DataRecordValue;
  /** Source data row (dimension mode) for tooltip extra fields */
  extra: Record<string, unknown>;
};

export type FunnelQueryFormData = QueryFormData & {
  data_mode?: DataMode;
  dataMode?: DataMode;
  groupby?: QueryFormColumn | QueryFormColumn[];
  fields?: QueryFormColumn[];
  metric?: QueryFormMetric;
  sort?: SortMode;
  shape?: FunnelShape;
  color_mode?: FunnelColorMode;
  colorMode?: FunnelColorMode;
  linear_color_scheme?: string | string[];
  linearColorScheme?: string | string[];
  step_colors?: Record<string, string>;
  stepColors?: Record<string, string>;
  label_content_type?: LabelContentType;
  labelContentType?: LabelContentType;
  conversion_column_content?: ConversionColumnContent;
  conversionColumnContent?: ConversionColumnContent;
  conversion_column_position?: ConversionColumnPosition;
  conversionColumnPosition?: ConversionColumnPosition;
  label_alignment?: LabelAlignment;
  labelAlignment?: LabelAlignment;
  number_format?: string;
  numberFormat?: string;
  percent_format?: string;
  percentFormat?: string;
  gap?: number;
  show_labels?: boolean;
  showLabels?: boolean;
  bar_height_pct?: number;
  barHeightPct?: number;
  width_scale?: WidthScale;
  widthScale?: WidthScale;
  row_limit?: number;
  tooltip_contents?: unknown[];
  tooltipContents?: unknown[];
  tooltip_template?: string;
  tooltipTemplate?: string;
};

export type FunnelStatusKind = "no_dimension" | "no_fields" | "no_data" | null;

export type FunnelTransformedProps = {
  width: number;
  height: number;
  steps: FunnelStep[];
  dataMode: DataMode;
  shape: FunnelShape;
  labelContentType: LabelContentType;
  conversionColumnContent: ConversionColumnContent;
  conversionColumnPosition: ConversionColumnPosition;
  labelAlignment: LabelAlignment;
  sort: SortMode;
  showLabels: boolean;
  gap: number;
  barHeightPct: number;
  widthScale: WidthScale;
  numberFormat: string;
  percentFormat: string;
  metricLabel: string;
  statusKind: FunnelStatusKind;
  filterState: FilterState;
  setDataMask: SetDataMaskHook;
  emitCrossFilters?: boolean;
  behaviors: Behavior[];
  formData: FunnelQueryFormData;
  tooltipTemplate: string;
  tooltipContents: unknown[];
};

export const DEFAULT_FORM_DATA: Partial<FunnelQueryFormData> = {
  data_mode: "dimension",
  sort: "value_asc",
  shape: "bars",
  color_mode: "gradient",
  label_content_type: "value",
  conversion_column_content: "percent_previous",
  conversion_column_position: "right",
  label_alignment: "left",
  number_format: "SMART_NUMBER",
  percent_format: ".1%",
  gap: 8,
  show_labels: true,
  bar_height_pct: 100,
  width_scale: "sqrt",
  row_limit: 50,
  tooltip_contents: [],
  tooltip_template: "",
};
