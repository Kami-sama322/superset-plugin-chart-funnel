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
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@apache-superset/core/translation";
import { useTheme } from "@apache-superset/core/theme";
import type { QueryFormMetric } from "@superset-ui/core";
import { Input, Select } from "@superset-ui/core/components";
import { ControlHeader } from "@superset-ui/chart-controls";
import {
  aggregateOf,
  metricChoiceKey,
  simpleMetricFor,
  sqlExpressionOf,
  sqlMetricFor,
  STEP_METRIC_AGGREGATES,
  StepMetricAggregate,
} from "../stepMetrics";

type ColumnMeta = {
  column_name?: string;
  verbose_name?: string | null;
};

type MetricMeta = {
  metric_name?: string;
  verbose_name?: string | null;
};

type ChoiceOption = { value: string; label: string; disabled?: boolean };

type Props = {
  /** Per-step metrics keyed by the step field name */
  value?: Record<string, QueryFormMetric> | null;
  onChange?: (value: Record<string, QueryFormMetric>) => void;
  /** Step field names in field order, one picker row per name */
  fieldNames?: string[];
  columns?: ColumnMeta[];
  savedMetrics?: MetricMeta[];
  /** Metric applied to steps without their own (the select placeholder) */
  fallbackMetricLabel?: string;
  label?: string;
  description?: string;
};

const AGGREGATE_LABELS: Record<StepMetricAggregate, string> = {
  COUNT_DISTINCT: t("Count distinct"),
  COUNT: t("Count"),
  SUM: t("Sum"),
  AVG: t("Average"),
  MIN: t("Min"),
  MAX: t("Max"),
};

const SAVED_PREFIX = "saved:";
const COLUMN_PREFIX = "col:";
const SQL_CHOICE = "sql";

/**
 * Free-form SQL metric editor. The draft is local; it is committed on
 * blur or Enter so typing does not re-run the query on every keystroke.
 * Committing an empty expression removes the metric.
 */
function SqlMetricInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (expression: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    onCommit(trimmed);
    setText(trimmed);
  };

  return (
    <Input.TextArea
      value={text}
      autoSize={{ minRows: 1, maxRows: 6 }}
      placeholder="COUNT(DISTINCT app_id)"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onPressEnter={(event) => {
        event.preventDefault();
        commit();
      }}
    />
  );
}

