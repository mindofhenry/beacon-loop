# Org Health Overview — Page Design Override

**File:** `dashboard/app/page.tsx`
**Components used:** `SequenceSlideOut`, `RewriteModal`

---

## Layout

Top-to-bottom single column, max-width `max-w-7xl`, `px-6 py-8`.

### Stat Cards

Four-column grid (`grid-cols-2 lg:grid-cols-4 gap-4`). Each card:
- Background: `#111111`, border `#1f1f1f`, rounded-xl, p-5
- Icon: Lucide, 14px, `text-slate-500`
- Label: Fira Sans xs, `text-slate-400`
- Value: Fira Code 2xl, `text-slate-100`

Cards: Active Sequences (Activity), Org Avg Reply Rate (Mail), Total Pipeline Influenced (DollarSign), Flagged Steps (AlertTriangle).

Pipeline value displays as "$X.XM" when >= 1M, otherwise comma-formatted.

### Claude Summary Block

- Background: `#0f1a2e`, left border 3px `#1E40AF`, rounded-r-lg, p-5
- Label: "Org Intelligence", Fira Sans xs, `text-[#3B82F6]`
- Refresh button: amber text, Lucide RefreshCw 12px, triggers `?force=true`
- Loading: 2 skeleton lines, `animate-pulse`, `bg-slate-700/50`
- Body: Fira Sans sm, `text-slate-200`, leading-relaxed

### Health Bar Chart

Recharts `BarChart`, horizontal layout (layout="vertical").
- Bar fill: `#22c55e` (green), `#F59E0B` (yellow), `#ef4444` (red) via `<Cell>`
- Y-axis: sequence names truncated at 24 chars, Fira Sans 11px
- X-axis: 0–100, Fira Code 11px
- Reference lines at 40 (yellow threshold) and 70 (green threshold), dashed
- Tooltip: dark bg `#111111`, shows score + flagged count + full name
- Click handler on bars: sets `selectedSequenceId` to open slide-out
- Height: max(300, sequences * 50)

### Interaction

Clicking a bar opens `SequenceSlideOut`. Slide-out opening/closing is state-driven (`selectedId`).

---

## Deviations from Master

- **Background:** Uses `#0a0a0a` (near-black) instead of Master's `#F8FAFC` (light) — OLED dark mode override per task spec.
- **Card backgrounds:** `#111111` instead of `#F8FAFC` — dark equivalent.
- **Summary block:** Custom color `#0f1a2e` (deep navy) not in Master palette — purpose-built for Claude summary sections.
