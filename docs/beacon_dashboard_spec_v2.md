# Beacon Platform — Dashboard Spec v2

**Version:** 2.0
**Date:** April 3, 2026
**Owner:** Henry Marble
**Status:** In progress — Sessions 1–4 complete, spec updated to reflect platform framing
**Supersedes:** `beacon_loop_dashboard_spec_v1.md`

---

## 0. What Changed from v1

This spec replaces v1. Key changes:

1. **Platform framing.** Beacon is the product. Loop is a module. The dashboard is the Beacon dashboard, not the "Beacon Loop dashboard." Signal and Graph appear as placeholder sections in the nav.
2. **Nav restructured.** Four Loop pages: Overview, Insights, Reps, Sequences. Compare removed as a top-level page — it becomes a sub-route within Sequences.
3. **Ask Beacon (AI query interface).** Two-tier AI interaction model: a prominent experience on the Insights page and a global modal accessible from every page. Supports guided prompts, freeform questions, text + chart responses, and export.
4. **Rewrite drawer stays as a drawer.** Not promoted to a page. Opened from Insights or Sequences when a flagged step is clicked.
5. **Font size increase.** All typography scales up ~20% from current implementation across the board.
6. **Renamed pages.** "Underperforming" → "Insights." "Home" → "Overview."

---

## 1. Product Vision & Quality Pillars

**Platform-level problem statement:** GTM reps live across 6–8 tools. The data they need to prioritize their day, understand why an account matters, and know what's working in their sequences is fragmented across all of them. Beacon sits between the tools reps already use and surfaces intelligence where they already are.

**Loop module problem statement:** Outreach admits it doesn't do step-level attribution. Beacon Loop does.

### Six Quality Pillars

Every feature ships only if it serves at least one. Features that don't map get deferred.

| Pillar | What it means | Dashboard implication |
|---|---|---|
| Actionable insights | Compress data into decisions. Show what to do, not just what happened. | Quick actions panel, coaching queue, Ask Beacon |
| Messaging rewrites | Diagnose *why* a step fails before prescribing *what* to write. | Rewrite drawer: FM diagnosis, methodology, diff view |
| Platform availability | Deployed, accessible, works where people already are. | Vercel deployment, MCP on Railway, role selector |
| Ease of use | A manager with 15 minutes can prepare for a 1:1. | Role-based homepage, rep grouping, inline rewrites |
| Simplicity | Don't overwhelm. Data on demand, not forced. | Progressive disclosure: KPIs → actions → drill-in → detail |
| Strategic planning | Serve leadership with trends, attribution, quarter-over-quarter. | Ask Beacon charts, time filters, LLM strategy summary |

---

## 2. Scope Audit & Ship Line

### Ships in v1

| Feature | Status | Pillar |
|---|---|---|
| Attribution model (step → pipeline) | Done | Actionable insights |
| Synthetic data (Outreach + Salesloft + SF) | Done | Platform availability |
| MCP server — 6 tools verified | Done | Platform availability |
| Messaging intelligence KB (34KB JSON) | Done | Messaging rewrites |
| Pre-classifier (performance + copy + context) | Done | Messaging rewrites |
| RewriteEngine abstraction | Done | Messaging rewrites |
| Reps table (8 reps, rep_id on step_performance) | Done (Session 1) | Ease of use |
| Messaging theme reclassification | Done (Session 1) | Strategic planning |
| Rewrite regeneration (33 rows, all columns populated) | Done (Session 1) | Messaging rewrites |
| Global shell (sidebar, top bar, role selector, time filter) | Done (Session 2) — needs refactor | All pillars |
| Sequences page (table, filters, health bar, sorting) | Done (Session 3) — needs nav rename | Actionable insights |
| Underperforming page (grouped cards, severity, filters) | Done (Session 4) — becomes Insights | Actionable insights |
| Dashboard — platform framing (Beacon nav, module sections) | Needs refactor | Platform availability |
| Ask Beacon — AI query interface (Insights + global) | Not started | Actionable insights, Strategic planning |
| Reps page | Not started | Ease of use |
| Overview page (role-based homepage) | Not started | All pillars |
| Rewrite drawer (FM diagnosis, diff view, talking points) | Not started | Messaging rewrites |
| Sequences Compare sub-route | Not started | Strategic planning |
| Font size increase (~20%) | Not started | Ease of use |
| Vercel deployment | Not started | Platform availability |
| README for hiring managers | Not started | Platform availability |

### Deferred

