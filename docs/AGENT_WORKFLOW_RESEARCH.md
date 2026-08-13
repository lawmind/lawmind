# AGENT WORKFLOW RESEARCH — hooks/skills/patterns for the five-lane ring

**NEW3, 13 Aug 2026, per the founder's direct request: research external
skills/workflows/hooks that could improve how the five agents in this
project work.** This is meta — about the agents' own tooling, not legal
data. Every recommendation below is tied to a **real, already-observed
pain point in this repo's own bus history**, not a generic "hooks are
useful" survey. Nothing here was implemented — `scripts/**` and hook
config are LCC's territory (`docs/LANE_PROTOCOL.md`), this is a
researched, evidenced handoff, the same discipline this lane applies to
every acquisition recommendation.

---

## 1 · A MECHANICAL LANE-BOUNDARY GUARD — the single highest-value finding

**The exact failure this project is structurally exposed to has already
been measured, in public, by someone else running the same shape of
system.** `github.com/anthropics/claude-code` issue #76727 describes
**heavy users running many independently-launched Claude Code sessions
against one shared repository** — precisely this project's five-lane
setup (`docs/LANE_PROTOCOL.md` §1: *"One working tree, five sessions."*).
The reporter measured **15-20 concurrent sessions over 30 days** and found
**6,075 writes (44%) went to the primary checkout when they should not
have** — not malice, just sessions losing track of their own boundary
under load.

**This project's current defence is a social contract, not a mechanical
one:** `LANE_PROTOCOL.md` says *"write only inside yours... do not revert
what you did not write"* — a rule agents are asked to remember, not one
anything enforces. That is exactly the gap the GitHub issue's data
measures.

**The critical design lesson from that issue, worth getting right the
first time:** *"Guards must key on write TARGET PATH, not session's
cwd."* A naive hook checking *where the session is sitting* produces false
positives (a session can legitimately write outside its own directory)
and false negatives (a session sitting in the right place can still write
to the wrong file). **The hook has to inspect the file path an Edit/Write
call is about to touch, compare it against that lane's declared prefix
(`services/**`/`packages/**`/`docs/**`/`scripts/**` for LCC,
`apps/**` for RCC, etc. — already written down in `LANE_PROTOCOL.md`'s own
table), and only then decide.**

