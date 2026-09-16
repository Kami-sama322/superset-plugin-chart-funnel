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
import { useCallback } from "react";
import { t } from "@apache-superset/core/translation";
import { useTheme } from "@apache-superset/core/theme";
import { InfoTooltip } from "@superset-ui/core/components";
import { ControlHeader } from "@superset-ui/chart-controls";
import { CodeEditor } from "@superset-ui/core/components/CodeEditor";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  name: string;
};

export default function FunnelTooltipTemplateControl({
  value,
  onChange,
  label,
  name,
}: Props) {
  const theme = useTheme();

  const handleChange = useCallback(
    (nextValue: string) => {
      onChange(nextValue || "");
    },
    [onChange],
  );

  return (
    <div>
      <ControlHeader
        name={name}
        label={
          <>
            {label || t("Customize tooltips template")}
            <InfoTooltip
              iconStyle={{ marginLeft: theme.sizeUnit }}
              tooltip={t(
                "Handlebars template for the hover tooltip. Built-in variables: label, value, value_formatted, percent_first, percent_first_formatted, percent_previous, percent_previous_formatted. Columns from Tooltip contents are also available.",
              )}
            />
          </>
        }
      />
      <CodeEditor
        mode="handlebars"
        value={value || ""}
        onChange={handleChange}
        height="120px"
      />
    </div>
  );
}