| Feature | Why |
|---|---|
| Rep top movers (weekly delta) | Requires weekly delta data not yet generated |
| FM distribution chart | Engineering visibility, not user-facing |
| Methodology breakdown chart | Engineering visibility, not user-facing |
| Routing efficiency metric | Internal proof, not portfolio-facing |
| Persona config UI | Scope addition without narrative value |
| Demo video | Comes after deployment |
| Nooks integration | P1, not blocking v1 |

---

## 3. User Personas & Journey Maps

### Persona 1: Sarah — SDR Manager

**Profile:** 6 reps. Opens Beacon before Monday team meeting and Tuesday 1:1s. Has 15 minutes.
**Goal:** Walk into every 1:1 with specific, data-backed talking points per rep.
**Trigger:** Calendar reminder. **Success:** Talking points copied, prep done in <15 min.

| Stage | Question | Target UX |
|---|---|---|
| 1. Open dashboard | "Is anything on fire?" | Overview: quick actions + what changed. LLM summary. |
| 2. Triage | "Which steps are killing us and who owns them?" | Insights: grouped by rep, sorted by severity. Ask Beacon for deeper analysis. |
| 3. Drill into rep | "Content, timing, or targeting problem?" | Reps page → click rep → filtered Insights view. |
| 4. Talking points | "What do I tell them to change?" | Rewrite drawer slides in. Copy talking points button. |

### Persona 2: Marcus — RevOps Lead

**Profile:** Org-wide sequence strategy. Leadership meeting prep. Pipeline reviews.
**Goal:** Data-backed recommendations: scale this, fix this, kill this.
**Trigger:** Pipeline review or leadership prep. **Success:** Has the one-slide answer.

| Stage | Question | Target UX |
|---|---|---|
| 1. Assess health | "Getting better or worse?" | Overview: KPI cards with trend arrows. 90d default. |
| 2. Patterns | "Persona, messaging, or targeting problem?" | Ask Beacon: "What messaging themes are underperforming?" → chart + explanation. |
| 3. Attribution | "Most pipeline per step by theme?" | Ask Beacon: "Which sequences generated the most pipeline?" → exportable chart. |
| 4. Recommendation | "What do I tell the VP?" | Ask Beacon: "Give me a QBR summary of sequence performance." → copyable output. |

### Persona 3: SDR/Rep

Filtered version of manager's views. Sees own flagged steps sorted by severity. Click → drawer. Ask Beacon available for self-coaching questions.

---

## 4. Navigation Architecture

### Platform Model

Beacon is the product. Loop, Signal, and Graph are modules. The sidebar reflects this hierarchy.

### Sidebar Structure

```
BEACON (logo/wordmark — top left)

Loop ▸ (collapsible section header)
  Overview
  Insights        ← prominent Ask Beacon experience lives here
  Reps
  Sequences

Signal ▸ (collapsed, grayed out, "Coming soon" badge)

Graph ▸ (collapsed, grayed out, "Coming soon" badge)
```

### Top Bar

Left: "Beacon" wordmark (same as sidebar header, or simplified).
Right: Role selector dropdown (SDR Manager | RevOps Lead | SDR/Rep). No auth.

### Design Principles

- **Actions first, evidence on demand.** Every page leads with "what to do."
- **Role selector in top bar** (dropdown, no auth). Changes homepage + default filters.
- **Four pages under Loop, one drawer, one AI modal.** Overview, Insights, Reps, Sequences. Rewrite drawer = global overlay. Ask Beacon modal = global overlay.
- **Per-page time filters.** Chip bar: 7d, 30d, 90d, 6mo, 1yr. Each page remembers its own.
- **Progressive disclosure.** KPIs → quick actions → drill-in → detail → rewrite.
- **Signal and Graph are nav placeholders only.** No pages, no routes, no data. Clicking shows a "Coming soon" state or does nothing.

### Page Visibility by Role

| Page | Route | Manager | RevOps | Rep |
|---|---|---|---|---|
| Overview | `/` | Coaching queue + quick actions | KPIs + strategy summary | My flagged steps |
| Insights | `/insights` | Grouped by rep + Ask Beacon (prominent) | Grouped by sequence + Ask Beacon (prominent) | Flat (my steps) + Ask Beacon |
| Reps | `/reps` | All reps, sortable | All reps, sortable | Own profile |
| Sequences | `/sequences` | All (default: all reps) | All (default: all) | Filtered to my seqs |
| Sequence detail | `/sequences/[id]` | Full | Full | Full |
| Sequence compare | `/sequences/compare?a=X&b=Y` | Available | Primary user | Available |

