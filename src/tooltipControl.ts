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
import { t } from "@apache-superset/core/translation";
import { ControlPanelState } from "@superset-ui/chart-controls";
import FunnelTooltipTemplateControl from "./controls/FunnelTooltipTemplateControl";

const isGroupableColumn = (column: unknown) =>
  (column as { groupby?: boolean } | null)?.groupby !== false;

export const tooltipContentsControl = {
  name: "tooltip_contents",
  config: {
    type: "DndColumnSelect",
    label: t("Tooltip contents"),
    multi: true,
    freeForm: true,
    clearable: true,
    default: [],
    description: t(
      "Columns shown in the hover tooltip in addition to the step value and conversion rates. Custom SQL is supported.",
    ),
    ghostButtonText: t("Drop columns here or click"),
    shouldMapStateToProps: () => true,
    mapStateToProps: (state: ControlPanelState) => {
      const columns = state.datasource?.columns || [];
      return {
        options: columns.filter(isGroupableColumn),
      };
    },
  },
};

export const tooltipTemplateControl = {
  name: "tooltip_template",
  config: {
    type: FunnelTooltipTemplateControl,
    label: t("Customize tooltips template"),
    renderTrigger: true,
    default: "",
  },
};
