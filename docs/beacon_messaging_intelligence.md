# Beacon Messaging Intelligence — Rewrite Engine Knowledge Base
**Version:** 1.0  
**Source:** Deep research synthesis across 4 reports covering 85M+ emails, 90K+ calls, 12 methodologies, 12 personas, 12 verticals, 10 timing contexts, 10 failure modes  
**Purpose:** Foundational knowledge layer for `get_rewrite_suggestion` and all Beacon platform LLM rewrite logic

---

## Part 1: The Invariant Rules — Apply to Every Rewrite, No Exceptions

These are the constants derived from data consensus across billions of analyzed emails. They override methodology, persona, and vertical guidance. Every rewrite must pass all of these before any contextual optimization is applied.

| Rule | Threshold | Source |
|------|-----------|--------|
| Email length | Hard flag >100 words; soft flag >75 words | Gong 28M+, Lavender, Instantly 2026 |
| Subject line length | Flag >7 words; optimal is 2 words | Lavender, Gong 85M+ |
| Reading level | Flag above 6th grade; target 3rd–5th grade = 67% more replies | Lavender |
| CTA count | Exactly one per email; flag any email with >1 ask | Gong 304K study, Mixmax |
| I/We ratio | Flag if >40% of sentences start with "I" or "We" | Lavender, Gong |
| Opening line | Flag any email opening with sender's name, company, or role | Lavender, Coleman, Braun |
| Personalization | Flag any "personalized" element not connected to a business challenge | Lavender, Allred |
| Follow-up freshness | Flag any follow-up that doesn't introduce new angle, data, or resource | Cegelski, Farrokh |
| Social proof specificity | Flag vague claims ("hundreds of companies"); require named company + specific metric | Gong, Bay |
| Mobile formatting | Flag single-block paragraphs >2 sentences; require whitespace | Lavender (8× mobile open rate) |

---

## Part 2: Failure Mode Detection Framework

Given a step's open rate, reply rate, and copy — this is how the rewrite engine diagnoses *why* before prescribing *what*.

### Failure Mode 1: Feature-Led Opening
**Data signal:** Reply rate low, open rate acceptable (email opened but ignored)  
**Copy signal:** Opening sentence subject is "We" or "Our"; bullet points of features/capabilities; buzzword clusters ("AI-powered," "scalable," "platform," "cutting-edge"); fixed pitch block after personalized opener  
**Rewrite direction:** Problem Prompter — open with observation about prospect's world → peer company faced X → status quo → new perspective → soft CTA. Replace every buzzword with a specific quantified outcome.

### Failure Mode 2: Fake Personalization
**Data signal:** Reply rate far below personalization benchmark (genuine personalization = 50–250% lift; fake = zero lift); campaign size >1,000 recipients with <3% reply  
**Copy signal:** Compliment disconnected from pitch ("Congrats on the funding!"); vague observations applicable to anyone; {{first_name}}/{{company}} as only personalization; no observable connection between personal opener and the problem being raised  
**Rewrite direction:** Observation → Challenge framework. Every personalized element must connect to a likely business challenge. One strong specific signal beats three vague ones. Sources: LinkedIn activity, hiring patterns, BuiltWith, G2 reviews, CEO commentary.

### Failure Mode 3: Wrong Persona Targeting
**Data signal:** All KPIs degrade simultaneously; open rate <15%; A/B testing different copy yields uniformly poor results  
**Copy signal:** Pain points belong to a different role; technical jargon to business buyer or ROI language to engineer; pitch could be sent unchanged to any title at the company; problems the recipient doesn't own  
**Rewrite direction:** Rebuild from persona profile — recalibrate pain language, tone, seniority register, and CTA to the actual recipient's role. Apply the gut check: "Could this message be sent to 10,000 other people? If yes, rewrite it."

