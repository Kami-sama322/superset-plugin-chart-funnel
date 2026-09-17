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
  buildQueryContext,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  QueryFormColumn,
  QueryFormMetric,
  QueryObject,
} from "@superset-ui/core";
import { normalizeSort } from "./funnelData";
import { resolveStepMetric } from "./stepMetrics";
import { DataMode, FunnelQueryFormData, ValueSortMode } from "./types";

export const DEFAULT_COUNT_METRIC: QueryFormMetric = {
  expressionType: "SQL",
  sqlExpression: "COUNT(*)",
  label: "COUNT(*)",
};

export function firstColumn(
  value: QueryFormColumn | QueryFormColumn[] | undefined,
): QueryFormColumn | undefined {
  let col: unknown = value;
  while (Array.isArray(col)) {
    col = col[0];
  }
  if (col === null || col === undefined || col === "") {
    return undefined;
  }
  return col as QueryFormColumn;
}

function resolveDataMode(formData: FunnelQueryFormData): DataMode {
  return formData.data_mode ?? formData.dataMode ?? "dimension";
}

export function resolveMetric(formData: FunnelQueryFormData): QueryFormMetric {
  return formData.metric ?? DEFAULT_COUNT_METRIC;
}

/**
 * Query-level ordering matches the render sort: by the metric value,
 * ascending or descending (the client re-sorts with an alphabetical
 * tie-break). The tuple flag is `ascending` (true = ASC).
 */
function buildOrderBy(
  sort: ValueSortMode,
  metricLabel: string,
): [string, boolean][] {
  return [[metricLabel, sort === "value_asc"]];
}

export default function buildQuery(formData: FunnelQueryFormData) {
  const dataMode = resolveDataMode(formData);
  const metric = resolveMetric(formData);

  if (dataMode === "fields") {
    const fields = ensureIsArray(formData.fields).filter(
      (col) => col !== null && col !== undefined && col !== "",
    );
    if (fields.length === 0) {
      throw new Error("Add at least one step field");
    }
    const stepMetrics = formData.step_metrics ?? formData.stepMetrics;
    return buildQueryContext(formData, {
      buildQuery: (baseQueryObject: QueryObject) =>
        fields.map((field) => ({
          ...baseQueryObject,
          columns: [],
          metrics: [
            resolveStepMetric(stepMetrics, field, metric) ??
              DEFAULT_COUNT_METRIC,
          ],
          filters: [
            ...(baseQueryObject.filters || []),
            {
              col: getColumnLabel(field),
              op: "IS NOT NULL",
              val: "",
            },
          ],
          orderby: undefined,
          is_timeseries: false,
        })),
    });
  }

  const dimension = firstColumn(formData.groupby);
  if (!dimension) {
    throw new Error("Dimension column is required");
  }
  const sort = normalizeSort(formData.sort);

  return buildQueryContext(formData, {
    queryFields: {
      groupby: "columns",
    },
    buildQuery: (baseQueryObject: QueryObject) => [
      {
        ...baseQueryObject,
        columns: [dimension],
        metrics: [metric],
        orderby: buildOrderBy(sort, getMetricLabel(metric)),
        is_timeseries: false,
      },
    ],
  });
}
