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
import buildQuery, { DEFAULT_COUNT_METRIC, firstColumn } from "./buildQuery";
import { FunnelQueryFormData } from "./types";

function formData(
  overrides: Partial<FunnelQueryFormData> = {},
): FunnelQueryFormData {
  return {
    datasource: "5__table",
    vizType: "chart_funnel",
    ...overrides,
  } as FunnelQueryFormData;
}

test("firstColumn unwraps nested arrays and empties", () => {
  expect(firstColumn("stage")).toBe("stage");
  expect(firstColumn(["a", "b"])).toBe("a");
  expect(firstColumn([["deep"]])).toBe("deep");
  expect(firstColumn([])).toBeUndefined();
  expect(firstColumn([null])).toBeUndefined();
  expect(firstColumn([""])).toBeUndefined();
  expect(firstColumn(undefined)).toBeUndefined();
});

test("dimension mode builds one grouped query ordered by metric asc by default", () => {
  const context = buildQuery(
    formData({ data_mode: "dimension", groupby: "stage", metric: "count" }),
  );
  expect(context.queries).toHaveLength(1);
  const query = context.queries[0];
  expect(query.columns).toEqual(["stage"]);
  expect(query.metrics).toEqual(["count"]);
  expect(query.orderby).toEqual([["count", true]]);
  expect(query.is_timeseries).toBe(false);
});

test("dimension mode sorts by value; legacy alphabetical sorts are normalized", () => {
  const base = {
    data_mode: "dimension" as const,
    groupby: "stage",
    metric: "count",
  };
  expect(
    buildQuery(formData({ ...base, sort: "value_asc" })).queries[0].orderby,
  ).toEqual([["count", true]]);
  expect(
    buildQuery(formData({ ...base, sort: "value_desc" })).queries[0].orderby,
  ).toEqual([["count", false]]);
  expect(
    buildQuery(formData({ ...base, sort: "alpha_asc" })).queries[0].orderby,
  ).toEqual([["count", true]]);
  expect(
    buildQuery(formData({ ...base, sort: "alpha_desc" })).queries[0].orderby,
  ).toEqual([["count", false]]);
});

test("dimension mode falls back to COUNT(*) when metric is missing", () => {
  const context = buildQuery(
    formData({ data_mode: "dimension", groupby: "stage" }),
  );
  const query = context.queries[0];
  expect(query.metrics).toEqual([DEFAULT_COUNT_METRIC]);
  expect(query.orderby).toEqual([["COUNT(*)", true]]);
});

test("dimension mode throws without a dimension column", () => {
  expect(() => buildQuery(formData({ data_mode: "dimension" }))).toThrow(
    "Dimension column is required",
  );
});

test("fields mode builds one query per field with IS NOT NULL filters", () => {
  const context = buildQuery(
    formData({
      data_mode: "fields",
      fields: ["visited", "cart", "purchased"],
      metric: "revenue",
      adhoc_filters: [
        {
          clause: "WHERE",
          expressionType: "SIMPLE",
          operator: "==",
          subject: "year",
          comparator: "2026",
        },
      ],
    }),
  );
  expect(context.queries).toHaveLength(3);
  context.queries.forEach((query, index) => {
    expect(query.columns).toEqual([]);
    expect(query.metrics).toEqual(["revenue"]);
    expect(query.is_timeseries).toBe(false);
    expect(query.filters).toEqual([
      { col: "year", op: "==", val: "2026" },
      {
        col: ["visited", "cart", "purchased"][index],
        op: "IS NOT NULL",
        val: "",
      },
    ]);
  });
});

test("fields mode preserves field order in query order", () => {
  const context = buildQuery(
    formData({ data_mode: "fields", fields: ["b", "a"] }),
  );
  expect(context.queries[0].filters?.at(-1)).toEqual({
    col: "b",
    op: "IS NOT NULL",
    val: "",
  });
  expect(context.queries[1].filters?.at(-1)).toEqual({
    col: "a",
    op: "IS NOT NULL",
    val: "",
  });
});

test("fields mode throws without fields", () => {
  expect(() => buildQuery(formData({ data_mode: "fields" }))).toThrow(
    "Add at least one step field",
  );
});

test("fields mode uses the per-step metric for the matching field only", () => {
  const override = {
    expressionType: "SQL" as const,
    sqlExpression: "COUNT(DISTINCT app_id)",
    label: "COUNT(DISTINCT app_id)",
  };
  const context = buildQuery(
    formData({
      data_mode: "fields",
      fields: ["app_id", "event_1"],
      metric: "revenue",
      step_metrics: { app_id: override },
    }),
  );
  expect(context.queries).toHaveLength(2);
  expect(context.queries[0].metrics).toEqual([override]);
  expect(context.queries[1].metrics).toEqual(["revenue"]);
});

test("fields mode reads camelCase stepMetrics too", () => {
  const context = buildQuery(
    formData({
      dataMode: "fields",
      fields: ["app_id"],
      stepMetrics: { app_id: "saved_metric" },
    }),
  );
  expect(context.queries[0].metrics).toEqual(["saved_metric"]);
});

test("fields mode per-step metric falls back to COUNT(*) when shared is unset", () => {
  const context = buildQuery(
    formData({
      data_mode: "fields",
      fields: ["a", "b"],
      step_metrics: { a: "saved_metric" },
    }),
  );
  expect(context.queries[0].metrics).toEqual(["saved_metric"]);
  expect(context.queries[1].metrics).toEqual([DEFAULT_COUNT_METRIC]);
});

test("fields mode ignores malformed per-step metric entries", () => {
  const context = buildQuery(
    formData({
      data_mode: "fields",
      fields: ["a"],
      step_metrics: { a: 42 } as never,
    }),
  );
  expect(context.queries[0].metrics).toEqual([DEFAULT_COUNT_METRIC]);
});

test("fields mode falls back while a custom SQL metric is being authored", () => {
  const context = buildQuery(
    formData({
      data_mode: "fields",
      fields: ["a"],
      metric: "revenue",
      step_metrics: { a: { expressionType: "SQL", sqlExpression: "  " } },
    }),
  );
  expect(context.queries[0].metrics).toEqual(["revenue"]);
});

test("fields mode sends a complete custom SQL step metric", () => {
  const override = {
    expressionType: "SQL" as const,
    sqlExpression: "CASE WHEN event_1 = 1 THEN 1 END",
    label: "CASE WHEN event_1 = 1 THEN 1 END",
  };
  const context = buildQuery(
    formData({
      data_mode: "fields",
      fields: ["a"],
      step_metrics: { a: override },
    }),
  );
  expect(context.queries[0].metrics).toEqual([override]);
});

test("dimension mode ignores per-step metrics", () => {
  const context = buildQuery(
    formData({
      data_mode: "dimension",
      groupby: "stage",
      metric: "count",
      step_metrics: { stage: "other" },
    }),
  );
  expect(context.queries[0].metrics).toEqual(["count"]);
});

test("camelCase dataMode is respected", () => {
  const context = buildQuery(
    formData({ dataMode: "fields", fields: ["step_one"] }),
  );
  expect(context.queries).toHaveLength(1);
  expect(() =>
    buildQuery(formData({ dataMode: "dimension" as never })),
  ).toThrow("Dimension column is required");
});
