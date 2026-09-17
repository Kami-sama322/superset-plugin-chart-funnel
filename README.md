# 🪣 Funnel Chart Plugin — Apache Superset chart
---

### [🇷🇺 Русский](README.ru.md) | 🇬🇧 English

---

> **A custom Apache Superset plugin** that renders a Power BI–style funnel
> chart: sequential stages, conversion percentages, per-step colors,
> customizable tooltips and dashboard cross-filtering. No dataset
> preparation is required — the plugin groups and aggregates data itself.

---

## ✨ Features

- Dashboard chart (**not** a Native Filter)
- **Two data modes**:
  - *Dimension values* — pick one dimension and one metric; the plugin runs
    `GROUP BY` itself, every distinct value becomes a funnel step
  - *Fields as steps* — insert several columns; each column becomes a step,
    **the step order matches the order of the inserted fields**, and the
    metric is aggregated over the rows where the column is filled
- **Conversion rates**: percent of the first step and percent of the
  previous step — shown on labels, in the conversion column and in tooltips.
  The "first step" is always the funnel base — the widest band: at one of
  the shape ends in the dimension mode (either sort direction), the widest
  step wherever the field order puts it in the fields mode — so the
  reference follows the wide side and conversions stay ≤100%
- Power BI–compatible **label content**: data value / % of first /
  % of previous / combinations
- **Two shapes**: *Rectangles* (separated centered bars, Power BI look) and
  *Funnel* (continuous trapezoids)
- **Two extra shapes**: *Smooth funnel* (curved transitions, monotone cubic
  spline — no sharp jumps) and *Pyramid* (triangle with equal-height slices,
  the smallest value at the apex)
- **Sort control applies to every shape**: ASC keeps the smallest value at
  the narrow end, DESC flips the pyramid (wide base on top). Sorting is by
  the metric value with a name tie-break in the same direction (DESC is
  the exact reverse of ASC); the fields mode always
  follows the field order (no sort control)
- **Bar height, %**: relative bar height — 50% is the automatic fit,
  lower makes bars thinner, higher denser; the gap physically separates
  bars and the chart always fits the screen
- **Colors**: gradient over a sequential color scheme or a custom color
  per step
- **Tooltips**: pick extra columns and/or provide a Handlebars template
- **Cross-filtering**: click a step to filter the dashboard — `IN` on the
  dimension value (dimension mode) or `IS NOT NULL` on the step column
  (fields mode); multi-select with toggle-off
- Sorting ASC / DESC by value (ties by name) in the dimension mode
- Number and percent D3 formats, gap slider, labels toggle

---

## 📋 Requirements

| Component | Version |
|-----------|---------|
| Apache Superset | 6.1.0 |
| Python | 3.10+ |
| Node.js | 20+ (image build: 22) |
| npm | 10+ |
| React (peer) | ^17.0.2 |
| npm package | `@superset-ui/plugin-chart-funnel` |
| Plugin key | `chart_funnel` |
| Dependencies | `handlebars` (tooltip templates) |

---

## 🚀 Installation

### Step 1. Clone the Superset repository (target version)

```bash
git clone https://github.com/apache/superset.git -b 6.1.0;
```

### Step 2. Clone the plugin repository

```bash
git clone https://github.com/Kami-sama322/superset-plugin-chart-funnel.git;
```

### Step 3. Run the auto-installation script

```bash
chmod +x superset-plugin-chart-funnel/install.sh;
./superset-plugin-chart-funnel/install.sh ./superset;
```

> `./superset` — root of the Superset repo from Step 1. The script installs
> the plugin as a **standalone npm package** into
> `superset-frontend/plugins/plugin-chart-funnel/` and registers it at
> Superset's documented extension points. npm workspaces (`plugins/*`)
> link the package on the next `npm install`.

#### What the script does:

| Action | File |
|--------|------|
| 0. Installs the plugin package | `superset-frontend/plugins/plugin-chart-funnel/` |
| 1. Registers the plugin in the extension hook | `superset-frontend/src/setup/setupPluginsExtra.ts` (`key: chart_funnel`) |
| 2. Adds the `file:` workspace dependency | `superset-frontend/package.json` |

> The `@superset-ui/plugin-chart-*` path alias already covers this package —
> no extra `tsconfig.json` entry. `FILTER_SUPPORTED_TYPES` is **not**
> changed (chart, not Native Filter).

### Step 4. Build and run

```bash
cd superset/superset-frontend
npm install
npm run dev-server
```

Production image builds work the same way — see the sibling
`superset-prod-dockerfile/` repository.

---

## 🧭 Usage

1. **Charts → + Chart → Funnel**, pick a dataset.
2. Choose the **Data mode**:
   - *Dimension values*: select a **Dimension** (e.g. sales stage) and a
     **Metric** (e.g. Opportunity count). Steps are ordered by the metric
     (ascending by default, ASC / DESC sort control).
   - *Fields as steps*: drag columns into **Step fields** in the order the
     funnel should follow. Each step value = metric aggregated over rows
     where that column is filled. The default metric is `COUNT(*)`.
3. Tune colors, shape, labels and the tooltip in the **Display** and
   **Tooltip** sections.
4. To make clicks filter the dashboard, enable **cross-filtering** on the
   chart and the dashboard.

### Tooltip template variables

Built-ins: `{{label}}`, `{{value}}`, `{{value_formatted}}`,
`{{percent_first}}`, `{{percent_first_formatted}}`,
`{{percent_previous}}`, `{{percent_previous_formatted}}`.
Columns selected in **Tooltip contents** are available by their names
(dimension mode).

---

## ⚙️ Configuration reference

### Query

| Control | Modes | Description |
|---------|-------|-------------|
| Data mode | both | `dimension` (group by) or `fields` (columns as steps) |
| Dimension | dimension | Column with step values |
| Step fields | fields | Columns, one per step; order matters |
| Metric | both | Aggregation; empty → `COUNT(*)` |
| Row limit | dimension | Default 50 steps max |

### Display

| Control | Description |
|---------|-------------|
| Shape | Rectangles (Power BI) / Funnel / Smooth funnel / Pyramid |
| Color mode | Gradient / Custom per-step colors |
| Gradient color scheme | Sequential scheme (gradient mode) |
| Step colors | Ready-made per-step picker list (populated from the query result / step fields); unset steps fall back to the categorical scheme |
| Show labels + Label content | Label visibility and what the bar label shows: Data value / % of first / % of previous / combos |
| Conversion column | Checkbox + content select: Data value / % of previous / % of first |
| Bar height, % | 100% = bars fill the screen (default), lower = thinner; the gap is a physical separation and stays intact |
| Number format / Percent format | Standard Superset D3 format controls |

---

## ✅ Verification

```bash
# Local production-style image (plugins are COPY-ed from sibling dirs)
cd superset-prod-dockerfile
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d
# http://localhost:8088 — Charts → + Chart → Funnel
```

Unit tests live in `src/*.test.ts` (Jest). After running `install.sh`
they can be executed from the Superset frontend tree:

```bash
cd superset/superset-frontend
npx jest plugins/plugin-chart-funnel
```

---

## 📄 License

Apache License 2.0 — see [LICENSE](LICENSE).
