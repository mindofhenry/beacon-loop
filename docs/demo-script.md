# Beacon Loop — Demo Walkthrough

**Duration:** Under 3 minutes
**Audience:** GTM Engineering hiring manager at a Series B-D B2B SaaS company
**Setup:** Dashboard open in browser, role selector set to "SDR Manager"

---

## Beat 1: Overview (Manager View)

**Click:** Open the dashboard. You land on Overview with SDR Manager selected.

**What they see:** Four KPI cards (Active Sequences, Avg Reply Rate, Pipeline Influenced, Flagged Steps), a Quick Actions panel with live Claude-generated coaching recommendations, and a Coaching Queue table sorted by flagged step count.

**Say:**

> "This is what a manager sees when they open Beacon. Not a data dump — actionable intelligence. The Quick Actions panel hits Claude with your actual step performance data and returns specific coaching recommendations. The coaching queue shows which reps need attention and why, sorted by severity."

**Point out:** Quick Actions are generated live by Claude, grounded in the real data — not canned responses. Each recommendation names the specific sequence, step, and metric.

---

## Beat 2: Coaching Queue to Insights

**Click:** Click a rep name in the Coaching Queue. Navigate to the Insights page.

**What they see:** Flagged underperforming steps grouped by sequence, with severity indicators (high/medium/low), filter bar (severity, flag type, messaging theme), and group mode toggles (by rep, by sequence, flat). The Ask Beacon panel sits at the top.

**Say:**

> "The manager clicked one name and landed on every flagged step in their book. Severity indicators, filter by theme or flag type, group by rep or sequence. A manager can prep for a 1:1 in two minutes — they know exactly which steps to discuss and why."

---

## Beat 3: Flagged Step to Rewrite Drawer

**Click:** Click any flagged step card (pick one marked "high" severity). The Rewrite Drawer slides in from the right.

**What they see:** Step header with metrics (reply rate, open rate, sends), severity badge, failure mode diagnosis (e.g., "FM03 — Generic Value Prop"), methodology used, original vs. rewrite diff view (red/green), coaching talking points with copy button, and a Regenerate button.

**Say:**

> "This is the core differentiator. Beacon doesn't just flag the problem — it diagnoses the failure mode, picks a methodology, and generates a rewrite grounded in a messaging intelligence knowledge base. The original copy is on the left in red, the rewrite on the right in green. The talking points at the bottom give the manager a script for the coaching conversation. And if the first suggestion doesn't land, hit Regenerate — it calls Claude live."

**Do:** Click Regenerate to show the live LLM call. Point out the failure mode codes and methodology name.

---

## Beat 4: Switch to RevOps View

**Click:** Use the role selector in the bottom-left of the sidebar to switch to "RevOps Lead." You're back on Overview.

**What they see:** Same KPI cards, but below them: a horizontal bar chart showing Pipeline by Messaging Theme (pain_point, social_proof, value_add, trigger_event, breakup), and an Org Intelligence panel with Claude-generated strategic recommendations.

**Say:**

> "Same dashboard, different lens. RevOps sees pipeline attribution by messaging theme — which types of messages actually generate pipeline, not just replies. The Org Intelligence panel gives strategic recommendations grounded in the real attribution data. This is the RevOps QBR prep in one screen."

---

## Beat 5: Ask Beacon

**Click:** Click the sparkle FAB button in the bottom-right corner (or use the Ask Beacon panel on the Insights page). The modal opens.

**What they see:** Ask Beacon modal with guided prompts (role-aware — different prompts for Manager vs. RevOps vs. Rep), a text input for freeform questions, and a streaming response area.

**Say:**

> "Natural language analytics. Ask a question, get a chart. The guided prompts change based on your role. Ask 'Which messaging themes drive the most pipeline?' and it pulls from the live database, streams a response, and renders a chart inline."

**Do:** Click a guided prompt. Let the streaming response complete. Point out that it generates a chart when the data warrants one.

---

## Beat 6: Close

**Say:**

> "Outreach admits this gap exists — they don't do step-level attribution. I built the thing that fills it. A Python data pipeline that normalizes two sequencer schemas and a CRM into a unified attribution model. A Supabase database with 11 tables. A FastMCP server with six tools running on Railway. A Claude integration that diagnoses failure modes and generates contextual rewrites — not generic email tips. And a full-stack Next.js dashboard with three role-based views, streaming AI responses, and interactive charts. All synthetic data. All working. All deployed."

---

## Notes

- All data is synthetic — generated from reverse-engineered API schemas
- LLM features (Quick Actions, Org Intelligence, Ask Beacon, Regenerate) call Claude live — expect 2-5 second response times
- If a hiring manager wants to explore independently: the Sequences page has sortable tables, the Reps page has a leaderboard, and every flagged step opens the rewrite drawer
- MCP server is live at the Railway URL — mention it if the audience knows what MCP is