export default function StepMetricsControl({
  value,
  onChange,
  fieldNames = [],
  columns = [],
  savedMetrics = [],
  fallbackMetricLabel = "COUNT(*)",
  ...headerProps
}: Props) {
  const theme = useTheme();
  const metrics: Record<string, QueryFormMetric> = useMemo(
    () => ({ ...(value || {}) }),
    [value],
  );

  const emit = (next: Record<string, QueryFormMetric>) => {
    onChange?.(next);
  };

  const removeMetric = (fieldName: string) => {
    emit(
      Object.fromEntries(
        Object.entries(metrics).filter(([key]) => key !== fieldName),
      ),
    );
  };

  // Fields added to Step fields are auto-filled with their own column as
  // the metric (Count aggregate) — numerically the same as the COUNT(*)
  // fallback (the rows are already filtered by the field being filled),
  // so a new row is immediately configurable: pick another aggregate,
  // column, saved metric or SQL. Fields present on the first render
  // (existing charts) are left untouched.
  const seenFieldsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenFieldsRef.current === null) {
      seenFieldsRef.current = new Set(fieldNames);
      return;
    }
    const previous = seenFieldsRef.current;
    seenFieldsRef.current = new Set(fieldNames);
    const added = fieldNames.filter((name) => !previous.has(name));
    if (added.length === 0 || !onChange) {
      return;
    }
    const additions = Object.fromEntries(
      added.map((name) => [name, simpleMetricFor(name, "COUNT")]),
    );
    onChange({ ...metrics, ...additions });
  }, [fieldNames, metrics, onChange]);

  const savedOptions: ChoiceOption[] = useMemo(
    () =>
      savedMetrics
        .filter(
          (metric) =>
            typeof metric.metric_name === "string" && metric.metric_name,
        )
        .map((metric) => ({
          value: `${SAVED_PREFIX}${metric.metric_name}`,
          label: metric.verbose_name || (metric.metric_name as string),
        })),
    [savedMetrics],
  );

  const columnOptions: ChoiceOption[] = useMemo(
    () =>
      columns
        .filter(
          (column) =>
            typeof column.column_name === "string" && column.column_name,
        )
        .map((column) => ({
          value: `${COLUMN_PREFIX}${column.column_name}`,
          label: column.verbose_name || (column.column_name as string),
        })),
    [columns],
  );

  const choiceOptions = useMemo(
    () => [
      ...(savedOptions.length
        ? [{ label: t("Saved metrics"), options: savedOptions }]
        : []),
      ...(columnOptions.length
        ? [{ label: t("Columns"), options: columnOptions }]
        : []),
      {
        label: t("Custom"),
        options: [{ value: SQL_CHOICE, label: t("SQL expression") }],
      },
    ],
    [savedOptions, columnOptions],
  );

  const aggregateOptions = useMemo(
    () =>
      STEP_METRIC_AGGREGATES.map((aggregate) => ({
        value: aggregate,
        label: AGGREGATE_LABELS[aggregate],
      })),
    [],
  );

  const handleChoiceChange = (fieldName: string, choice?: string) => {
    if (!choice) {
      removeMetric(fieldName);
      return;
    }
    if (choice.startsWith(SAVED_PREFIX)) {
      emit({ ...metrics, [fieldName]: choice.slice(SAVED_PREFIX.length) });
      return;
    }
    if (choice.startsWith(COLUMN_PREFIX)) {
      const columnName = choice.slice(COLUMN_PREFIX.length);
      if (columnName) {
        emit({ ...metrics, [fieldName]: simpleMetricFor(columnName, "SUM") });
      }
      return;
    }
    if (choice === SQL_CHOICE) {
      // An empty SQL metric is not usable — the step keeps COUNT(*) while
      // the expression is being written
      emit({ ...metrics, [fieldName]: sqlMetricFor("") });
    }
  };

  const handleAggregateChange = (
    fieldName: string,
    columnName: string,
    aggregate: StepMetricAggregate,
  ) => {
    emit({ ...metrics, [fieldName]: simpleMetricFor(columnName, aggregate) });
  };

  const handleSqlCommit = (fieldName: string, expression: string) => {
    const stored = sqlExpressionOf(metrics[fieldName]);
    if (!expression) {
      // emptied — remove the metric, but only emit when there was one
      if (stored) {
        removeMetric(fieldName);
      }
      return;
    }
    if (expression !== stored) {
      emit({ ...metrics, [fieldName]: sqlMetricFor(expression) });
    }
  };

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: theme.sizeUnit,
    minHeight: 32,
  };

  return (
    <div>
      <ControlHeader {...headerProps} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.sizeUnit,
        }}
      >
        {fieldNames.map((fieldName) => {
          const metric = metrics[fieldName];
          const choice = metricChoiceKey(metric);
          const columnName = choice.startsWith(COLUMN_PREFIX)
            ? choice.slice(COLUMN_PREFIX.length)
            : "";
          return (
            <div
              key={fieldName}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: theme.sizeUnit / 2,
              }}
            >
              <div style={rowStyle}>
                <span
                  style={{
                    flex: "0 0 30%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={fieldName}
                >
                  {fieldName}
                </span>
                <Select
                  value={choice || undefined}
                  allowClear
                  showSearch
                  optionFilterProps={["label", "value"]}
                  placeholder={fallbackMetricLabel}
                  options={choiceOptions}
                  ariaLabel={`${t("Metric for step")} ${fieldName}`}
                  css={{ flex: "1 1 auto", minWidth: 0 }}
                  onChange={(next: unknown) =>
                    handleChoiceChange(
                      fieldName,
                      typeof next === "string" ? next : undefined,
                    )
                  }
                />
                <Select
                  value={aggregateOf(metric) ?? "SUM"}
                  disabled={!columnName}
                  options={aggregateOptions}
                  ariaLabel={`${t("Aggregate for step")} ${fieldName}`}
                  css={{ flex: "0 0 124px" }}
                  onChange={(next: unknown) =>
                    handleAggregateChange(
                      fieldName,
                      columnName,
                      typeof next === "string" && next
                        ? (next as StepMetricAggregate)
                        : "SUM",
                    )
                  }
                />
              </div>
              {choice === SQL_CHOICE ? (
                <SqlMetricInput
                  value={sqlExpressionOf(metric)}
                  onCommit={(expression) => handleSqlCommit(fieldName, expression)}
                />
              ) : null}
            </div>
          );
        })}
        {fieldNames.length === 0 ? (
          <span style={{ color: theme.colorTextSecondary, fontSize: 12 }}>
            {t("Add step fields to assign metrics")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