---

## 5. Page-by-Page Component Spec

### Overview ( `/` )

**Primary question:** "What should I do right now?"

| Component | Roles | Description | Data |
|---|---|---|---|
| KPI cards (4) | All | Active sequences, avg reply rate, pipeline influenced, flagged steps. Trend arrows vs. prior period. | `step_performance`, `step_attribution_credit` |
| Quick actions (3–5) | Manager, Rep | LLM-generated. Specific: "CISO step 1 has 1.0% reply — rewrite cold opener." Links to step. Refresh. | Claude API + flagged steps |
| Coaching queue | Manager | By rep: name, flagged count, worst step. Click rep → Insights filtered. | `step_performance` JOIN `reps` |
| My flagged steps | Rep | Same as coaching queue, filtered to own sequences. Click → drawer. | `step_performance` WHERE `rep_id` = current |
| Messaging attribution | RevOps | Horizontal bar: pipeline per step by theme. Click → sequences filtered. | `step_attribution_credit` JOIN `messaging_theme` |
| LLM org intelligence | RevOps | Top 3 strategic recommendations. Copyable. Refresh. | Claude API + aggregated data |
| Ask Beacon button | All | Persistent in top-right or bottom-right corner. Opens global AI modal. | — |

### Insights ( `/insights` )

**Primary question:** "Which steps need attention, and what should we do about them?"

This page is the action center. It combines the triage queue (flagged steps) with the most prominent AI experience.

| Component | Description |
|---|---|
| Ask Beacon panel | Prominent element at top of page. Not a small icon — a primary UI element. Contains: prompt input bar, 3–4 guided prompt suggestions (role-aware and page-contextual), response area with text + rendered chart, export button (PNG/clipboard). See Section 6 for full spec. |
| Grouping toggle | Manager: by rep (default). RevOps: by sequence (default). Rep: flat (default). Override available. Severity sort within groups. |
| Step cards (expandable) | Collapsed: severity dot, sequence + step number, type/intent pills, reply rate (red), flag pill, chevron. Expanded: send volume, open rate, confidence %, messaging theme pill, "View rewrite →" link. |
| Filter bar | TimeFilter (7d default), severity (All/High/Medium/Low), step type (dynamic), flag type (dynamic). All client-side. |

**Guided prompts for Insights (role-aware):**

| Role | Example prompts |
|---|---|
| Manager | "Which rep has the most flagged steps?" / "What messaging themes are underperforming for my team?" / "Show me reply rate trends for the last 90 days" |
| RevOps | "Which sequences generated the most pipeline?" / "Give me a QBR summary of sequence performance" / "Compare messaging theme effectiveness across personas" |
| Rep | "What's my worst-performing step right now?" / "Why was this step flagged?" / "How do my reply rates compare to the team average?" |

### Reps ( `/reps` )

**Primary question:** "How are my reps performing?"

This page is a performance hub — not just a table. It has three zones: leaderboard, team view, and a detail sub-route.

| Component | Description |
|---|---|
| Leaderboard | Top section. Two columns side by side: "Top Performers" (top 3 by reply rate or pipeline) and "Needs Attention" (bottom 3 by flagged count or reply rate). Each entry shows rep name, key metric, trend arrow. Click → `/reps/[id]`. Sortable by metric (reply rate, pipeline influenced, flagged count). |
| Team table | Below leaderboard. Grouped by team. Each rep row: name, active sequences, avg reply rate, avg open rate, flagged step count, pipeline influenced, health indicator, trend direction. Click row → `/reps/[id]`. |
| Filter bar | TimeFilter, source toggle (All / Outreach / Salesloft). |
| Ask Beacon button | Global AI modal button (same as all pages). |

**Data:** `step_performance` aggregated by `rep_id`, joined to `reps` table. Same data as Sequences page, different aggregation axis (people vs. campaigns).

### Rep Detail ( `/reps/[id]` )

**Primary question:** "What does this rep's full picture look like?"

This is Sarah's pre-1:1 prep page. Everything she needs for one rep in one place.