### Failure Mode 4: CTA Overload
**Data signal:** Low meeting-book rate even from positive replies; confused or non-committal responses  
**Copy signal:** More than one question in the email; multiple links; "or" constructions presenting choices; asks that require more than one decision  
**Rewrite direction:** Compress to single softest-appropriate CTA for the sequence stage. First touch: interest check question. Follow-up 2+: soft ask. Late stage: direct meeting ask. Remove all secondary links and questions.

### Failure Mode 5: Too Long / Too Dense
**Data signal:** Reply rate well below benchmark; high mobile non-response rate  
**Copy signal:** Word count >100; single-block paragraphs; sentence complexity above 6th grade; information density requires active reading rather than scanning  
**Rewrite direction:** Compress to 25–75 words for first touch. Break into 2–3 paragraphs of 1–2 sentences each. Cut every sentence that doesn't advance the one message. Rewrite for 5th grade reading level.

### Failure Mode 6: Too Vague / Too Safe
**Data signal:** Open rate fine; reply rate near zero; no emotional or intellectual reaction from prospect  
**Copy signal:** No specific claim made; no tension or challenge to current thinking; language applicable to any company in any industry; avoids any assertion that could be wrong or disputed  
**Rewrite direction:** Inject a Challenger-style commercial insight — a specific data point, a counterintuitive observation, or a peer benchmark that creates constructive tension. Something specific enough to be wrong for some readers is specific enough to be right for others.

### Failure Mode 7: Methodology Mismatch
**Data signal:** Reply rate poor despite copy quality; pattern visible when persona × methodology combination is analyzed  
**Copy signal:** Challenger reframe directed at risk-averse CFO in cost-cutting mode; Sandler negative reverse sent to an IC who needs hand-holding; aggressive urgency tactics sent to an empathy-driven HR buyer; fear-based security messaging (FUD) sent to a sophisticated CISO  
**Rewrite direction:** Apply the methodology decision tree (Part 3) to select the correct framework for the persona × deal complexity × sequence stage combination. Rebuild structure accordingly.

### Failure Mode 8: Buying Stage Mismatch
**Data signal:** Reply rate poor even with relevant personas; meeting book rate low from positive replies  
**Copy signal:** Solution-stage messaging (demo request, pricing, features) directed at problem-unaware prospects; same message regardless of prior engagement history; no adaptation to buyer's awareness level  
**Rewrite direction:** For unaware buyers: insight-led, create a knowledge gap. For problem-aware: validation and cost-of-inaction framing. For solution-aware: differentiation and social proof. Recalibrate CTA to match awareness level.

### Failure Mode 9: Breakup Email Without Tension
**Data signal:** Final-step reply rate near zero; no psychological consequence to ignoring  
**Copy signal:** No real consequence stated; soft language ("I'll stop reaching out"); no call to action that requires a decision; tone indistinguishable from prior follow-ups  
**Rewrite direction:** Apply Sandler "going for the no" — explicitly state this is the last outreach, give permission to say no, create a genuine decision point. Best performing breakup structure: acknowledge lack of response → assume it's not a priority → explicitly close the file → leave door open without begging.

### Failure Mode 10: Subject-Body Misalignment
**Data signal:** High open rate but very low reply rate (subject got click; body lost them immediately)  
**Copy signal:** Subject line creates expectations body doesn't fulfill; clickbait subject with consultative body; salesy subject with problem-led body  
**Rewrite direction:** Decision — if body is strong, rewrite subject to match using Lavender's "to-do list item" / "internal camouflage" format. If subject got strong opens, rewrite body to deliver on the subject's implied promise.

---

## Part 3: Methodology Decision Tree

Select the primary methodology (and optional secondary) based on persona × deal complexity × sequence stage.

### Primary Methodology Selection Matrix

