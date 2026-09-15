# The external account-deletion web resource — requirement, not implementation

**RCC R25, 2 September 2026.** `EXTERNAL_DELETE_WEB = BLOCKED_REPOSITORY_OWNER`.

Google Play's Data Safety form requires a **web URL** at which a user can request
deletion of their account and its data **without installing the app**. In-app
deletion is necessary and is not sufficient: the policy exists precisely for the
person who has already uninstalled.

The in-app half is done and proved. `/delete-account` works for both account
populations, including the `identity_only` account that has no profile, and RCC
R25 proved it against the real backend rather than a mock. What is missing is a
page on the public web, and this repository has nowhere to put one.

---

## 1 · Why this was not built in this round

`apps/` contains exactly two applications:

| path | what it is | public? |
| --- | --- | --- |
| `apps/mobile` | the Expo client, iOS + Android | it is an app, not a web surface |
| `apps/admin` | the Next.js staff console — 19 `sections/*` pages, all internal | no |

> **CORRECTION, 15 September 2026 (RCC R26). The premise of this section was
> wrong, and the specification below was not.** This document said `lawmind.co`
> "serves nothing". It serves a site. Observed, not inferred:
>
> ```
> lawmind/lawmind-site        on the org — Next.js 16 App Router, 12 routes
> https://lawmind.co          200, Vercel (bom1)
>                             <title>Lawmind — verified case law and hearing briefings…</title>
> https://lawmind.co/privacy  200   <title>Privacy · Lawmind</title>
> https://lawmind.co/terms    200
> https://lawmind.co/delete-account   404   <- the only thing missing
> ```
>
> So the blocker is **one route in a sibling repository**, not a missing website.
> Everything below about WHAT the page must say and must not say stands
> unchanged, `https://lawmind.co/privacy` is now a link that resolves rather than
> a plan, and `FOUNDER_QUEUE.md` FQ-SITE and
> `docs/product/WEBSITE_PRODUCT_SPEC_V1.md` §0 carry the same refuted claim and
> have not been edited by RCC — they are NEW3's and the website lane's.

There is **no official LawMind public web application in this repository**, which
remains true and is the reason nothing was built here. The stronger claim this
section used to make — that no LawMind public surface exists anywhere — came from
`docs/product/WEBSITE_PRODUCT_SPEC_V1.md` §0 and `FOUNDER_QUEUE.md` **FQ-SITE**,
*"no marketing site, no landing page, no public surface of any kind. `lawmind.co`
is verified with DNS written through the Spaceship API and serves nothing."*
**That was repeated through three documents and two rounds without anyone
spending the ten seconds a `curl` costs, and it is false.**

The round's instruction on this point was explicit and it was followed: **do not
invent a mobile-hosted HTML route to satisfy a store requirement about a
webpage.** A route inside the Expo app is not reachable by someone who does not
have the app, so it would satisfy the form and not the policy — which is worse
than an honest gap, because it would be a false answer on a compliance form.

`apps/admin` was considered and rejected. It is the staff console: putting a
public unauthenticated deletion page inside the admin origin would either expose
an internal surface to the internet or hide the public page behind staff auth.

---

## 2 · Where it must go

**`apps/site`** — the launch website, which `FQ-SITE` already specifies and
already assigns to this lane. NEW3's recommendation there is Next.js with static
export, on the ground that Next 14 is already in the repo for `apps/admin`, so
no new vendor and no new framework. Nothing about the deletion page changes that
recommendation, but it does change one thing: **the deletion page is the one page
on that site that cannot be a static export alone**, because it has to accept a
request and prove who is making it.

| requirement | value |
| --- | --- |
| repository | this one |
| path | `apps/site` |
| route | `/delete-account` |
| public URL | `https://lawmind.co/delete-account` |
| owner of the surface | RCC implements, NEW3 accepts — `FQ-SITE`'s existing split |
| blocking gate | Play Console Data Safety, and therefore any Play submission |

`lawmind.co` is the domain to use. `SubscriptionScreen.tsx` opens
`hello@lawmind.in` and verified outbound mail is `no-reply@lawmind.co` —
`FOUNDER_QUEUE.md` §3240 already carries that as an open inconsistency and it is
not resolved here. **A published deletion URL on one domain while the app names
the other is a compliance document that disagrees with the product**, so whoever
closes §3240 must close it before this URL is entered into Play Console.

---

## 3 · What the page must do

### 3.1 The flow

Open the page → prove you own the account → the existing erasure request is
submitted. Three steps, and the third one is **the deletion contract that already
exists**:

```
POST /me/data-requests   { kind: 'erasure' }     Idempotency-Key: <attempt key>
GET  /me/data-requests                            to show the acknowledged state
```

**Do not build a second deletion backend.** `services/api/src/auth/data-requests.ts`
resolves the caller from `authId`, writes one row per open request, and needs no
profile — LCC R26 made that true and RCC R25 proved it end to end. A parallel
path would be a second place for the erasure rules to drift.

