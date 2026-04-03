# Beacon Loop — Dashboard UX Spec & Scope Audit

**Version:** 1.0  
**Date:** April 3, 2026  
**Owner:** Henry Marble  
**Status:** Scoped and ready for execution

---

## 1. Product Vision & Quality Pillars

**One-line problem statement:** Outreach admits it doesn't do step-level attribution. Beacon Loop does.

Beacon Loop closes the attribution gap: no step-level meeting attribution, no mapping from sequence performance to pipeline outcomes, no automated path from "this step is broken" to "here's what to write instead."

### Six Quality Pillars

Every feature ships only if it serves at least one of these. Features that don't map get deferred.

| Pillar | What it means | Dashboard implication |
|---|---|---|
| Actionable insights | Compress data into decisions. Show what to do, not just what happened. | Quick actions panel, coaching queue, LLM recommendations |
| Messaging rewrites | Diagnose *why* a step fails before prescribing *what* to write. | Rewrite drawer: FM diagnosis, methodology, diff view |
| Platform availability | Deployed, accessible, works where people already are. | Vercel deployment, MCP on Railway, role selector |
| Ease of use | A manager with 15 minutes can prepare for a 1:1. | Role-based homepage, rep grouping, inline rewrites |
| Simplicity | Don't overwhelm. Data on demand, not forced. | Progressive disclosure: KPIs > actions > drill-in > detail |
| Strategic planning | Serve leadership with trends, attribution, quarter-over-quarter. | Attribution chart, time filters, LLM strategy summary |

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
| Dashboard — role-based, 4 pages + drawer | Rebuild | All pillars |
| Messaging theme classification | Done | Strategic planning |
| Homepage — quick actions panel | Scoped | Actionable insights |
| Homepage — messaging attribution chart | Scoped | Strategic planning |
| Per-page time range filters | Scoped | Strategic planning |
| Vercel deployment | Not started | Platform availability |
| Rewrite diff view (drawer) | Partial | Messaging rewrites |
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

| Stage | Question | Today's UX | Target UX |
|---|---|---|---|
| 1. Open dashboard | "Is anything on fire?" | Bar chart of 25 sequences. No urgency. **FAILS.** | Quick actions + what changed. LLM summary. |
| 2. Triage | "Which steps are killing us and who owns them?" | Flat table, no rep grouping, no severity sort. **FAILS.** | Grouped by rep, sorted by severity. |
| 3. Drill into rep | "Content, timing, or targeting problem?" | No rep filter. **FAILS.** | Click rep → filtered view. |
| 4. Talking points | "What do I tell them to change?" | Rewrite disconnected from flow. **FAILS.** | Drawer slides in. Copy talking points button. |

### Persona 2: Marcus — RevOps Lead

**Profile:** Org-wide sequence strategy. Leadership meeting prep. Pipeline reviews.  
**Goal:** Data-backed recommendations: scale this, fix this, kill this.  
**Trigger:** Pipeline review or leadership prep. **Success:** Has the one-slide answer.

| Stage | Question | Today's UX | Target UX |
|---|---|---|---|
| 1. Assess health | "Getting better or worse?" | KPI cards, no trends. **PARTIAL.** | KPI cards with trend arrows. 90d default. |
| 2. Patterns | "Persona, messaging, or targeting problem?" | No grouping by theme or persona. **FAILS.** | Attribution chart. Persona filter. |
| 3. Attribution | "Most pipeline per step by theme?" | Classification done, no chart. **FAILS.** | Click theme → filtered sequences. |
| 4. Recommendation | "What do I tell the VP?" | No export or summary. **FAILS.** | LLM top 3 recommendations. Copyable. |

### Persona 3: SDR/Rep

Filtered version of manager's homepage. Sees own flagged steps sorted by severity. Click → drawer.

---

## 4. Role-Based Page Architecture

### Design Principles

- **Actions first, evidence on demand.** Every page leads with "what to do."
- **Role selector in top bar** (dropdown, no auth). Changes homepage + default filters.
- **Four pages, one drawer.** Home, Sequences, Underperforming, Compare. Rewrite drawer = global overlay.
- **Per-page time filters.** Chip bar: 7d, 30d, 90d, 6mo, 1yr. Each page remembers its own.
- **Progressive disclosure.** KPIs → quick actions → drill-in → detail → rewrite.

### Navigation

- **Left sidebar (persistent):** Home | Sequences | Underperforming | Compare
- **Top bar:** beacon_loop (left) | Role: SDR Manager ▾ (right)

### Page Visibility by Role

| Page | Route | Manager | RevOps | Rep |
|---|---|---|---|---|
| Home | `/` | Coaching queue + quick actions | Attribution + strategy | My flagged steps |
| Sequences | `/sequences` | All (default: all reps) | All (default: all) | Filtered to my seqs |
| Sequence detail | `/sequences/[id]` | Full | Full | Full |
| Underperforming | `/underperforming` | Grouped by rep | Grouped by sequence | Flat (my steps) |
| Compare | `/compare` | Available | Primary user | Available |

---

## 5. Page-by-Page Component Spec

### Home ( / )

**Primary question:** "What should I do right now?"

| Component | Roles | Description | Data |
|---|---|---|---|
| KPI cards (4) | All | Active sequences, avg reply rate, pipeline influenced, flagged steps. Trend arrows vs. prior period. | `step_performance`, `step_attribution_credit` |
| Quick actions (3-5) | Manager, Rep | LLM-generated. Specific: "CISO step 1 has 1.0% reply — rewrite cold opener." Links to step. Refresh. | Claude API + flagged steps |
| Coaching queue | Manager | By rep: name, flagged count, worst step. Click rep → underperforming filtered. | `step_performance` JOIN `reps` |
| My flagged steps | Rep | Same as coaching queue, filtered to own sequences. Click → drawer. | `step_performance` WHERE `rep_id` = current |
| Messaging attribution | RevOps | Horizontal bar: pipeline per step by theme. Click → sequences filtered. | `step_attribution_credit` JOIN `messaging_theme` |
| LLM org intelligence | RevOps | Top 3 strategic recommendations. Copyable. Refresh. | Claude API + aggregated data |