| Persona Tier | Deal Type | Sequence Stage | Primary Method | Secondary |
|---|---|---|---|---|
| C-suite (CEO, CRO, CFO, CISO) | Enterprise / Complex | First touch | Challenger | MEDDPICC |
| C-suite | Mid-market | First touch | Challenger | Command of the Message |
| C-suite | SMB | First touch | SNAP | Gap Selling |
| VP / Director | Enterprise | First touch | Challenger | Value Selling |
| VP / Director | Mid-market | First touch | Gap Selling | Challenger |
| VP / Director | Any | Follow-up | Science of Selling | — |
| Manager / IC | Any deal type | First touch | SPIN (problem hypothesis) | Sandler |
| Manager / IC | Any | Follow-up | Sandler (negative reverse) | — |
| RevOps / GTM Ops | Any | Any | Value Selling + MEDDPICC | — |
| CISO / Security | Enterprise | Any | MEDDPICC + Challenger | — |
| CFO / Finance | Any | Any | Science of Selling + Value Selling | — |
| HR / People Ops | Any | Any | Consultative / SPIN | — |
| Procurement | Any | Any | Consultative transparency | — |
| Technical (CTO, Eng) | Any | First touch | Content-led / SNAP | — |

### Sequence Stage Modifiers

**First touch:** Lead with the insight or problem hypothesis. Never pitch the product. CTA = interest check only.  
**Follow-up 1–2:** New angle, new evidence. Apply Sandler negative reverse if no response. Begin layering social proof.  
**Follow-up 3–4:** Rational drowning (cost of inaction). Peer benchmarks. Sharper CTA.  
**Breakup:** Sandler "going for the no." Genuine consequence. Last door open without begging.

### Methodology × Buyer Psychology Map

| Buyer Psychology | Best Methods | Worst Methods |
|---|---|---|
| Analytical (CFO, RevOps) | Science of Selling, Value Selling | Emotional appeals, vague claims |
| Authority-driven (VP Sales, Director) | Challenger, Command of the Message | Passive Sandler, relationship-builder framing |
| Autonomy-driven (CTO, CISO) | Content-led, SNAP, Challenger | Urgency tactics, FUD, cold calls |
| Risk-averse (Legal, Procurement, CFO cost-cutting) | Consultative transparency, Value Selling | Challenger disruption, Sandler reverse |
| Empathy-driven (HR, Customer Success) | Consultative, SPIN | Aggressive urgency, feature-led |
| Status/peer-driven (CEO, CRO) | Challenger (peer benchmarking), Predictable Revenue referral path | Generic templates, IC-level framing |

---

## Part 4: Rewrite Direction Taxonomy

Named strategies an AI rewrite engine selects from. Each is mutually exclusive in primary application; they can layer.

| Direction Name | When to Apply | What Changes |
|---|---|---|
| **Problem Flip** | Feature-led opening | Rewrite to open with prospect's observable problem, not seller's product |
| **Compression** | >100 words or dense paragraphs | Cut to 25–75 words; 1–2 sentence paragraphs; 5th grade reading level |
| **Challenger Reframe** | No insight, no tension, vague messaging | Insert commercial teaching insight — specific data point that challenges current thinking |
| **Sandler Reverse** | Follow-ups with no response; breakup step | Apply negative reverse framing; "going for the no"; permission to disengage |
| **Persona Recalibration** | Wrong tone/register for recipient seniority | Rebuild pain language, tone, and CTA for actual persona tier |
| **CTA Simplification** | Multiple asks, decision paralysis | Reduce to single softest-appropriate CTA for stage |
| **Social Proof Injection** | Vague claims, skeptical persona, no credibility markers | Add named company + specific metric + relevant to prospect's context |
| **Stage Realignment** | Solution pitch to unaware buyer | Shift to insight-led (unaware), validation (problem-aware), or differentiation (solution-aware) |
| **Subject Alignment** | High open / low reply mismatch | Rewrite subject to match body using "internal camouflage" format OR rewrite body to deliver on subject promise |
| **Personalization Repair** | Decorative personalization disconnected from pitch | Reconnect observation to business challenge via Observation → Challenge framework |
| **Breakup Sharpening** | Weak final-step with no tension | Apply Sandler breakup structure — state consequence, give permission to say no, close file |
| **Methodology Swap** | Framework mismatched to persona/deal | Rebuild structure per decision tree selection |
| **Vertical Pain Injection** | Generic pain language not specific to industry | Replace with vertical-specific pain language, compliance references, or industry benchmarks |
| **Timing Pivot** | Ignores buyer's current calendar context | Reframe angle, urgency, and hook for buyer's active timing context (EoQ, new exec, post-funding, etc.) |
| **Follow-up Fresh Angle** | "Just checking in" or repetitive bump | Replace with new data point, case study, or problem angle; new subject line; no reference to prior bump |

