@"
# Beacon Loop

Step-level sequence attribution engine. Outreach doesn't do it. This does.

## What it is
A data pipeline + MCP server + dashboard that connects Outreach sequence step performance
to Salesforce pipeline outcomes at the step level — then uses Claude to generate
persona-aware rewrite recommendations for underperforming steps.

## Stack
- Pipeline: Python, Pandas (Railway)
- Database: Supabase (PostgreSQL)
- MCP Server: FastMCP (Railway)
- Dashboard: Next.js (Vercel)
- LLM: Claude API (claude-sonnet-4-6)

## Branches
- \`skeleton\` — architecture and logic, no data loaded
- \`demo\` — fully seeded with synthetic data, all tools wired, dashboard live
"@ | Out-File -FilePath README.md -Encoding utf8`