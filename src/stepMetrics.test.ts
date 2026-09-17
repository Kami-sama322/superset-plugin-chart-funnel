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
  aggregateOf,
  isStepMetricAggregate,
  metricChoiceKey,
  resolveStepMetric,
  simpleMetricFor,
  sqlExpressionOf,
  sqlMetricFor,
  STEP_METRIC_AGGREGATES,
  stepMetricKey,
} from "./stepMetrics";

test("stepMetricKey normalizes field values to a stable key", () => {
  expect(stepMetricKey("app_id")).toBe("app_id");
  expect(stepMetricKey({ label: "Stage" })).toBe("Stage");
  expect(stepMetricKey({ column_name: "app_id" })).toBe("app_id");
  expect(stepMetricKey(null)).toBe("");
  expect(stepMetricKey(undefined)).toBe("");
  expect(stepMetricKey(42)).toBe("");
  expect(stepMetricKey({})).toBe("");
});

test("resolveStepMetric prefers the per-step override keyed by field", () => {
  const override = { expressionType: "SQL", sqlExpression: "COUNT(*)" };
  const shared = "revenue";
  expect(resolveStepMetric({ app_id: override }, "app_id", shared)).toBe(
    override,
  );
});

test("resolveStepMetric falls back to the shared metric without an override", () => {
  const shared = "revenue";
  expect(resolveStepMetric({ other: "x" }, "app_id", shared)).toBe(shared);
  expect(resolveStepMetric(undefined, "app_id", shared)).toBe(shared);
  expect(resolveStepMetric(null, "app_id", shared)).toBe(shared);
});

test("resolveStepMetric falls back to undefined when nothing is set", () => {
  expect(resolveStepMetric(undefined, "app_id")).toBeUndefined();
  expect(resolveStepMetric({ app_id: null }, "app_id")).toBeUndefined();
  expect(resolveStepMetric({ app_id: "" }, "app_id")).toBeUndefined();
});

test("resolveStepMetric ignores malformed overrides and dictionaries", () => {
  const shared = "revenue";
  expect(resolveStepMetric({ app_id: 42 }, "app_id", shared)).toBe(shared);
  expect(resolveStepMetric({ app_id: [] }, "app_id", shared)).toBe(shared);
  expect(resolveStepMetric("garbage", "app_id", shared)).toBe(shared);
  expect(resolveStepMetric(42, "app_id", shared)).toBe(shared);
});

test("resolveStepMetric rejects partially authored adhoc metrics", () => {
  const shared = "revenue";
  expect(
    resolveStepMetric(
      { app_id: { expressionType: "SQL", sqlExpression: "   " } },
      "app_id",
      shared,
    ),
  ).toBe(shared);
  expect(
    resolveStepMetric(
      { app_id: { expressionType: "SQL" } },
      "app_id",
      shared,
    ),
  ).toBe(shared);
  expect(
    resolveStepMetric(
      { app_id: { expressionType: "SIMPLE", column: {} } },
      "app_id",
      shared,
    ),
  ).toBe(shared);
  expect(
    resolveStepMetric({ app_id: { aggregate: "SUM" } }, "app_id", shared),
  ).toBe(shared);
});

test("resolveStepMetric accepts complete adhoc metrics", () => {
  const sql = {
    expressionType: "SQL",
    sqlExpression: "COUNT(DISTINCT app_id)",
    label: "COUNT(DISTINCT app_id)",
  };
  expect(resolveStepMetric({ app_id: sql }, "app_id", "shared")).toBe(sql);
  expect(
    resolveStepMetric({ app_id: simpleMetricFor("app_id", "SUM") }, "app_id"),
  ).toEqual(simpleMetricFor("app_id", "SUM"));
});

test("resolveStepMetric treats empty field keys as no override", () => {
  expect(resolveStepMetric({ "": "x" }, null, "shared")).toBe("shared");
});

test("simpleMetricFor builds a SIMPLE adhoc metric with a stable label", () => {
  expect(simpleMetricFor("app_id", "COUNT_DISTINCT")).toEqual({
    expressionType: "SIMPLE",
    column: { column_name: "app_id" },
    aggregate: "COUNT_DISTINCT",
    label: "COUNT_DISTINCT(app_id)",
  });
  expect(simpleMetricFor("event_1", "SUM")).toEqual({
    expressionType: "SIMPLE",
    column: { column_name: "event_1" },
    aggregate: "SUM",
    label: "SUM(event_1)",
  });
});

test("sqlMetricFor trims the expression and uses it as the label", () => {
  expect(sqlMetricFor("  COUNT(DISTINCT app_id) ")).toEqual({
    expressionType: "SQL",
    sqlExpression: "COUNT(DISTINCT app_id)",
    label: "COUNT(DISTINCT app_id)",
  });
  expect(sqlMetricFor("   ")).toEqual({
    expressionType: "SQL",
    sqlExpression: "",
    label: "",
  });
});

test("sqlExpressionOf returns the expression of SQL metrics only", () => {
  expect(sqlExpressionOf(sqlMetricFor("COUNT(*)"))).toBe("COUNT(*)");
  expect(sqlExpressionOf("revenue")).toBe("");
  expect(sqlExpressionOf(simpleMetricFor("a", "SUM"))).toBe("");
  expect(sqlExpressionOf(undefined)).toBe("");
});

test("metricChoiceKey maps stored metrics to picker choices", () => {
  expect(metricChoiceKey("revenue")).toBe("saved:revenue");
  expect(metricChoiceKey(simpleMetricFor("app_id", "SUM"))).toBe("col:app_id");
  expect(metricChoiceKey({ expressionType: "SQL", sqlExpression: "1" })).toBe(
    "sql",
  );
  expect(metricChoiceKey(undefined)).toBe("");
  expect(metricChoiceKey(null)).toBe("");
  expect(metricChoiceKey(42)).toBe("");
  expect(metricChoiceKey("")).toBe("");
  expect(
    metricChoiceKey({ expressionType: "SIMPLE", column: {} }),
  ).toBe("");
});

test("aggregateOf returns the aggregate of SIMPLE metrics only", () => {
  expect(aggregateOf(simpleMetricFor("app_id", "COUNT_DISTINCT"))).toBe(
    "COUNT_DISTINCT",
  );
  expect(aggregateOf("revenue")).toBeNull();
  expect(aggregateOf({ expressionType: "SQL", sqlExpression: "1" })).toBeNull();
  expect(
    aggregateOf({
      expressionType: "SIMPLE",
      column: { column_name: "x" },
      aggregate: "NOT_AN_AGGREGATE",
    }),
  ).toBeNull();
});

test("isStepMetricAggregate accepts only backend aggregate keys", () => {
  STEP_METRIC_AGGREGATES.forEach((aggregate) => {
    expect(isStepMetricAggregate(aggregate)).toBe(true);
  });
  expect(isStepMetricAggregate("MEDIAN")).toBe(false);
  expect(isStepMetricAggregate("")).toBe(false);
  expect(isStepMetricAggregate(undefined)).toBe(false);
});