| Component | Description |
|---|---|
| Rep header | Name, team, role, source (OR/SL pill). Aggregate KPIs: reply rate, open rate, pipeline influenced, flagged count. Trend arrows. |
| Sequence portfolio | Table of sequences this rep owns. Per-sequence: name, health score bar, reply rate, flagged steps, pipeline. Click → `/sequences/[id]`. |
| Flagged steps | List of this rep's flagged steps, sorted by severity. Same card format as Insights page. Click → rewrite drawer. |
| Pipeline breakdown | Simple visualization of pipeline influenced by sequence or by messaging theme for this rep. |
| Ask Beacon button | Global AI modal. Contextual prompt suggestion: "What should I focus on with [rep name] in our next 1:1?" |

### Sequences ( `/sequences` )

**Primary question:** "How healthy are our sequences?"

| Component | Description |
|---|---|
| Filter bar | Rep, Persona, Source (OR/SL), Health status, Messaging theme. Role sets defaults. |
| Sequence table | Sortable: name, source, health score (bar), reply rate, flagged count, pipeline, theme. Click → detail. |
| Compare action | Select 2 sequences via checkboxes → "Compare" button appears in filter bar → navigates to `/sequences/compare?a=X&b=Y`. |
| Detail ( `/sequences/[id]` ) | Step waterfall. Each step: number, type, intent, rates, flag. Click flagged → drawer. |
| Ask Beacon button | Global AI modal button. |

### Sequences Compare ( `/sequences/compare?a=X&b=Y` )

**Primary question:** "How does sequence A stack up against B?"

| Component | Description |
|---|---|
| Sequence selector | Two dropdowns (pre-populated from query params or manual selection). Cross-source supported. |
| Side-by-side metrics | Reply, open, meeting rates, pipeline, health, flagged count. Delta column. Step-level alignment where possible. |

---

## 6. Ask Beacon — AI Query Interface

### Overview

Ask Beacon is the AI-powered analytics layer. Users ask natural language questions and receive text explanations + rendered visualizations grounded in their actual data. This is the single most differentiating feature for the portfolio — it demonstrates that Beacon isn't just a dashboard, it's an AI analyst.

### Two Tiers

**Tier 1: Insights page (prominent).** A primary UI element on the Insights page — not tucked in a corner. Large prompt bar at top of page with guided prompt suggestions underneath. Responses render inline on the page (text + chart + export). This is the featured AI experience.

**Tier 2: Global modal (accessible everywhere).** A persistent button (top bar or bottom-right FAB) available on Overview, Reps, and Sequences. Opens a modal/drawer overlay. Same capabilities (text + charts + export) but more compact. Guided prompts are contextual to the current page.

### Interaction Model

1. User sees 3–4 guided prompt suggestions (role-aware, page-contextual) or types a freeform question.
2. Question is sent to Claude API along with relevant data context (pulled from Supabase via the same query patterns the MCP tools use).
3. Claude responds with a structured output: text explanation + chart specification (chart type, data points, labels, colors).
4. Frontend renders the chart (Recharts) and displays the text explanation.
5. User can export the response (PNG screenshot of chart + text, or copy text to clipboard).

### Technical Architecture

The data retrieval layer already exists — 6 MCP tools are verified and working. Ask Beacon reuses the same query patterns but calls them from the Next.js frontend instead of through MCP. The Claude API integration pattern exists in the RewriteEngine.

| Layer | What exists | What's new |
|---|---|---|
| Data retrieval | MCP tools query Supabase | Same queries, called from Next.js API routes |
| LLM call | RewriteEngine calls Claude API | New prompt template for analytics questions |
| Response format | RewriteEngine returns structured JSON | New schema: `{ text: string, chart: { type, data, config } }` |
| Frontend | None | Prompt bar component, chart renderer (Recharts), export button |

### Guided Prompt Suggestions by Page

| Page | Role | Example prompts |
|---|---|---|
| Insights | Manager | "Which rep needs the most coaching this week?" |
| Insights | RevOps | "Show me pipeline attribution by messaging theme" |
| Insights | Rep | "What's my worst step and how can I fix it?" |
| Overview | Manager | "Summarize what changed since last Monday" |
| Overview | RevOps | "Give me a one-paragraph QBR update on sequence health" |
| Reps | Manager | "Rank my reps by improvement over the last 30 days" |
| Sequences | RevOps | "Which sequences should we retire?" |

### Response Visualization

Claude's response includes a chart specification that the frontend renders. The chart control model is **minimal**: Claude specifies the chart type and data points; the frontend owns all styling (colors, fonts, axis formatting, spacing). This keeps the prompt simple and ensures visual consistency with the rest of the dashboard.

Supported chart types for v1:

- **Bar chart** (horizontal and vertical) — for comparisons (rep performance, sequence ranking, theme effectiveness)
- **Line chart** — for trends over time (reply rates, pipeline, flagged count)
- **Table** — for structured data that doesn't need a visual (step-by-step breakdowns)

The chart spec is a JSON object: `{ type: "bar" | "line" | "table", data: [...], title: string, xLabel?: string, yLabel?: string }`. The frontend maps this to Recharts props with pre-defined styling. No client-side AI interpretation of chart data.

### Response Streaming

Ask Beacon responses stream token-by-token. Text streams as it arrives; the chart renders once the full chart spec JSON is parsed from the response. This creates a natural flow: the user reads the explanation while the chart materializes.

### Export

- **Copy text** — clipboard copy of the text explanation.
- **Export chart** — PNG download of the rendered chart (html2canvas or similar). PNG only for v1.

---

## 7. Rewrite Drawer Spec

**Type:** Global overlay (not a page). Slides from right, ~400px. Available on any page.
**Trigger:** Click any flagged step (from Insights or Sequences).
**Close:** X button or click outside.

| Section | Content | Data |
|---|---|---|
| Header | Sequence name, step #, type, intent. Severity badge. | `step_performance` |
| FM diagnosis | Which failure mode(s), severity, signal class. | `rewrite_suggestions.failure_modes_detected` |
| Methodology | Which methodology and why. | `rewrite_suggestions.methodology_used` |
| Diff view | Original (`step_copy_snapshot`) vs. suggested. Highlights. | `rewrite_suggestions` |
| Copy talking points | 3-sentence coaching summary. Clipboard copy. | Generated from rewrite data |
| Generate/regenerate | Button if no rewrite exists. Regenerate option if exists. | `RewriteEngine.rewrite()` |

---

## 8. Typography & Font Sizing

### Current Issue

Font sizes across the dashboard are too small (~20% undersized). Existing components also hardcode `fontFamily: 'IBM Plex Mono, monospace'` via inline styles, while the design system prescribes Fira Code + Fira Sans.

### Required Changes

1. **Increase all font sizes ~20% across the board.** This applies to body text, table cells, headings, pills, labels, KPI numbers, card content — everything.
2. **Resolve font drift.** Components with inline `fontFamily` overrides need to be updated to use the design system fonts (Fira Code for mono, Fira Sans for sans-serif) via CSS variables or Tailwind theme.
3. **Specific size targets (approximate):**
   - Body text / table cells: 14px → 17px
   - Small labels / pills: 11px → 13px
   - Section headings: 16px → 19px
   - Page titles: 20px → 24px
   - KPI numbers: 24px → 29px
   - Nav items: 13px → 16px

These are guidelines, not pixel-perfect requirements. The goal is readability — nothing should require squinting.

---

## 9. Data Model

### Existing Tables (verified Session 1)

| Table | Rows | Key columns |
|---|---|---|
| `step_performance` | 110 | `id`, `sequence_id`, `step_id`, `rep_id`, `reply_rate`, `open_rate`, `meeting_rate`, `flag_type`, `flag_confidence`, `messaging_theme`, `health_score_v2` |
| `rewrite_suggestions` | 33 | `step_id`, `failure_modes_detected`, `methodology_used`, `step_copy_snapshot`, `suggested_rewrite` |
| `reps` | 8 | `id`, `name`, `email`, `role`, `team`, `source_user_id` |
| `step_attribution_credit` | 3,446 | `step_id`, `sequence_id`, attribution columns |
| `touchpoints` | 12,480 | Activity log |
| `sequence_steps` | 24 + others | Step definitions with copy |

### No New Tables Required

Ask Beacon queries the same tables via the same patterns the MCP tools use. No new data model work needed.

---

## 10. Build Sequence (Updated)

Sessions 1–4 are complete. Remaining sessions account for the nav refactor, new pages, and Ask Beacon.