### 3.2 Both account populations, and no profile requirement

The page must work for:

- **profile-backed** — an advocate who finished onboarding;
- **`identity_only`** — an authenticated account with **no `users` row**. This is
  a real account, not "no account": a verified email, a name on `auth_user`, and
  session artifacts keyed to the email.

**It must not require profile completion to delete.** Demanding more personal
data as the price of deleting personal data is the defect RCC reported at bus
1722 and LCC fixed at R26; reintroducing it on the web would reintroduce it.

`POST /me/data-requests` already carries `auth_id` as its NOT NULL principal with
`user_id` nullable, so nothing on the server is owed for this.

### 3.3 Verification — the part that must not be weakened

**A typed email address is not a deletion request.** The page must never let an
unverified visitor destroy an account by typing an address into a box.

Use the mechanism the product already has: **magic-link sign-in**
(`POST /auth/request-link` → `POST /auth/verify`), which is the same proof of
ownership the app uses and needs no new credential type, no password and no new
security surface. The user submits an address, receives a link, and lands back on
`/delete-account` **authenticated**; the erasure request is submitted from there
with a real bearer token.

Two constraints on the wording of that first step:

- **Do not disclose whether an address has an account.** The response to
  "send me a link" is identical either way — the app's own sign-in already
  behaves this way, and the deletion page must not become the account-existence
  oracle the sign-in refuses to be.
- **Use the existing rate limiting and anti-abuse path.** An unauthenticated
  endpoint that sends email is the obvious thing to abuse.

Nothing weaker than this should be shipped merely because Play would accept it.
Play accepts a form; an advocate whose account was deleted by someone who guessed
their email address does not.

### 3.4 Copy

The page must state, in its own words and without inventing anything:

1. **What it is** — delete your LawMind account. Branded LawMind, about deleting
   a LawMind account, and not a general help article.
2. **What initiating deletion does** — it queues an erasure request against the
   account and the data associated with it. The in-app screen's existing
   breakdown is the source: matters, drafts, saved searches, alerts and
   citation-copy records, and the name, phone, email and bar enrolment number on
   the account.
3. **What it does not remove**, because the app already says so and the web page
   may not say less: shared-matter authority records and upheld citation disputes
   survive with the name replaced by an anonymous marker, and uploaded documents
   in file storage cannot be promised gone from every copy immediately.
4. **That it is a request, not an instant deletion.** The server answers
   `status: 'received'` with a `dueAt`, and an operator completes it. Copy that
   says "your account has been deleted" would be false at the moment it is read.
5. **Where the privacy policy is** — `https://lawmind.co/privacy`, which
   `WEBSITE_PRODUCT_SPEC_V1.md` §2 page 7 already specifies.

**Invent no retention period.** The server sends a real `dueAt` on the real
request; render that, and say nothing about durations that no document in this
repository states.

---

## 4 · One correction to the website spec, for NEW3

`WEBSITE_PRODUCT_SPEC_V1.md` §2 specifies a seven-page IA, and §4.5 puts account
deletion inside `/support` — *"`/support` must answer: how do I delete my account
and my data (a real route exists — `/me/data-requests`)"*.

**As specified, that does not satisfy the Play requirement.** A support page that
explains how to delete an account from inside the app is an FAQ, and the policy
is about the person who no longer has the app. `/delete-account` has to be its
own reachable route that *initiates* the request, and `/support` should link to
it rather than describe it.

This is a change to a NEW3-owned document, so this lane has not made it. It is
one row in the IA table and one sentence in §4.5.

---

## 5 · Status

```
PUBLIC_WEB_PRESENT                    = YES  (lawmind/lawmind-site, live at lawmind.co)
PUBLIC_WEB_IN_THIS_REPOSITORY         = NO   (and it should not be)
EXTERNAL_DELETE_WEB                   = BLOCKED_OTHER_REPOSITORY   (was: BLOCKED_REPOSITORY_OWNER)
EXTERNAL_DELETE_ROUTE                 = /delete-account   (specified, 404 today)
PLAY_ACCOUNT_DELETION_URL             = https://lawmind.co/delete-account
EXTERNAL_DELETE_APP_REQUIRED          = NO   (by design of this specification)
PLAY_CONSOLE_EDITED                   = NO   (out of scope this round)
OWNER                                 = NEW3 / website lane (bus 1753, bus 1767)
```

**Nothing about the in-app path is blocked by this.** In-app deletion works for
both populations and is proved against the real backend
(`apps/mobile/e2e/identity-delete.e2e.test.tsx`). What is blocked is the external
URL, and — corrected 15 September 2026 — it is blocked on **one route in
`lawmind/lawmind-site`**, a repository this lane does not own, rather than on a
website that does not exist.
