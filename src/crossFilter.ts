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
import { DataMask, DataRecordValue } from "@superset-ui/core";

export function isSelectedValue(
  selected: DataRecordValue[] | null | undefined,
  value: DataRecordValue,
): boolean {
  return (selected || []).some((item) => String(item) === String(value));
}

export function toggleSelectedValue(
  selected: DataRecordValue[] | null | undefined,
  value: DataRecordValue,
): DataRecordValue[] {
  const current = selected || [];
  if (isSelectedValue(current, value)) {
    return current.filter((item) => String(item) !== String(value));
  }
  return [...current, value];
}

export function buildDimensionDataMask(
  column: string,
  selected: DataRecordValue[],
  labelByValue: (value: DataRecordValue) => string,
): DataMask {
  if (!column || selected.length === 0) {
    return {
      extraFormData: { filters: [] },
      filterState: { value: null, selectedValues: null },
    };
  }
  return {
    extraFormData: {
      filters: [{ col: column, op: "IN", val: selected }],
    },
    filterState: {
      value: selected,
      selectedValues: selected.map(String),
      label: selected.map(labelByValue).join(", "),
    },
  };
}

export function buildFieldDataMask(
  column: string,
  selected: boolean,
): DataMask {
  if (!column || !selected) {
    return {
      extraFormData: { filters: [] },
      filterState: { value: null, selectedValues: null },
    };
  }
  return {
    extraFormData: {
      filters: [{ col: column, op: "IS NOT NULL" }],
    },
    filterState: {
      value: [column],
      selectedValues: [column],
      label: column,
    },
  };
}
