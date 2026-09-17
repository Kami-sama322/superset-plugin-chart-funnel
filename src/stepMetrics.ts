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
import type { Aggregate, QueryFormMetric } from "@superset-ui/core";

/** Aggregates the Superset backend accepts for SIMPLE adhoc metrics */
export const STEP_METRIC_AGGREGATES = [
  "COUNT_DISTINCT",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
] as const;

export type StepMetricAggregate = Aggregate;

const AGGREGATE_SET: ReadonlySet<string> = new Set(STEP_METRIC_AGGREGATES);

export function isStepMetricAggregate(
  value: unknown,
): value is StepMetricAggregate {
  return typeof value === "string" && AGGREGATE_SET.has(value);
}

/**
 * Stable key of a step field for the step_metrics dictionary. Plain column
 * names (the common case from DndColumnSelect) pass through as is; object
 * columns fall back to their label or column name.
 */
export function stepMetricKey(field: unknown): string {
  if (typeof field === "string") {
    return field;
  }
  if (field && typeof field === "object") {
    const obj = field as Record<string, unknown>;
    if (typeof obj.label === "string" && obj.label) {
      return obj.label;
    }
    if (typeof obj.column_name === "string" && obj.column_name) {
      return obj.column_name;
    }
  }
  return "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A metric value is usable only when the backend can render it: a saved
 * metric name, a SIMPLE adhoc metric with a column, or a SQL metric with
 * a non-empty expression. Partially authored metrics (e.g. an SQL metric
 * while the user is still typing) resolve to nothing — the shared metric
 * or the caller's default applies instead.
 */
function isMetricValue(value: unknown): value is QueryFormMetric {
  if (typeof value === "string") {
    return value.length > 0;
  }
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.expressionType === "SQL") {
    return (
      typeof value.sqlExpression === "string" &&
      value.sqlExpression.trim().length > 0
    );
  }
  if (value.expressionType === "SIMPLE") {
    const column = value.column as { column_name?: unknown } | undefined;
    return (
      typeof column?.column_name === "string" && column.column_name.length > 0
    );
  }
  return false;
}

/**
 * Metric of one step: the per-step override keyed by the field label wins,
 * then the shared metric. Malformed form_data entries (API-authored or
 * hand-edited) never resolve — the shared metric or the caller's default
 * applies instead.
 */
export function resolveStepMetric(
  stepMetrics: unknown,
  field: unknown,
  sharedMetric?: QueryFormMetric | null,
): QueryFormMetric | undefined {
  if (isPlainObject(stepMetrics)) {
    const key = stepMetricKey(field);
    const override = key ? stepMetrics[key] : undefined;
    if (isMetricValue(override)) {
      return override;
    }
  }
  return sharedMetric ?? undefined;
}

/**
 * SIMPLE adhoc metric over a dataset column. The label is deterministic
 * (`AGGREGATE(column)`) so it is stable as the result column name shared
 * between buildQuery and transformProps.
 */
export function simpleMetricFor(
  columnName: string,
  aggregate: StepMetricAggregate,
): QueryFormMetric {
  return {
    expressionType: "SIMPLE",
    column: { column_name: columnName },
    aggregate,
    label: `${aggregate}(${columnName})`,
  };
}

/**
 * SQL adhoc metric. The label equals the expression so it is stable as the
 * result column name shared between buildQuery and transformProps.
 */
export function sqlMetricFor(sqlExpression: string): QueryFormMetric {
  const expression = sqlExpression.trim();
  return { expressionType: "SQL", sqlExpression: expression, label: expression };
}

/** SQL expression of a stored SQL metric, "" for anything else */
export function sqlExpressionOf(metric: unknown): string {
  if (
    isPlainObject(metric) &&
    metric.expressionType === "SQL" &&
    typeof metric.sqlExpression === "string"
  ) {
    return metric.sqlExpression;
  }
  return "";
}

/** Which picker choice a stored step metric corresponds to */
export function metricChoiceKey(metric: unknown): string {
  if (typeof metric === "string") {
    return metric ? `saved:${metric}` : "";
  }
  if (isPlainObject(metric)) {
    if (metric.expressionType === "SIMPLE") {
      const column = metric.column as { column_name?: unknown } | undefined;
      const columnName =
        typeof column?.column_name === "string" ? column.column_name : "";
      return columnName ? `col:${columnName}` : "";
    }
    if (metric.expressionType === "SQL") {
      return "sql";
    }
  }
  return "";
}

/** Aggregate of a stored SIMPLE step metric, null for anything else */
export function aggregateOf(metric: unknown): StepMetricAggregate | null {
  if (
    isPlainObject(metric) &&
    metric.expressionType === "SIMPLE" &&
    isStepMetricAggregate(metric.aggregate)
  ) {
    return metric.aggregate;
  }
  return null;
}