**Also worth carrying over — a specific, measured UX finding, not a
guess:** *"denial with prescriptive guidance works better than bare
denials"* — a hook that returns `{"permissionDecision":"deny", "message":
"this path belongs to RCC, not LCC — see LANE_PROTOCOL.md"}` let the
reporter's agent **self-correct without further prompting**, versus a bare
deny that just left the agent stuck. If this is ever built, the message
text is not a cosmetic detail — it is most of the value.

**One real caveat from the same issue, worth knowing before anyone
builds this:** the reporter also found **silent enforcement failures** —
subagent permission denials not surfacing to the parent, subagent hook
payloads carrying the *parent's* `session_id` (breaking any session-keyed
lock registry), and malformed hook output being silently ignored rather
than failing closed. **A lane-boundary hook that fails silently is worse
than no hook** — it would look enforced and not be. Anyone building this
should test it against a deliberately-malformed write first, the same
discipline `check-alert-coverage.mjs`/`check-amber-reservation.mjs` were
built and then verified to actually run (`docs/CURRENT_PLAN.md` Q1.11).

---

## 2 · A SHARED RESOURCE LOCK FOR INFERX — mechanising a rule that already exists in words

**This project has already measured the exact failure mode a published
pattern exists to prevent.** `docs/ai/DEEPSEEK_DATA_MOAT.md` §1: *"running
multiple processes against the free pool makes the capacity problem
measurably worse — three simultaneous processes hit 429 far more than
one."* `LANE_PROTOCOL.md` §5's current answer is a **social one**: *"ONE
heavy caller at a time. Announce on the bus before a large batch."* That
depends on every session remembering to check the bus first, every time,
under whatever pressure it's already under.

**A concrete, lightweight, well-documented pattern exists for exactly
this** (found via a March 2026 write-up on multi-agent rate-limit
coordination): two small JSON files, `rate-pool.json` (remaining quota,
per-agent soft reservations) and `rate-state.json` (a traffic-light zone —
green/amber/red — plus circuit-breaker state), both under ordinary POSIX
file locking on the shared filesystem this project already uses for the
bus (`.agents/bus/`). Before a heavy call: acquire the lock, read the
zone, proceed/delay/park depending on zone and priority. After a call:
update actual consumption from the response, recalculate the zone,
release. **A background sweep reclaims quota from crashed/stale agents via
a heartbeat file**, so a session that dies mid-batch doesn't permanently
starve the pool for everyone else — directly relevant given this
project's own worker-death history (LCC: *"Two workers died today from
[proxy timeout / OFFSET-against-a-hot-table]"*, `bus 0131`).

**Why this fits this repo specifically, not just in the abstract:** the
mechanism is the same shape as the bus itself (`.agents/bus/.lane-*`
files, one per session, already git-ignored, already the pattern this
project reaches for first — `LANE_PROTOCOL.md` §4's own reasoning:
*"the filesystem is therefore already a bus, and the cheapest correct
answer is to use it"*). This would be an extension of an idiom already
proven here, not a new one. **Same limitation as the bus has, worth
stating plainly**: this is a single-machine pattern (Windows, one working
tree, per this project's own environment) — it does not generalize to
agents on different machines, which this project does not currently have
anyway.

**What already exists here that this would sit on top of, not replace:**
the Supreme Today harvester's AIMD pacing engine
(`services/ingest/src/harvest/pace.ts`) already solves the single-caller
version of this problem for one external vendor. The gap is specifically
the **shared, multi-lane** case — InferX, and the DB proxy under
concurrent load — where more than one of the five lanes can independently
decide to start something heavy at the same time.

---

## 3 · WHAT NOT TO IMPORT — things that looked relevant and are not, checked rather than assumed

- **HiveMind (arXiv 2604.17111)** — an OS-inspired scheduler (admission
  control, AIMD backpressure, token budgets, priority queues) for
  concurrent LLM agent workloads. **The AIMD half of this is already
  built here** (the harvest pacer). The rest (formal admission control,
  priority queuing across many agents) is scoped for fleets far larger
  than five lanes — worth knowing the concept exists, not worth adopting
  wholesale.
- **git worktrees**, the standard fix the GitHub issue and multiple other
  sources recommend for cross-session collision. **Already considered and
  deliberately deferred here** — `docs/FOUNDER_QUEUE.md`: *"Worktree
  separation needs a coordinated switch, not a unilateral one"*, both
  lanes actively committing to the same tree at the time it was raised.
  The external research doesn't change that calculus, it just confirms
  the underlying risk being deferred is a real, independently-documented
  one — worth knowing precisely what's being traded off, not a reason to
  revisit the decision.
- **Message-queue-based coordination** (instead of file locks), cited as
  scaling better for "large agent fleets." **Not relevant at five lanes**
  — the search result's own framing is for fleets where lock contention
  itself becomes the bottleneck, which is not this project's shape.

---

## 4 · ANTHROPIC'S OWN MULTI-AGENT LESSONS — mostly already applied here, one gap worth naming

Anthropic's own account of building their multi-agent research system
(the architecture behind Claude's Research feature) surfaces failure
modes this project has independently already avoided or hit:

- **"Spawning 50 subagents for simple queries, agents distracting each
  other with excessive updates"** — this project's `LANE_PROTOCOL.md` §3
  already has the matching rule: *"Do not send routine progress... the
  other lane can read from the database."* Already correct.
- **"Token usage explains ~80% of performance variance"** and **"parallel
  tool calls cut research time by 90%"** — both point toward this
  project's existing preference for checkpointed, resumable, parallel
  workers over sequential single-threaded passes, which is already the
  house style (`RING_PROGRAM.md`'s drift-mode rules, `LANE_PROTOCOL.md`
  §4's checkpointing rule).
- **The one gap**: Anthropic's lead-researcher pattern *waits* for all
  subagents to finish before proceeding, which they note as a real
  trade-off (simplicity over speed). This project's ring is closer to a
  **pipeline** (NEW3→NEW2→LCC→NEW1→NEW3) than a fan-out/fan-in, so this
  trade-off doesn't directly apply — noted for completeness, not acted
  on.

---

## 5 · RECOMMENDATION, NOT A DECISION

Both §1 and §2 are **LCC's to build or decline** — `scripts/**` and hook
configuration are explicitly LCC's territory, not this lane's. Filed here,
pushed to the bus, and left there. If either lands, the specific,
measured caveats above (target-path keying not cwd-keying; silent-failure
testing; single-machine-only scope) are the parts most likely to matter
if skipped.
