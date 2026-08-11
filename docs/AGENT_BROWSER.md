# AGENT BROWSER — an agent that surfs the web as a logged-in user

Set up 11 August 2026 on the founder's ask: *"how we can give our agent a way to
log in and surf on the Internet like a real user so that you can log in and use
the Internet on a browser to access Bharat.Law, eCourts and other websites."*

**Verified working tonight, by observation, not by reading the help text.**

---

## 1 · WHAT IS INSTALLED

**`agent-browser@0.34.0`**, globally. The global `CLAUDE.md` §4 already mandates
it and already records that **Playwright is purged and must never be
reinstalled** — so this was not a new vendor, it was making an existing decision
real. It had never actually been installed.

```bash
npm install -g agent-browser        # done
agent-browser skills get core --full   # its own usage guide — read this first
```

---

## 2 · THE PATTERN THAT ANSWERS THE ASK — CDP, not a headless scraper

**The agent never sees a password.** A real browser is launched with a debugging
port, **the human logs in**, and the agent attaches to that already-authenticated
session. Cookies, storage and tokens are the browser's; the agent only drives it.

```bash
# 1 · launch a real browser with a debugging port, on a SEPARATE profile
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir="C:/Users/Xerxus/AppData/Local/Temp/claude/edge-agent-profile" \
  --no-first-run --no-default-browser-check "about:blank" &

# 2 · confirm the port is live
curl -s http://127.0.0.1:9222/json/version

# 3 · the founder logs in, by hand, in that window

# 4 · the agent attaches
agent-browser connect 9222
agent-browser open "https://judgments.ecourts.gov.in/"
agent-browser snapshot -i          # numbered @eN refs
agent-browser click @e12           # act on refs, re-snapshot after any change
agent-browser close --all
```

**Edge, not Chrome, because Chrome is not installed on this machine** — checked,
not assumed. Edge is Chromium and speaks the same CDP.

### Observed, 11 Aug 2026

```
$ agent-browser connect 9222
[agent-browser] launched browser ✓ Done
$ agent-browser open "https://judgments.ecourts.gov.in/"
✓ Home | Judgements and Orders, Supreme Court and High courts of India
  https://judgments.ecourts.gov.in/pdfsearch/index.php
```

**The live eCourts judgments portal loaded and returned its real title and URL.**

**One thing NOT yet verified, stated plainly:** `connect 9222` printed *"launched
browser"*, which may mean it started its own instance rather than attaching to
the one on port 9222. **Navigation works either way, but the whole point of this
setup — inheriting a logged-in session — depends on the attach semantics.**
Verify by logging into a site by hand in the port-9222 window and then asking the
agent to read a page only that session can see. Until that is done, treat
"inherits the founder's login" as **unverified**.

### A separate profile is deliberate

`--user-data-dir` points at a scratch profile, not the founder's daily browser.
An agent driving the same profile a human is using can log itself out, accept
dialogs meant for the human, or act on the wrong tab.

---

## 3 · WHAT THIS DOES **NOT** LICENSE

**This is a capability, not a permission.** Every rule that governed HTTP access
governs a browser identically, and a browser is easier to misuse because it looks
like a person.

| site | what still applies |
| --- | --- |
| **eCourts** | The registrar's grant runs to **January 2029** and covers **bulk cause-list harvesting**. CAPTCHA bypass is permitted **only** in `services/api/src/court/ecourts.ts`, **only** while the grant is unexpired. **Every request still writes the fetch ledger and still passes the rate limiter.** A browser session does neither by default — so **driving eCourts from a browser outside that module is outside the grant.** `CLAUDE.md` §6 |
| **Tier 3 verification** | **Unchanged and not negotiable.** Per-citation confirmation is a human solving the CAPTCHA and vouching. `citations/verify.ts` holds no HTTP client and a test asserts it. **A browser does not become that human.** Bulk resolution writes `verified_by_source = 'ecourts_bulk'`, never `'ecourts'` |
| **Bharat.Law** | Their AUP forbids **circumventing rate limits**, and `bharatlaw.ts` implements that: a 401/403 on any account **halts the entire pool**. A browser session bypassing the pool would be exactly the circumvention the code refuses. `AUTHORISATION` permits **benchmarking** and sets `extractionPermitted: false`. **FQ-BL1's written consent is still owed.** |
| **anywhere** | **Never circumvent an access control we have not been authorised to.** `CLAUDE.md` §6 |

**The rule this produces:** a browser may go where a logged-in human may go, at a
human's pace, under an authorisation that is written down. It is a way to *reach*
a site we are allowed to use — never a way to become allowed.

---

## 4 · WHERE IT IS GENUINELY USEFUL

1. **FQ-BL3's ₹0 first step.** Run *Kharak Singh* and *Danamma* through
   Bharat.Law's free tier and see whether their counter-authority is specific or
   vague. No account, no automation, no AUP exposure — a browser reading a public
   free-tier answer.
2. **eSCR (`digiscr.sci.gov.in`)** — official Supreme Court Reports back to 1950,
   **searchable by citation**, free. A citation→judgment lookup better than our
   4,097 hand-built aliases, and it is a form-driven site rather than an API.
3. **`judgments.ecourts.gov.in`** — free full-text search across SC and all High
   Courts, no login. Useful as a **verification cross-check** that is neither our
   corpus nor a paid vendor.
4. **Watching a competitor's product honestly.** §5b of `FEATURE_PARITY.md` could
   not settle whether Jhana ships an advocate-facing hearing feature because
   their billing page would not render plan detail to a plain fetch. **A browser
   renders it.**

---

## 5 · HOUSEKEEPING

**Close the browser when finished** — `CLAUDE.md` §4 is explicit, and a leaked
Chromium holds memory and a live authenticated session:

```bash
agent-browser close --all
taskkill //F //IM msedge.exe //T
```
