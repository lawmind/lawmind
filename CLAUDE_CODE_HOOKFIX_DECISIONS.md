# CLAUDE CODE — HOOK FIX AND THREE DECISIONS

---

## 1 — FIX THE HOOKS. THEY HAVE NEVER FIRED.

The config uses a **relative path**: `bash .claude/hooks/reanchor.sh`.

Per the Claude Code hooks reference, handlers "run in the current directory with
Claude Code's environment," and `${CLAUDE_PROJECT_DIR}` exists precisely to
reference scripts "relative to the project root, regardless of the working
directory when the hook runs."

`~/Documents` is itself a git repo with `lawmind` nested inside it. If Claude Code
launches from `~/Documents`, or the working directory changes mid-session, the
relative path resolves to nothing and the hook fails silently.

There is also a known upstream bug — UserPromptSubmit hooks not firing when Claude
Code is started from a subdirectory (anthropics/claude-code issues #8810, #10367)
— which makes the absolute-path form doubly necessary.

### Rewrite `.claude/settings.json`

Use **exec form** (`args` present) with the path placeholder. The docs recommend
exec form for any hook referencing a path placeholder, because each `args` element
is passed as one argument with no shell tokenization.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/reanchor.sh",
            "args": [],
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start.sh",
            "args": [],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Note the explicit `timeout`. UserPromptSubmit defaults to 30 seconds, and a hook
that times out has its output discarded silently — the prompt proceeds without the
context. Ten seconds is generous for a `cat`.

### Rewrite both scripts to emit JSON

Plain stdout works and appears as visible hook output in the transcript.
`additionalContext` is better: it "is injected as a system reminder that Claude
reads without a visible transcript entry" — the core still lands, without adding
noise to every turn.

`reanchor.sh` should emit:

```json
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"<the core block>"}}
```

`session-start.sh` the same with `"hookEventName":"SessionStart"`.

Build the JSON with `jq -n --arg` so quotes, backslashes and newlines in the core
text escape correctly. Do not hand-assemble the string. If `jq` is not installed,
install it — the docs note hook examples depend on it being on `PATH`.

Two constraints to respect: output is capped at 10,000 characters, and the docs
advise writing the text "as factual statements rather than imperative system
instructions," because text framed as out-of-band system commands can trigger
prompt-injection defences. Our core is already written that way; keep it that way.

Both scripts must `exit 0`. **Exit 2 on UserPromptSubmit blocks the prompt and
erases it** — a bug there would be far worse than a missing hook.

### Verify — do not assume

1. `chmod +x` both scripts, confirm 755.
2. Pipe a fake payload in and confirm valid JSON on stdout:
   `echo '{"prompt":"test"}' | .claude/hooks/reanchor.sh | jq .`
3. Run `/hooks`. It is a read-only browser showing every configured hook and which
   settings file it came from. Confirm both appear under **Project Settings**.
4. Submit a prompt and confirm the core actually arrives.

Report what `/hooks` shows. If it shows nothing, the settings file is not being
loaded at all and that is a different problem.

---

## 2 — DECISION: §9c verification names

**The design doc moves. The contract is frozen and correct.**

`verified_internal / verified_external / verified_human` reads as one enum and
drops `failed`. The contract is three independent fields, and `CLAUDE.md` is
explicit that this is never one enum. You were right not to touch it.

But there is a simpler resolution than renaming. **After the silence pass, the
design does not need verified sub-states at all in list UI.** Verified renders
nothing. Only `unverified` and `overruled` render.

So §9c should describe two rendered states and reference the contract fields for
everything else:

- List and card UI: render only when `verification_state = unverified`, or when
  `overruled_status != none`
- `failed` renders identically to `unverified` — the user cannot act on the
  difference, and an outage should not read as a corpus gap
- The three verified sources appear only in two places: the on-tap detail, and the
  admin citation monitor. Both key off `verified_by_source`
  (`corpus | public_x2 | ecourts | none`)

Do not edit `design/screens/IMPLEMENTATION.md` — that is a design deliverable. Add
this reconciliation to `design/DESIGN_SYSTEM.md` and flag §9c for correction in the
next design pass.

---

## 3 — DECISION: §9d six new features

**Approved. They are deliberate scope, not design drift.**

Daily cause list, adjournment capture, client WhatsApp share, limitation
calculator, bare-acts reader, fee log. These are the Tier B daily loop from the
scope revision. You were right to stop and ask — `PRODUCT_BRIEF.md` said to, and
the instruction worked.

Update `PRODUCT_BRIEF.md`: the product is **four core features plus the daily
loop**. The framing to record, because it drives sequencing:

> The four features are what the product does. The daily loop is why an advocate
> opens it every morning. Tier B ships before Tier A — the loop creates the habit;
> the library only prevents a feature-comparison loss.

**On the performance budget** — adjournment capture "under four seconds from lock
screen to saved, on a Redmi-class device with no signal." Record it as a **target
to measure at S3**, not a gate now. You cannot verify it without the device, and a
gate nobody can evaluate is worse than an honest target. Add it to
`docs/FAILURE_MODES.md` as something to measure, with the device class named.

---

## 4 — DECISION: `design/DESIGN_SYSTEM.md` is stale

Update it. It is the stated source of truth and it still describes the retired
`NOT CONFIRMED` chip and the five-badge family.

Bring it to: silence-on-verified, two rendered exception states, the reframed copy
("Safe to file" / "Do not file this without checking it"), amber reserved
exclusively for law-has-moved, and gilt at its two placements.

You were right not to touch it unasked.

---

## 5 — PONYTAIL: take the route cut

**Take it.** 87 route files, 522 lines, six lines each differing by one number,
replaced by a dynamic `[slug].tsx` reading the manifest. −512 lines, keeps the
404-on-unknown-slug property.

"Every file becomes a real screen later" is not a reason to keep them. When a
screen becomes real, extract it from the dynamic route — that is a two-minute
operation, and until then 87 near-identical files are 87 places to drift.

This is exactly what ponytail is for. Take the cut.

**Also take:** the two byte-identical render pairs (34≡45, 35≡47, ~670KB).

**Decide and act on NativeWind:** 0 uses and +1.2MB. Either the app uses it or it
comes out. Zero uses at S0 means it comes out — re-add it the moment a screen
needs it. Note it in `docs/OSS_STACK.md` either way.

**On the cut you reversed** — uninstalling `react-native-svg` when it survived only
as a transitive peer of `lucide-react-native` was a real bug, and catching it
before it shipped was the right call. That is the failure mode ponytail warns
about, and the reversal was correct. Record the lesson in `.ai/04-coding-standards.md`:
**a package with no direct import may still be a declared peer. Check
`peerDependencies` before removing anything.**

---

## 6 — AFFIRMED

Not importing `uploads/` was right — a stale 3.3K `DESIGN_SYSTEM.md` sitting beside
the authoritative 21.3K one is a trap someone eventually falls into.

Re-applying the `v1-` rename was right, and the fact that `DESIGN_SYSTEM.md`
predicted it would need re-applying is the system working.

Routing launch assets as `surface: 'asset'` with no route was right. An App Store
screenshot with an app route is a dead route wearing a real one's clothes.

---

## 7 — THEN

Re-run the checker. Run both hooks and paste the actual output. Report what
`/hooks` shows.

Do not scaffold further. S0 continues in its own session.