---

## Part 5: Persona Quick Reference

Minimum viable configuration for the rewrite engine per persona. Full detail in source research.

### C-Suite Personas

**CEO / Founder (SMB/Mid-market)**  
- Cares about: revenue growth, competitive moat, team efficiency, existential risk  
- Email length: ≤75 words  
- Tone: Peer-to-peer, direct, no fluff  
- Best method: Challenger (insight-led), referral path (Predictable Revenue)  
- Subject line: 2–3 words, neutral, "internal camouflage"  
- CTA: Soft question, never calendar link on first touch  
- Avoid: Feature lists, ROI calculators, anything that reads like a vendor pitch

**CFO / Finance Buyer**  
- Cares about: cost reduction, risk mitigation, ROI, budget control, compliance  
- Email length: 75–125 words  
- Tone: Formal, data-driven, numbers in subject line work  
- Best method: Science of Selling, Value Selling  
- Subject line: Include a number; neutral  
- CTA: Specific ROI conversation ask  
- Avoid: Vague claims, emotional appeals, "innovative" / "cutting-edge" language

**CRO / VP Sales**  
- Cares about: quota attainment, pipeline coverage, rep ramp time, forecast accuracy  
- Email length: 75–125 words  
- Tone: Peer-to-peer, metrics-driven, urgency-aware  
- Best method: Challenger (peer benchmarking), Gap Selling  
- Subject line: Pain-specific, short  
- CTA: Hard ask acceptable after social proof established  
- Avoid: Long explanations, feature walkthroughs, academic framing

**CISO / Security Buyer**  
- Cares about: MTTD, MTTR, false positives, compliance (HIPAA, PCI DSS, SOC 2, NIS2), analyst burnout, attack surface  
- Email length: 50–100 words  
- Tone: Technical, peer-level, zero FUD  
- Best method: MEDDPICC + Challenger  
- Subject line: Operational metric focus  
- CTA: Resource offer, not meeting request on first touch  
- Avoid: "Next-gen," "AI-powered," cold calls, FUD, generic "security posture" language  
- Entry point: SOC Manager / Director of SecOps is the accessible champion

**CMO / VP Marketing**  
- Cares about: pipeline contribution, brand, campaign performance, attribution  
- Email length: 75–125 words  
- Tone: Strategic, creative, outcome-focused  
- Best method: Challenger, Gap Selling  
- Subject line: Business outcome or strategic pain  
- CTA: Strategic conversation, not product demo  
- Avoid: Tactical/operational framing, technical jargon

**CTO / VP Engineering**  
- Cares about: system reliability, developer velocity, technical debt, scalability, security  
- Email length: ≤150 words  
- Tone: Technical, peer-level, plain text only  
- Best method: Content-led, SNAP  
- Subject line: Technical problem or integration-specific  
- CTA: Technical resource offer, architectural conversation  
- Avoid: Business jargon, ROI-first framing, HTML emails

### Mid-Level Personas

**VP / Director (any function)**  
- Cares about: team performance, budget, cross-functional alignment, career impact  
- Email length: 75–125 words  
- Tone: Professional, peer-aware, outcome-focused  
- Best method: Challenger, Value Selling  
- CTA: Peer benchmark conversation, low-commitment ask

