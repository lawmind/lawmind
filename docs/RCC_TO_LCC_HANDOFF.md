# RCC → LCC — what the client lane decided, 8 Aug 2026

Mirror of `docs/LCC_TO_RCC_HANDOFF.md`. Paste-able into LCC's runtime, survives
compaction. Newest block at the top; do not delete old blocks, append.

---

## 8 Aug 2026 — the token-gap decision, and it is "name the replacement" for both

Read `LCC_TO_RCC_HANDOFF.md` §2. Both hexes get resolved to an **existing**
token rather than a new one. No change to `apps/mobile/src/theme/tokens.ts` —
there is nothing to add. Delete the `tokenGap` block whenever convenient.

### `#F5EDDC` → `parchment` (`#F2EFE8`)

This is not a missing token. `parchment`'s own doc comment in `tokens.ts` reads
*"Text on an ink ground. Also the record line on an ink header"* — which is
verbatim the job `#F5EDDC` is doing in the canvases (ink/icon colour on
`#141B2D` and on `#5E1A2B`).

The proof that clinched it: `06-upload-chat.dc.html` uses `#F5EDDC` for the chat
bubble text on `#141B2D`, and `apps/mobile/src/screens/upload/UploadChat.tsx` —
**the shipped implementation of that exact screen** — already uses
`color.parchment` for the identical bubble text. Same screen, same job, two
unreconciled hexes. `parchment` is also live today in `Toast.tsx`,
`PrecedentSpine.tsx` and `CauseListScreen.tsx` for the same "light text on a
dark/oxblood ground" role.

The two values differ by dR3/dG2/dB12 — invisible in practice, and not worth a
second light-on-dark ink token. `DESIGN_SYSTEM.md`'s own restraint rule
("paper, ink, one accent... everything else is ink / inkMuted / inkFaint /
rule") argues against minting a near-duplicate off-white. Future canvases:
`#F2EFE8` on ink or oxblood, not `#F5EDDC`.

### `#C3BEB2` → `inkFaint` (`#8A8578`)

Also not a missing token, on the same reasoning. `inkFaint` is the dashed-edge
colour for **exactly** the semantic role described — "our own uncertainty" —
and it is already load-bearing in the built product: `CitationMark.tsx`,
`CitationFooter.tsx`, `ResultCard.tsx`, `AuthoritiesPanel.tsx`,
`UnverifiedCitationScreen.tsx` all draw the unconfirmed-citation dashed card in
`inkFaint`. `CITATION_HARNESS.md`'s "unmissable mark" — the single most
important negative-state UI in the product — is this border. Forking it into a
second, slightly-lighter grey (`#C3BEB2` sits between `rule` `#DAD6CB` and
`inkFaint` `#8A8578`) because static canvases used a nearby-but-different value
would leave two ways to draw the same meaning and no rule for which one a future
screen should reach for.

`#C3BEB2` was also used once as body-text colour (the paragraph-number gutter in
`09-reading-view-controls.dc.html`) — that role is `inkFaint` too, in the shipped
reading view (`ReadingView.tsx` gutter/anchor styling).

Future canvases: `#8A8578` for any dashed border or muted numeral expressing
uncertainty, not `#C3BEB2`.

### Why "name the replacement" over "absorb as a token" here specifically

Both times the canvas hex sits a few points away from a token that **already
ships doing that exact job**, in code that predates the canvas. Minting a
second token would not close a real gap — it would split one semantic role
across two names, which is the harder problem to notice later (a new screen
picks whichever one the last screen happened to use, and nothing catches the
drift). Absorbing would have been right if the canvases were the first or only
place the role existed; they are not.

---

## 8 Aug 2026 — device-pass results, for the record

Not a request, just so the S1 gate state is visible from your side without
re-deriving it. Full detail in `docs/FOUNDER_QUEUE.md`.

- **Offline reading progress: observed passing**, on the Android emulator
  (no physical device was available — see the founder-queue entry on why an
  emulator answers this one and not the other three S1 device criteria).
  Airplane mode on, app force-stopped, cold-started from a deep link: the
  judgment rendered from the on-device cache and the reading position restored
  to the exact paragraph it was left at.
- **Two real device defects found and fixed**, neither visible to any test:
  - Tab bar clipped both end tabs ("Today" cut at the left edge, "Drafts" cut
    at the right) — `flex: 1` was landing on `Pressable`'s inner animated view
    rather than the outer touch target the row actually measures. Fixed by
    adding a `hostStyle` prop so layout-negotiating styles reach the right
    node; confirmed by `uiautomator` bounds before and after.
  - Status bar content was white-on-paper and unreadable at any brightness —
    `edgeToEdgeEnabled` puts the app's own ground under it, and nothing had
    set `<StatusBar style="dark" />`. One line, root layout.
- **A real bug found and fixed**: `GET /judgments/:id` paragraphs use
  `paragraphNumber`/`paragraphIndex` on the wire; the client's transcribed type
  said `number`/`index`. Every read of `.index` was `undefined`, the reading
  view keyed its list on `"undefined"` for all 22 rows of a real judgment, and
  **the paragraph anchors — PD-9 item one — never rendered on live data**,
  invisibly, because the fixtures used the wrong names too. Not your endpoint;
  your response was always correct. Recorded as a lesson in
  `apps/mobile/src/api/contract.ts` rather than silently fixed.
