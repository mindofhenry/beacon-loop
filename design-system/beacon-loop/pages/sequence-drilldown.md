# Sequence Drilldown — Page Design Override

**File:** `dashboard/components/SequenceSlideOut.tsx`
**Triggered by:** Clicking a bar in the org health chart

---

## Layout

Right-edge slide-out panel, fixed position.
- Width: `w-full md:w-[50vw]`
- Background: `#0f0f0f`
- Left border: `1px solid #1f1f1f`
- Full height, scrollable
- Backdrop: `bg-black/50`, click to close

### Header (sticky)

- Background: `#0f0f0f`, bottom border `#1f1f1f`
- Sequence name: Fira Code lg
- Source badge: `bg-[#1E40AF]`, white text, Fira Sans xs, rounded-full
- Health score badge: colored by tier (green/yellow/red), Fira Code xs, rounded-full
- Close: Lucide X, top-right

### Claude Sequence Summary

Same pattern as org summary block:
- `#0f1a2e` bg, `#1E40AF` left border 3px
- Label: "Sequence Intelligence", `text-[#3B82F6]`
- Refresh → `?force=true`
- Skeleton loading state

### Step Waterfall Chart

Recharts `BarChart`, vertical bars.
- Data: reply_rate * 100 per step
- Bar fill by severity via `<Cell>`: CRITICAL `#ef4444`, WARNING `#F59E0B`, OK `#22c55e`
- Reference lines: 2.0 (CRITICAL), 3.5 (WARNING)
- X-axis: "Step 1", "Step 2", etc. (Fira Sans)
- Y-axis: percentage (Fira Code)
- Height: 220px

### Step Cards

One per step, stacked vertically:
- Left border 2px colored by severity
- Background: severity-tinted (e.g. `bg-[#ef4444]/10` for CRITICAL)
- Step number: Fira Code xs in `#1f1f1f` badge
- Type icon: Mail (email), Phone (call), Globe (linkedin)
- Reply rate: Fira Code lg; open rate + meeting rate: Fira Code xs, slate-400
- Severity badge: tiny pill, top-right
- Subject line: Fira Sans xs, `text-slate-500`, truncated
- CRITICAL/WARNING cards are clickable → opens RewriteModal

---

## Deviations from Master

- **Panel background:** `#0f0f0f` not in Master — slightly lighter than page bg for visual layering.
- **Globe icon:** Used for LinkedIn steps since `lucide-react` in this version doesn't export a LinkedIn icon.
- **Step cards:** Custom severity-tinted backgrounds not in Master component specs.