**RevOps / GTM Ops**  
- Cares about: data integrity, system integration, process efficiency, attribution, tooling ROI  
- Email length: 75–150 words  
- Tone: Technical-operational, no-nonsense  
- Best method: Value Selling + MEDDPICC  
- CTA: Operational impact conversation, free audit/assessment  
- Avoid: Sales-y language; they recognize and reject it immediately

**Manager / Team Lead**  
- Cares about: team output, day-to-day friction reduction, hitting targets  
- Email length: 75–125 words  
- Tone: Empathetic, practical, direct  
- Best method: Gap Selling, SPIN  
- CTA: Problem-validation question

**HR / People Ops**  
- Cares about: retention, time-to-hire, compliance, employee experience, DEI, culture  
- Email length: 75–125 words  
- Tone: Warm, empathetic, professional — not transactional  
- Best method: Consultative / SPIN  
- CTA: Resource offer, free playbook, non-committal  
- Avoid: Aggressive urgency, cost-only framing, "I noticed you're hiring" without insight tie

**Individual Contributor / End User**  
- Cares about: daily friction, making their job easier, not getting in trouble  
- Email length: 50–100 words  
- Tone: Casual, direct, peer-level  
- Best method: SNAP (Simple, iNvaluable, Aligned, Priority)  
- CTA: Free resource, not a meeting  
- Avoid: Business outcomes framing, C-suite language

**Procurement / Legal**  
- Cares about: risk mitigation, compliance, cost, contract terms, vendor management  
- Email length: 50–100 words  
- Tone: Professional, transparent, consultative  
- Best method: Consultative transparency  
- CTA: Offer to send compliance docs, pricing comparison, SOC 2 report  
- Avoid: Cold calls (do not call), manipulation tactics, repeated follow-ups to no-reply, "Seller 101" moves  
- Note: Engage proactively at qualified stage, not proposal stage

---

## Part 6: Industry Vertical Cheat Sheet

### Methodology × Vertical Fit

| Vertical | Primary Method | Secondary | Entry Point | Sequence Length |
|---|---|---|---|---|
| Security SaaS | MEDDPICC + Challenger | — | SOC Manager / Dir SecOps | 10-touch, 21-day |
| DevTools | PLG-Assisted / Content-led | SNAP | IC / Engineer | 8-touch, 14-day |
| FinTech | MEDDPICC | Value Selling | VP Finance / Compliance | 10-12 touch, 30-day |
| HR Tech | Consultative / SPIN | — | CHRO (new hire) | 8-touch, 21-day |
| RevOps / Sales Tech | Value Selling + MEDDPICC | Challenger | RevOps Lead / VP Sales | 8-10 touch, 21-day |
| MarTech | Challenger | Gap Selling | VP Marketing | 8-touch, 21-day |
| LegalTech | Consultative / MEDDPICC | — | General Counsel | 8-touch, 30-day |
| HealthTech | MEDDPICC | Consultative | VP Operations | 10-touch, 30-day |
| Data / Analytics | Gap Selling | Value Selling | VP Data / Analytics Lead | 8-touch, 21-day |
| E-commerce | Gap Selling | SNAP | VP Ops / Head of Growth | 7-touch, 14-day |
| Real Estate Tech | Consultative / SPIN | — | Broker-Owner / VP Ops | 8-touch, 21-day |
| EdTech | Consultative | SPIN | VP Curriculum / IT Director | 8-touch, 30-day |

### Vertical Pain Language Index

**Security SaaS:** Alert fatigue, false positives, MTTD/MTTR, SOC burnout, attack surface expansion, compliance deadlines (SOC 2, NIS2, DORA, PCI DSS, HIPAA), analyst hours wasted, breach cost quantification  
**Avoid:** "Next-gen," "AI-powered," "best-in-class," generic "security posture," FUD without context

**DevTools:** Developer velocity, deployment frequency, incident MTTR, on-call burden, tech debt, build times, context switching, DX scores  
**Avoid:** ROI-first framing, business jargon, HTML emails, cold calls to engineers

