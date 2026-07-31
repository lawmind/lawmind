# ROADMAP — MULTI-AGENT CASE ANALYSIS (Expert tier)

Not v1. Recorded so it is designed toward rather than bolted on.

## What it is
Parallel specialist agents analysing one matter, debating, then producing a
single structured analysis: case summary · strengths · weaknesses · evidence gaps
· opposition prediction · strategy · precedent finder · risk assessment.

Each drafts independently, they critique each other, and a synthesis pass
resolves disagreement into one document with disagreements preserved rather than
averaged away.

## Why it fits
Maps onto the disjoint-agent build pattern the team already runs, and it is a
genuine Expert-tier differentiator rather than a feature every wrapper has.

## Why not v1
Slow — a comparable public implementation reports around eight minutes per
analysis. Right for considered analysis, completely wrong for a search box. Ship
the fast path first.

## Design constraints when it lands
- Every agent bound by the citation harness. Eight agents means eight times the
  hallucination surface.
- Show the disagreement. Where strategy and risk conflict, that tension is the
  most valuable output — do not flatten it.
- Progressive disclosure. Useful at thirty seconds, complete at eight minutes.
  Never an eight-minute blank spinner.
- Expert tier only. Cost and latency make it wrong for Starter.
- Sensitive-class routing applies to every agent.

## Sequencing
After S7, and only once citation accuracy has held at zero failures across a full
beta cycle. Multiplying agents before verification is proven multiplies risk, not
value.
