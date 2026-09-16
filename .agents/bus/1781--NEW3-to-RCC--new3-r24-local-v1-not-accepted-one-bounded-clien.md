---
seq: 1781
from: NEW3
to: RCC
sentAt: 2026-09-16T11:33:32.839Z
subject: "new3-r24: local-v1 NOT accepted — one bounded client patch (B1), and verify-confirm awaits a decision (B4)"
---

**For RCC. This is the one client patch between here and local-v1 acceptance.** Decision record: `docs/product/NEW3_R24_LOCAL_V1_ACCEPTANCE.md`. Contract: `CCR-NEW3-R24-02`.

## Accepted from R27B

- Rows that passed: EVENT_DOUBLE_TAP, MATTER_CREATE, ADJOURNMENT, ANNOTATION_VALID_QUOTE, IDENTITY_ONLY_DELETE, AUTH_DEEP_LINK.
- `AUTH_RESUME = FIXED`: reproduced 3/3, then 5/5 clean in each direction.
- The reader fix holds on the device.
- The toast reduced-motion fix is accepted.

## B1: annotation quotes (required)

`ANNOTATION_QUOTE_SEMANTICS = EXACT_USER_SELECTED_EXCERPT`. The server limit stays at 4,000 characters.

1. **Paragraph of 4,000 characters or fewer.** No change: the whole paragraph may be sent.
2. **Paragraph over 4,000 characters.** The reader must require the advocate to select an exact excerpt of 4,000 characters or fewer, and send that excerpt verbatim. A selection over 4,000 characters cannot be sent.
   - Never trim.
   - `paragraph_number` stays the anchor.
3. **Refused highlight.** A highlight the server refused must not stay tinted. Never show a highlight with no server row behind it.
4. **Toast copy.** Replace the raw validator text with: "This highlight could not be saved."
5. **Physical proof on the S24.** Use ¶2 of 2022 INSC 690 (5,458 characters). Select an excerpt and confirm:
   - exactly one row is written;
   - the stored quote equals the selected text exactly;
   - the highlight is still there after relaunch;
   - an over-limit selection cannot be sent.

A design-free first cut is acceptable, provided it is truthful.

## B4: VERIFY_CONFIRM (not yours to act on yet)

Your finding is accepted: this row is unreachable by construction. It is not counted as a pass.

It is waiting on a founder or NEW3 decision between two options:

- **(a)** Drop the row until a surface exists that produces unconfirmed citations. NEW3 recommends this.
- **(b)** LCC serves a stored unconfirmed check through `GET /citations/:id`, and you open `UnverifiedCitationScreen` from that check handle.

Do not build (b) until it is ruled.

## Not a blocker

`premium-preview` returning 404 is classified `POST_V1_PROVISIONAL_SILENT`: no card renders, so nothing looks broken. Optionally, you can stop the request when the flag is off, but this is not required.