### Sequences ( /sequences )

**Primary question:** "How healthy are our sequences?"

| Component | Description |
|---|---|
| Filter bar | Rep, Persona, Source (OR/SL), Health status, Messaging theme. Role sets defaults. |
| Sequence table | Sortable: name, source, health score (bar), reply rate, flagged count, pipeline, theme. Click → detail. |
| Detail ( /sequences/[id] ) | Step waterfall. Each step: number, type, intent, rates, flag. Click flagged → drawer. |

### Underperforming ( /underperforming )

**Primary question:** "Which steps need attention, and whose are they?"

| Component | Description |
|---|---|
| Grouping toggle | Manager: by rep. RevOps: by sequence. Rep: flat. Override available. Severity sort within groups. |
| Step cards (expandable) | Sequence name, step #, type, intent, reply rate, volume. Expand → subject + metrics. Click → drawer. |
| Filter bar | Rep, Severity, Step type, Persona, Flag type. |

### Compare ( /compare )

**Primary question:** "How does sequence A stack up against B?"

| Component | Description |
|---|---|
| Sequence selector | Two dropdowns. Pre-populated from sequences page. Cross-source supported. |
| Side-by-side metrics | Reply, open, meeting rates, pipeline, health, flagged. Delta column. Step alignment. |

---

## 6. Rewrite Drawer Spec

**Type:** Global overlay (not a page). Slides from right, ~400px. Available on any page.  
**Trigger:** Click any flagged step.  
**Close:** X button or click outside.

| Section | Content | Data |
|---|---|---|
| Header | Sequence name, step #, type, intent. Severity badge. | `step_performance` |
| FM diagnosis | Which failure mode(s), severity, signal class. | `rewrite_suggestions.failure_modes_detected` |
| Methodology | Which methodology and why. | `rewrite_suggestions.methodology_used` |
| Diff view | Original (step_copy_snapshot) vs. suggested. Highlights. | `rewrite_suggestions` |
| Copy talking points | 3-sentence coaching summary. Clipboard copy. | Generated from rewrite data |
| Generate/regenerate | Button if no rewrite exists. Regenerate option if exists. | `RewriteEngine.rewrite()` |

---

## 7. Data Model Requirements

### New: reps table

Both Outreach (`user` resource, `relationships.user` on mailings) and Salesloft (`user` object, `user_id` on `cadence_membership`) have rep identity. Synthetic data mirrors this.

| Column | Type | Notes |
|---|---|---|
| id | UUID/INT | Primary key |
| name | TEXT | Display name (e.g., "Sarah Chen") |
| email | TEXT | Synthetic email |
| role | TEXT | 'sdr' \| 'ae' \| 'manager' |
| team | TEXT | Team grouping |
| source_user_id | TEXT | Mirrors sequencer API user ID format |

### Columns to verify/add

| Column | Table | Status | Action |
|---|---|---|---|
| messaging_theme | step_performance | Classified (Session 11) | Audit pain_point (3 steps only) |
| rep_id | step_performance | Does not exist | Add + seed with synthetic rep assignments |
| failure_modes_detected | rewrite_suggestions | Added in MI phases | Verify populated |
| methodology_used | rewrite_suggestions | Added in MI phases | Verify populated |
| step_copy_snapshot | rewrite_suggestions | Added in MI phases | Verify populated |

---

## 8. Build Sequence

| Session | Scope | Depends on | Output |
|---|---|---|---|
| 1. Data foundation | reps table, rep_id on step_performance, audit messaging_theme, verify rewrite columns | None | Data ready |
| 2. Global shell | Sidebar, top bar, role selector, role context provider, time filter component | None | Nav framework |
| 3. Sequences page | Filter bar, sequence table, detail sub-route, drawer placeholder | Session 2 | First working page |
| 4. Underperforming | Grouping toggle, expandable cards, filters, severity sort | Session 2 | Triage page |
| 5. Rewrite drawer | FM diagnosis, methodology, diff view, talking points, generate/regen | Sessions 3-4 | Core differentiator |
| 6. Home page | 3 role variants, LLM integration for actions + strategy | Sessions 3-5 | All pages done |
| 7. Deploy + polish | Vercel, README, visual polish, demo script | Session 6 | Live portfolio URL |

---

## 9. Key Decisions Log

All decisions made April 3, 2026. Final unless explicitly revisited.

| Decision | Rationale |
|---|---|
| Rewrite as side drawer | Manager stays in triage flow. Never loses place. Click → slides in. Close → next step. |
| Role-based homepages (3 roles) | Same data, different arrangement. Role selector in top bar, no auth. |
| Per-page time filters | Different cadences per page. Weekly for underperforming, quarterly for attribution. |
| Rep homepage = filtered manager | Two layouts, three roles. Max impact, min code. |
| Rep IDs mirror sequencer APIs | Outreach `user`, Salesloft `user_id`. Synthetic mirrors real integration. |
| 4 pages + 1 drawer | Reduced from 8+. Less cognitive load, tighter demo. |
| Actions first, evidence on demand | LLM summaries above charts. Data for drill-in, never forced. |
| Pipeline-per-step for attribution | Prevents breakup volume dominance. Per-step is actionable. |
