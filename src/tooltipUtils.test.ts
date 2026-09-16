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
  buildDefaultTemplate,
  buildTooltipData,
  buildTooltipHtml,
  buildTooltipRows,
  FunnelTooltipInput,
  tooltipContentFields,
} from "./tooltipUtils";

function input(
  overrides: Partial<FunnelTooltipInput> = {},
): FunnelTooltipInput {
  return {
    label: "Proposal",
    value: 420,
    valueFormatted: "420",
    percentFirst: 0.42,
    percentFirstFormatted: "42.0%",
    percentPrevious: 0.7,
    percentPreviousFormatted: "70.0%",
    extra: { owner: "Ann", region: "EU" },
    extraFields: [{ label: "Owner", field: "owner" }],
    ...overrides,
  };
}

test("tooltipContentFields extracts unique column fields", () => {
  expect(
    tooltipContentFields([
      { column_name: "owner", verbose_name: "Owner" },
      "region",
      { column_name: "owner" },
      { item_type: "metric", metric_name: "count" },
      null,
      "",
      42,
    ]),
  ).toEqual([
    { label: "Owner", field: "owner" },
    { label: "region", field: "region" },
  ]);
  expect(tooltipContentFields(undefined)).toEqual([]);
  expect(tooltipContentFields([])).toEqual([]);
});

test("buildTooltipData merges built-ins with extra row values", () => {
  const data = buildTooltipData(input());
  expect(data.label).toBe("Proposal");
  expect(data.value_formatted).toBe("420");
  expect(data.percent_first_formatted).toBe("42.0%");
  expect(data.percent_previous_formatted).toBe("70.0%");
  expect(data.owner).toBe("Ann");
});

test("buildTooltipData blanks missing percents and unknown extra fields", () => {
  const data = buildTooltipData(
    input({
      percentFirst: null,
      percentFirstFormatted: "",
      percentPrevious: null,
      percentPreviousFormatted: "",
      extraFields: [{ label: "Missing", field: "missing" }],
    }),
  );
  expect(data.percent_first).toBe("");
  expect(data.percent_previous_formatted).toBe("");
  expect(data.missing).toBeUndefined();
});

test("buildDefaultTemplate includes metric label and percents", () => {
  const template = buildDefaultTemplate(input(), "Opportunity count");
  expect(template).toContain("<strong>{{label}}</strong>");
  expect(template).toContain("Opportunity count: {{value_formatted}}");
  expect(template).toContain("{{percent_first_formatted}}");
  expect(template).toContain("{{percent_previous_formatted}}");
  expect(template).toContain("{{ owner }}");
});

test("buildDefaultTemplate escapes html in labels", () => {
  const template = buildDefaultTemplate(input(), "<b>metric</b>");
  expect(template).toContain("&lt;b&gt;metric&lt;/b&gt;");
});

test("buildTooltipRows skips blank values and keeps percents", () => {
  const rows = buildTooltipRows(input(), "Count");
  expect(rows[0]).toEqual({ label: "", value: "Proposal" });
  expect(rows[1]).toEqual({ label: "Count", value: "420" });
  expect(rows).toContainEqual({ label: "% of first", value: "42.0%" });
  expect(rows).toContainEqual({ label: "% of previous", value: "70.0%" });
  expect(rows).toContainEqual({ label: "Owner", value: "Ann" });
});

test("buildTooltipRows omits null percents", () => {
  const rows = buildTooltipRows(
    input({
      percentFirst: null,
      percentFirstFormatted: "",
      percentPrevious: null,
      percentPreviousFormatted: "",
      extraFields: [{ label: "Missing", field: "missing" }],
    }),
    "Count",
  );
  expect(rows.some((row) => row.label === "% of first")).toBe(false);
  expect(rows.some((row) => row.label === "% of previous")).toBe(false);
  expect(rows.some((row) => row.label === "Missing")).toBe(false);
});

test("buildTooltipHtml renders the custom template", () => {
  const html = buildTooltipHtml(
    "<b>{{label}}</b>: {{value_formatted}} ({{percent_previous_formatted}})",
    input(),
    "Count",
  );
  expect(html).toContain("<b>Proposal</b>: 420 (70.0%)");
});

test("buildTooltipHtml falls back to the default template on broken custom", () => {
  const html = buildTooltipHtml("{{#ifunclosed}}", input(), "Count");
  expect(html).toContain("Proposal");
  expect(html).toContain("420");
});

test("buildTooltipHtml uses the default template when none is set", () => {
  const html = buildTooltipHtml("", input(), "Count");
  expect(html).toContain("Proposal");
  expect(html).toContain("420");
  expect(html).toContain("42.0%");
});