| Session | Scope | Status | Output |
|---|---|---|---|
| 1. Data foundation | Reps table, rep_id, messaging themes, rewrites | Done | Data ready |
| 2. Global shell | Sidebar, top bar, role selector, time filter | Done — needs refactor | Nav framework |
| 3. Sequences page | Filter bar, sequence table, detail sub-route | Done — needs nav rename | Working page |
| 4. Underperforming page | Grouped cards, severity, filters | Done — becomes Insights | Working page |
| 5. Nav refactor + font fix | Restructure sidebar to platform model (Beacon → Loop section with 4 pages, Signal/Graph placeholders). Rename routes (`/underperforming` → `/insights`, `/` → Overview). Increase all font sizes ~20%. Resolve font drift (inline IBM Plex → design system Fira). | Not started | Platform-framed shell |
| 6. Reps page | Rep table with aggregated metrics, click-through to filtered Insights, filters | Not started | People lens |
| 7. Rewrite drawer | FM diagnosis, methodology, diff view, talking points, generate/regen | Not started | Core differentiator |
| 8. Overview page | 3 role variants, KPI cards, coaching queue / attribution chart / LLM actions | Not started | Landing page |
| 9. Ask Beacon | Insights-page prominent panel + global modal. Guided prompts, Claude API integration, chart rendering (Recharts), export. | Not started | AI analytics layer |
| 10. Deploy + polish | Vercel, README, visual polish, demo script | Not started | Live portfolio URL |

### Dependency Notes

- Session 5 (nav refactor) should happen before any new pages are built — it establishes the platform frame everything lives inside.
- Session 7 (rewrite drawer) can happen in parallel with Session 6 (Reps) since they're independent components.
- Session 9 (Ask Beacon) depends on Sessions 6–8 being done so the full data context is available.
- Session 10 is always last.

---

## 11. Key Decisions Log

Decisions from v1 that remain in effect, plus new decisions from this session.

| Decision | Rationale | Date |
|---|---|---|
| Beacon is the product, Loop is a module | Platform framing tells a stronger portfolio story. Nav reflects hierarchy. Signal/Graph are placeholders. | April 3, 2026 |
| Nav: Overview, Insights, Reps, Sequences (in that order) | Flows from strategic → tactical → people → catalog. Each page has a clear owner persona. | April 3, 2026 |
| Compare is a sub-route of Sequences, not a top-level page | Low-frequency action. Accessed via checkbox selection on Sequences page. Keeps nav to 4 items. | April 3, 2026 |
| Ask Beacon: prominent on Insights, global modal everywhere | Two-tier AI model. Insights is the featured experience. Global modal is the utility. Same backend. | April 3, 2026 |
| Ask Beacon replaces a static Attribution page | Any attribution question can be asked through Ask Beacon and get a generated chart. More powerful than a fixed page. | April 3, 2026 |
| Font sizes increase ~20% | Current implementation is too small for readability. | April 3, 2026 |
| Rewrite as side drawer (unchanged from v1) | Manager stays in triage flow. Never loses place. Click → slides in. Close → next step. | April 3, 2026 |
| Role-based homepages — 3 roles (unchanged) | Same data, different arrangement. Role selector in top bar, no auth. | April 3, 2026 |
| Per-page time filters (unchanged) | Different cadences per page. Weekly for Insights, quarterly for attribution. | April 3, 2026 |
| Rep homepage = filtered manager (unchanged) | Two layouts, three roles. Max impact, min code. | April 3, 2026 |
| Reps page: sub-route detail view (`/reps/[id]`) | More extensible than inline expand. Becomes the pre-1:1 prep page for managers. | April 3, 2026 |
| Reps page: leaderboard + team table layout | Top/bottom performers at a glance, then team-grouped detail. Answers "who's winning and who needs help" instantly. | April 3, 2026 |
| Ask Beacon: token-by-token streaming | More impressive demo. Text streams while chart renders after full spec is parsed. | April 3, 2026 |
| Ask Beacon: minimal chart control | Claude picks type + data, frontend owns all styling. Keeps prompts simple, ensures visual consistency. | April 3, 2026 |
| Export: PNG only for v1 | Covers primary use case (paste into Slack/slides). SVG/PDF deferred. | April 3, 2026 |
| Build order: nav refactor (Session 5) before Reps (Session 6) | Clean platform frame must exist before new pages are built inside it. | April 3, 2026 |

---

## 12. Open Questions

All five questions from the initial spec draft have been resolved. See Decisions Log (Section 11) for rationale.

1. ~~Reps page detail view~~ → **Resolved: sub-route (`/reps/[id]`).** Leaderboard + team table on `/reps`, full rep profile on sub-route.
2. ~~Ask Beacon response streaming~~ → **Resolved: token-by-token streaming.** Text streams as it arrives, chart renders once spec is fully parsed.
3. ~~Ask Beacon chart fidelity~~ → **Resolved: minimal.** Claude picks type + data, frontend owns styling.
4. ~~Export format~~ → **Resolved: PNG only for v1.**
5. ~~Session 5 vs. 6 ordering~~ → **Resolved: nav refactor first (Session 5), then Reps (Session 6).**