**FinTech:** Regulatory compliance (SOX, PCI, Basel III, GDPR), fraud detection, transaction speed, reconciliation overhead, audit trail, chargeback rates  
**Avoid:** Buzzwords, vague innovation claims, non-specific ROI language

**HR Tech:** Time-to-hire, quality of hire, turnover cost ($100K+ per sales rep), onboarding completion, compliance deadlines, DEI metrics, Glassdoor score, employee NPS  
**Avoid:** Cost-only framing, aggressive urgency, treating HR as transactional

**RevOps / Sales Tech:** Lead-to-account matching, routing logic, pipeline accuracy, forecast variance, rep ramp time, attribution gaps, CRM data quality, tool consolidation  
**Avoid:** Sales-y language; this persona recognizes and rejects it immediately

---

## Part 7: Buyer Calendar Timing Reference

### Timing Context → Messaging Pivot

| Timing Context | Buyer State | Angle That Works | Avoid | CTA Adjustment |
|---|---|---|---|---|
| End of fiscal quarter | Urgency to hit number; distracted | "Use remaining budget before it expires" · end-of-quarter ROI framing | Long evaluations, complex commitments | Ultra-short: "Worth a 15-min call this week?" |
| New fiscal year | Planning mode; receptive to new tools | "Teams planning [goal] are starting this now" | Rushing to close — they have time | Longer evaluation OK; planning conversation |
| Post-funding (Series A/B/C) | Expanding; building; hiring | Reference growth challenges: "Teams scaling from X to Y typically hit [problem]" | Hollow congratulations without insight | Planning and scaling conversation |
| Post-layoff / cost-cutting | Risk-averse; budget scrutiny | Efficiency, consolidation, cost reduction, doing more with less | Expansion framing, premium positioning | ROI conversation; "reduce cost by X" |
| Post-acquisition | Uncertain; integration stress | Acknowledge change; offer stability/integration support | Challenging assumptions about their new direction | Low-commitment, empathetic ask |
| New executive hire | First 90 days; agenda-setting; most receptive | "In your first 90 days, most [role] leaders prioritize [X]" | Assuming they know the existing stack | Vision/priority alignment conversation |
| Product launch | Momentum; growth focus | Reference launch; scale challenges post-launch | Making it about you; generic congratulations | "Curious if that resonates?" — soft |
| Conference season (pre) | Exploration mode; scheduling | "Making the most of limited time at [conference]" | Pitching; hard asks | "Open to connecting?" |
| Conference season (post) | Buried in follow-up; sorting signal from noise | Hyper-specific personal detail from actual conversation | Badge-scan blast; generic "great to meet you" | Send within 24–48 hours; reference specific detail |
| Summer slowdown | Lower volume; more bandwidth | Q4 preparation framing; casual tone; lighter emails | Manufacturing urgency; high-commitment asks | Multiple response modes; "virtual coffee?" |
| End of calendar year | Compressed timeline; high intent when reply | "Sign now, implement in January" · budget expiry · micro-calls only | Standard sequences; 45-min demo requests; 12-page proposals | 2-word CTA; mobile-scannable 2-page Decision Brief |

---

## Part 8: Sequence Architecture Reference

### Optimal Sequence Structure by Deal Type

| Deal Type | Step Count | Email Steps | Phone Steps | LinkedIn Steps | Duration |
|---|---|---|---|---|---|
| SMB | 7–8 | 4–5 | 2 | 1–2 | 14–21 days |
| Mid-market | 10–12 | 4–5 | 3–4 | 2–3 | 21–30 days |
| Enterprise | 12–15 | 4–6 | 4–5 | 3–4 | 30–45 days |

**Channel sequence pattern (all deal types):** Email → LinkedIn connection → Email → Phone → LinkedIn message → Email → Phone → Email (breakup)

**Day spacing:** Steps 1–3: every 2 days. Steps 4–6: every 3 days. Steps 7+: every 4–5 days. Summer: extend all spacing by 1–2 days.

