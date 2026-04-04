# Beacon Loop

**Outreach admits it doesn't do step-level attribution. Beacon Loop does.**

---

## The Problem

Every B2B sales org runs outbound sequences. Most have 5–8 steps. When a prospect books a meeting after Step 4, the sequence gets credit — but which step actually drove the conversion? Was it the pain-point opener in Step 1, the case study in Step 3, or the breakup email that created urgency?

Outreach and Salesloft report sequence-level metrics. They don't attribute pipeline outcomes to individual steps, don't diagnose *why* a step underperforms, and don't tell you what to write instead. The result: SDR managers coach on gut feel, RevOps reports on vanity metrics, and reps copy-paste the same templates that stopped working two quarters ago.

Beacon Loop closes this gap with three capabilities:
1. **Step-level attribution** — maps each sequence step to pipeline outcomes via Salesforce opportunity data
2. **Claude-powered rewrites** — diagnoses failure modes (wrong tone, missing CTA, generic value prop) and generates persona-aware alternatives
3. **Ask Beacon** — natural language analytics with streaming responses and auto-generated charts

## Live Demo

**Dashboard:** [https://beacon-loop.vercel.app](https://beacon-loop.vercel.app)

All data is synthetic. No real company data is used anywhere.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Outreach API  │     │  Salesloft API   │     │  Salesforce API  │
│  (synthetic)    │     │  (synthetic)     │     │  (DOOM Inc org)  │
└────────┬────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                       │                         │
         └───────────┬───────────┘                         │
                     ▼                                     ▼
        ┌────────────────────────┐            ┌────────────────────┐
        │   Python Pipeline      │            │  Salesforce Loader │
        │   (Pandas, Railway)    │◄───────────┤  (contact → opp)   │
        │                        │            └────────────────────┘
        │  • Normalize events    │
        │  • Classify themes     │
        │  • Attribution model   │
        │  • Flag underperformers│
        └───────────┬────────────┘
                    │
                    ▼
        ┌────────────────────────┐
        │   Supabase (Postgres)  │
        │                        │
        │  step_touchpoints      │
        │  step_performance      │
        │  step_attribution      │
        │  rewrite_suggestions   │
        │  persona_configs       │
        └──────┬─────────┬───────┘
               │         │
       ┌───────┘         └────────┐
       ▼                          ▼
┌──────────────┐      ┌───────────────────┐
│  Next.js     │      │  FastMCP Server   │
│  Dashboard   │      │  (Railway, SSE)   │
│  (Vercel)    │      │                   │
│              │      │  6 tools:         │
│  • Overview  │      │  • sequence_health│
│  • Insights  │      │  • step_breakdown │
│  • Reps      │      │  • underperformers│
│  • Sequences │      │  • get_rewrite    │
│  • Compare   │      │  • compare_seqs   │
│  • Ask Beacon│      │  • get_step_copy  │
└──────┬───────┘      └───────────────────┘
       │
       ▼
┌──────────────┐
│  Claude API  │
│  (sonnet)    │
│              │
│  • Rewrites  │
│  • Ask Beacon│
│  • Org Intel │
└──────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Data pipeline | Python, Pandas |
| Database | Supabase (PostgreSQL) |
| LLM | Claude API (claude-sonnet-4-6) |
| MCP server | FastMCP, SSE transport |
| Dashboard | Next.js 16, TypeScript, Tailwind CSS |
| Charts | Recharts |
| Pipeline hosting | Railway |
| Dashboard hosting | Vercel |

## What This Demonstrates

- **Data pipeline construction.** Ingests from two sequencer schemas (Outreach, Salesloft) and a CRM (Salesforce), normalizes into a unified event model, and runs a multi-signal attribution model that maps step-level activity to pipeline outcomes.

- **API schema modeling with synthetic data.** Reverse-engineered Outreach and Salesloft API schemas to generate realistic synthetic datasets with consistent join keys, deterministic seeding for reproducibility, and unseeded randomness for behavioral realism.

- **LLM integration that's contextual, not generic.** Rewrite suggestions use a three-stage pipeline (pre-classifier → failure mode diagnosis → persona-aware generation) grounded in a 34KB messaging intelligence knowledge base. Ask Beacon queries are grounded in live database context, not generic prompts.

- **MCP server architecture.** Six tools exposed via FastMCP with SSE transport on Railway — callable by any MCP-compatible client (Claude Desktop, Cursor, etc.) for programmatic access to attribution data and rewrites.

- **Full-stack delivery.** End-to-end from data generation through pipeline processing, database design, API routes, and a role-based dashboard with three personas (Manager, RevOps, Rep), streaming AI responses, and interactive charts.

## Dashboard Views

| View | What it shows |
|---|---|
| **Overview** | Role-based homepage — KPI cards, quick actions (live LLM), coaching queue (Manager) or messaging attribution + org intelligence (RevOps) |
| **Insights** | Flagged underperforming steps grouped by sequence, with severity indicators, filters, and an embedded Ask Beacon panel |
| **Reps** | Rep roster with performance metrics, click-through to individual rep detail with flagged steps |
| **Sequences** | All sequences with health indicators, reply rates, pipeline value — click into step-level breakdown |
| **Compare** | Side-by-side sequence comparison with step-level metric diffs |

---

*Built by Henry Marble. All data is synthetic — generated from reverse-engineered API schemas, not from any production system.*
