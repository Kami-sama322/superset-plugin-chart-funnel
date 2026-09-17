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
import Handlebars from "handlebars";
import { t } from "@apache-superset/core/translation";
import { sanitizeHtml } from "@superset-ui/core";

export type TooltipField = {
  label: string;
  field: string;
};

export type FunnelTooltipInput = {
  label: string;
  value: number;
  valueFormatted: string;
  percentFirst: number | null;
  percentFirstFormatted: string;
  percentPrevious: number | null;
  percentPreviousFormatted: string;
  extra: Record<string, unknown>;
  extraFields: TooltipField[];
};

export type TooltipRow = {
  label: string;
  value: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function tooltipContentFields(
  tooltipContents?: unknown[],
): TooltipField[] {
  if (!Array.isArray(tooltipContents) || tooltipContents.length === 0) {
    return [];
  }
  const result: TooltipField[] = [];
  const seen = new Set<string>();
  tooltipContents.forEach((item) => {
    if (item === null || item === undefined || item === "") {
      return;
    }
    if (typeof item === "string") {
      if (!seen.has(item)) {
        seen.add(item);
        result.push({ label: item, field: item });
      }
      return;
    }
    if (typeof item !== "object") {
      return;
    }
    const obj = item as Record<string, unknown>;
    if (obj.item_type === "metric") {
      return;
    }
    const field =
      (typeof obj.column_name === "string" && obj.column_name) ||
      (typeof obj.label === "string" && obj.label) ||
      (typeof obj.name === "string" && obj.name) ||
      "";
    if (!field) {
      return;
    }
    if (seen.has(field)) {
      return;
    }
    seen.add(field);
    const verbose =
      (typeof obj.verbose_name === "string" && obj.verbose_name) || field;
    result.push({ label: verbose, field });
  });
  return result;
}

function lookupValue(extra: Record<string, unknown>, field: string): unknown {
  if (field in extra) {
    return extra[field];
  }
  const match = Object.keys(extra).find(
    (key) => key.toLowerCase() === field.toLowerCase(),
  );
  return match ? extra[match] : undefined;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function buildTooltipData(
  input: FunnelTooltipInput,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    label: input.label,
    value: input.value,
    value_formatted: input.valueFormatted,
    percent_first: hasValue(input.percentFirst) ? input.percentFirst : "",
    percent_first_formatted: hasValue(input.percentFirst)
      ? input.percentFirstFormatted
      : "",
    percent_previous: hasValue(input.percentPrevious)
      ? input.percentPrevious
      : "",
    percent_previous_formatted: hasValue(input.percentPrevious)
      ? input.percentPreviousFormatted
      : "",
  };
  input.extraFields.forEach(({ field }) => {
    if (field in data) {
      return;
    }
    data[field] = lookupValue(input.extra, field);
  });
  return data;
}

export function buildDefaultTemplate(
  input: FunnelTooltipInput,
  metricLabel: string,
): string {
  const lines = ["<div><strong>{{label}}</strong></div>"];
  lines.push(`<div>${escapeHtml(metricLabel)}: {{value_formatted}}</div>`);
  if (input.percentFirst !== null) {
    lines.push(
      `<div>${escapeHtml(t("% of first"))}: {{percent_first_formatted}}</div>`,
    );
  }
  if (input.percentPrevious !== null) {
    lines.push(
      `<div>${escapeHtml(t("% of previous"))}: {{percent_previous_formatted}}</div>`,
    );
  }
  input.extraFields.forEach(({ label, field }) => {
    lines.push(`<div>${escapeHtml(label)}: {{ ${field} }}</div>`);
  });
  return lines.join("");
}

export function buildTooltipRows(
  input: FunnelTooltipInput,
  metricLabel: string,
): TooltipRow[] {
  const rows: TooltipRow[] = [
    { label: "", value: input.label },
    { label: metricLabel, value: input.valueFormatted },
  ];
  if (input.percentFirst !== null) {
    rows.push({ label: t("% of first"), value: input.percentFirstFormatted });
  }
  if (input.percentPrevious !== null) {
    rows.push({
      label: t("% of previous"),
      value: input.percentPreviousFormatted,
    });
  }
  input.extraFields.forEach(({ label, field }) => {
    const value = lookupValue(input.extra, field);
    if (!hasValue(value)) {
      return;
    }
    rows.push({ label, value: String(value) });
  });
  return rows;
}

function maybeSanitize(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }
  try {
    const appContainer = document.getElementById("app");
    const { common } = JSON.parse(
      appContainer?.getAttribute("data-bootstrap") || "{}",
    );
    const htmlSanitization = common?.conf?.HTML_SANITIZATION ?? true;
    if (!htmlSanitization) {
      return html;
    }
    const sanitized = sanitizeHtml(html);
    return sanitized.trim() ? sanitized : "";
  } catch {
    return "";
  }
}

type CompiledTemplate = ReturnType<typeof Handlebars.compile>;

const compiledTemplates = new Map<string, CompiledTemplate>();

/**
 * Handlebars.compile parses the whole template and buildTooltipHtml runs
 * on every tooltip render (each mousemove) — cache compiled templates by
 * their source, bounded so user-edited templates do not accumulate.
 */
function compileTemplate(source: string): CompiledTemplate {
  const cached = compiledTemplates.get(source);
  if (cached) {
    return cached;
  }
  if (compiledTemplates.size >= 32) {
    compiledTemplates.clear();
  }
  const compiled = Handlebars.compile(source);
  compiledTemplates.set(source, compiled);
  return compiled;
}

let warnedAboutTemplateFailure = false;

/**
 * A failed custom template is otherwise silent: the tooltip falls back to
 * the default rows and the user cannot tell why. Warn once per session —
 * the most common cause is a CSP without 'unsafe-eval', which Handlebars
 * needs for runtime compilation.
 */
function warnTemplateFailure(error: unknown): void {
  if (warnedAboutTemplateFailure) {
    return;
  }
  warnedAboutTemplateFailure = true;
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[plugin-chart-funnel] Custom tooltip template failed to render (${reason}); ` +
      "falling back to the default tooltip. If the reason mentions " +
      "Content Security Policy / unsafe-eval, allow 'unsafe-eval' in " +
      "script-src — Handlebars compiles templates with eval at runtime.",
  );
}

export function buildTooltipHtml(
  template: string | undefined,
  input: FunnelTooltipInput,
  metricLabel: string,
): string {
  const data = buildTooltipData(input);
  const effective = template?.trim()
    ? template
    : buildDefaultTemplate(input, metricLabel);
  try {
    const rendered = String(compileTemplate(effective)(data) ?? "");
    if (rendered.trim()) {
      return maybeSanitize(rendered);
    }
    warnTemplateFailure(new Error("template rendered to empty content"));
  } catch (error) {
    warnTemplateFailure(error);
  }
  try {
    return maybeSanitize(
      String(
        compileTemplate(buildDefaultTemplate(input, metricLabel))(data) ?? "",
      ),
    );
  } catch (error) {
    warnTemplateFailure(error);
    return "";
  }
}