**Reply distribution:** 93% of all replies arrive by Day 10. First follow-up adds up to 49% more replies over first touch alone. Email steps beyond 5–6 produce sharply declining returns; extend via phone and LinkedIn, not more email.

**Multichannel multiplier:** Email + LinkedIn + Phone = 287% higher engagement than email-only. Initiating with a cold call doubles email reply rate. Leaving a voicemail doubles likelihood of email reply.

### CTA by Sequence Stage

| Stage | CTA Type | Example |
|---|---|---|
| First touch | Interest check question | "Is this on your radar for this quarter?" |
| Follow-up 1 | New angle + soft question | "Curious if you're seeing the same challenge." |
| Follow-up 2 | Social proof + soft ask | "Worth 15 minutes to compare notes?" |
| Follow-up 3 | Cost of inaction + direct ask | "Happy to share what [Peer] did — open to it?" |
| Follow-up 4+ | Sandler negative reverse | "Should I assume this isn't a priority?" |
| Breakup | Going for the no | "I'll close your file — feel free to reach back if the timing changes." |

**Never on first touch:** Calendar link, pricing reference, product demo request, multiple questions, proposal offer

---

## Part 9: Performance Benchmarks — What "Good" Looks Like

Use these to calibrate which steps need rewrite attention and how severe the underperformance is.

| Metric | Average | Good | Excellent | Flag Threshold |
|---|---|---|---|---|
| Email open rate | 27–32% | 35–45% | 50%+ | <20% = deliverability or subject problem |
| Email reply rate | 3–5% | 5–10% | 10–15%+ | <3% = copy or targeting problem |
| Positive reply rate | 1.5–3% | 3–5% | 5%+ | <1.5% = methodology or persona mismatch |
| Meeting book rate | 0.5–1% | 1–2% | 2%+ | <0.5% = CTA or qualification problem |
| Sequence step reply (step 1) | 8.4% per Belkins | — | — | <5% = first touch copy problem |
| Bounce rate | <3% | <2% | <1% | >3% = list quality problem |
| Spam complaint rate | <0.3% | <0.1% | 0% | >0.3% = Google hard violation |

**Relative underperformance triggers:**  
- Step performing >40% below sequence average → flag for rewrite  
- Step performing >60% below top performer equivalent → flag as critical  
- Follow-up reply rate higher than first touch → first touch is the problem  
- Open rate fine, reply rate low → body copy problem (not subject line)  
- Open rate low, reply rate acceptable from opens → subject line problem

---

## Part 10: Minimum Viable Context for a High-Quality Rewrite

The rewrite engine needs these inputs to produce methodology-grounded, persona-aware suggestions. Missing inputs degrade output quality in the order listed.

**Tier 1 — Required (output quality degrades severely without these):**
1. Step copy (current email or script text)
2. Persona — recipient title / function / seniority
3. Sequence stage — first touch, follow-up N, or breakup
4. Performance data — open rate and reply rate for this step

**Tier 2 — High value (significantly improves rewrite direction):**
5. Industry vertical
6. Deal type — SMB, mid-market, or enterprise
7. Detected failure mode(s) from diagnostic
8. Top performer variant for same step (if available)

**Tier 3 — Enhances contextual relevance:**
9. Buyer calendar context — timing trigger if known
10. Prior steps in sequence — what angles have already been used
11. Persona-specific pain language preferences by vertical

**Minimum viable output structure for `get_rewrite_suggestion`:**
1. **Diagnosis** — which failure mode(s) detected and why (data signal + copy signal)
2. **Methodology selection** — which framework governs the rewrite and why
3. **Rewrite direction(s) selected** — from the taxonomy in Part 4
4. **Rewritten copy** — applying all invariant rules + methodology + persona calibration
5. **What changed and why** — diff-style explanation of every major change made

---

*This document is the knowledge layer for Beacon Loop's `get_rewrite_suggestion` tool and the broader Beacon platform rewrite capabilities. It should be embedded in the system prompt for all rewrite-related LLM calls. Update as new research or performance data becomes available.*
