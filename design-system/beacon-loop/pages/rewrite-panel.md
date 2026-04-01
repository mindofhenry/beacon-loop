# Rewrite Panel — Page Design Override

**File:** `dashboard/components/RewriteModal.tsx`
**Triggered by:** Clicking a CRITICAL or WARNING step card in the sequence slide-out

---

## Layout

Centered modal over slide-out panel.
- Overlay: `bg-black/70`, `backdrop-blur-[4px]`
- Modal: `bg-[#111111]`, `border border-[#1f1f1f]`, `rounded-xl`
- Max width: 900px, width 90%, max-height 85vh, scrollable
- Close: Lucide X, absolute top-right

### Header

- Sequence name + "Step N" in Fira Code lg
- Step type in Fira Code xs, slate-400

### Two-Column Comparison

Grid `grid-cols-1 md:grid-cols-2 gap-6`.

**Left — "Current":**
- Label: Fira Sans xs uppercase tracking-wider, `text-slate-400`
- Subject + Body boxes: `bg-[#0a0a0a]`, `border border-[#1f1f1f]`, rounded-lg, p-3
- Body: min-h 120px, max-h 250px, scrollable, whitespace-pre-wrap

**Right — "Suggested":**
- Label: Fira Sans xs uppercase tracking-wider, `text-[#F59E0B]` (amber)
- Subject + Body boxes: Same base styling but `border-l-2 border-[#F59E0B]` (amber left border distinguishes suggested from current)

### Confidence Badge

Pill shape, Fira Code xs, white text:
- HIGH: `bg-[#22c55e]`
- MEDIUM: `bg-[#F59E0B]`
- LOW: `bg-[#ef4444]`

### Diagnosis Section

- Label: "Diagnosis", Fira Sans xs, `text-slate-400`
- Body: Fira Sans sm, `text-slate-200`, leading-relaxed

### Explanation Section ("Why This Works")

- Container: `bg-[#0f1a2e]`, `border-l-3 border-[#1E40AF]`, rounded-r-lg, p-4
- Label: "Why This Works", Fira Sans xs, `text-[#F59E0B]`
- Body: Fira Sans sm, `text-slate-200`, leading-relaxed

### Action Row

Right-aligned. Button style:
- `bg-[#F59E0B]`, white text, Fira Sans semibold sm, rounded-lg
- Lucide RefreshCw icon
- Hover: `opacity-90`, `translateY(-1px)`
- Disabled during generation: `opacity-50`, shows Loader2 spinner
- Label: "Regenerate" (if rewrite exists) or "Generate Rewrite" (if none)

### Empty State

When no rewrite exists: centered message + "Generate Rewrite" button (same amber style).

---

## Deviations from Master

- **Modal max-width:** 900px instead of Master's 500px — wider to accommodate two-column layout.
- **Modal padding:** p-8 instead of Master's 32px (same value, different notation).
- **Backdrop:** `bg-black/70` instead of Master's `rgba(0,0,0,0.5)` — darker for better contrast over slide-out.
- **Explanation block:** Reuses the Claude summary blue panel pattern (not in Master component specs).
