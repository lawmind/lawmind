# RCC Sprint-2 contract change requests

These are client-blocking facts found while consuming contract 1 at R12. RCC
does not infer the missing values and does not patch the server from `apps/**`.

## CCR-RCC-S2-01 — platform-specific party-name capability

- Endpoint/artifact: `GET /release/capabilities` and the versioned v1 capability registry.
- Missing field/state: a per-platform state for `search.party_name_only`, including an explicit iOS state and user-safe reason/remedies. The frozen R12 product row is global and `DISABLED_NOT_READY`; the runtime registry has no dedicated party row.
- Safe RCC behavior without it: preserve CNR, citation, case-number and full-case-title lookup; do not invent an iOS-only permanent rule or weaken Android/web based on `Platform.OS` alone.
- Severity: P0 for the requested iOS kill-switch acceptance path.
- Affected screen/action: Search query entry and its case-first party-name state.
- User-truth risk: a client-local guess could silently disable working lookup on one platform, or present a broad-query refusal as though no case matched.

## CCR-RCC-S2-02 — exact treatment on saved Matter authorities

- Endpoint: `GET /matters/:matterId/authorities` (and the authority returned by `POST /matters/:matterId/authorities`).
- Missing field/state: `precedentialEffect` for the exact relationship, plus `canAddToMatter` if the route can return an authority whose coarse banner is `set_aside` but whose original decision remains addable. The frozen Matter authority shape carries only the coarse four-value status and the later judgment title.
- Safe RCC behavior without it: keep the moved-law warning, render `Later judgment: <title>`, and never infer set-aside, overruling or doubt from the coarse banner.
- Severity: P0 truthful legal copy; P1 action correctness if an already-saved row later gains an add/re-add action.
- Affected screen/action: Matter → Saved authorities treatment line.
- User-truth risk: proposition-level overruling was previously rendered as the legally different “Set aside in”.

## CCR-RCC-S2-03 — magic-link public origin

- Endpoint: `POST /auth/magic-link` and the URL embedded in the delivered email.
- Missing field/state: a deployment-controlled public auth origin/callback which resolves to the active API/app handoff. The R12 local console transport observed `https://api-production-1c0b4.up.railway.app/api/auth/magic-link/verify?...`, a retired host.
- Safe RCC behavior without it: release builds fail closed without an explicit API URL and reject the retired host; the client cannot rewrite a link already emitted by the server.
- Severity: P0 launch blocker for real email sign-in.
- Affected screen/action: Sign in → open magic link → `lawmind://auth/verify` callback.
- User-truth risk: the UI reports that a link was sent, but the link opens a dead endpoint before the client callback can run.
- Existing LCC handoff: `.agents/bus/1558--RCC-to-LCC--the-magic-link-email-still-points-at-the-dead-ra.md`.

## CCR-RCC-S2-04 — treatment enum source/contract drift

- Endpoints: treatment-bearing Search, Judgment, and Briefing responses.
- Missing field/state: the current server source contains an `evidence_defect` precedential-effect value which is absent from the frozen seven-value R12 client contract.
- Safe RCC behavior without it: unknown values never select a specific relationship verb and fall back to neutral later-judgment copy; the frozen enum is not widened from server source alone.
- Severity: P1 contract drift.
- Affected screen/action: treatment wording and any add-to-matter policy derived from exact effect.
- User-truth risk: treating an unknown value as set-aside would overstate the verified relationship; treating it as `none` would suppress a safety state.
