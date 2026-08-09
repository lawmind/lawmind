# LAWMIND — TERMS AND CONDITIONS

**Document version:** `2026-08-09`
**Effective from:** [FOUNDER — date of publication]
**Supersedes:** nothing. This is the first long-form publication of these terms.

> **STATUS: DRAFT FOR COUNSEL REVIEW. NOT YET PUBLISHED, NOT YET BINDING.**
>
> Every clause below is written from what this repository actually records —
> `PRODUCT_BRIEF.md`, `PRODUCT_DECISIONS.md` (PD-1…PD-14), `docs/OPEN_DECISIONS.md`
> (OD-2, OD-3, OD-10), `docs/CITATION_HARNESS.md`, `docs/PRIVACY_PII.md` and
> `services/api/src/auth/account.ts`. Nothing here describes a feature we do not
> have, a guarantee we cannot keep, or a fee we have not settled.
>
> Items marked **[FOUNDER — …]** are facts only the founder or counsel can supply.
> They are listed together in `docs/FOUNDER_QUEUE.md`. **Publishing this document
> with any placeholder still in it would be worse than not publishing it.**
>
> **The in-app consent text is a separate, shorter artefact.**
> `services/api/src/auth/account.ts` holds `CURRENT_TERMS_VERSION = '2026-08-07'`
> and a plain-language summary. That summary must be updated to reference this
> document, and its version bumped to match, **before launch** — see §3.3 and the
> founder-queue entry. Bumping it forces every existing account to re-accept,
> which is the intended behaviour, not a side effect.

---

## 1 · Who we are, and what this document governs

**1.1** `lawmind.co` and the Lawmind mobile applications for iOS and Android
(bundle identifier `co.lawmind.app`) are operated by **Helmor Private Limited**, a
company incorporated in India under the Companies Act, 2013, having its registered
office at [FOUNDER — full registered office address, Gwalior, Madhya Pradesh] and
CIN [FOUNDER — CIN]. In this document Helmor Private Limited is referred to as
**"Helmor"**, **"we"**, **"us"** or **"our"**, and the product is referred to as
**"Lawmind"**.

**1.2** **"You"**, **"your"** or **"the Subscriber"** means the individual
advocate who registers for and uses Lawmind. Where you register on behalf of a
chamber, firm or employer, "you" means both you personally and that entity, and
clause 5.4 applies.

**1.3** **"the Services"** means everything Lawmind provides to a registered
account, whether paid or unpaid — search, briefings, drafting, the matter
workspace, the daily-practice screens, and anything we add later. Unlike some
legal-research services, **Lawmind has no free public tier**: there is no part of
Lawmind that is usable without an account, and the corpus of judgments is not
published by us for open access. Where these terms distinguish paid features, they
refer to a **"Subscription"** on one of the plans in §8.

**1.4** These terms, together with the **Privacy Policy** [FOUNDER — publish at
`lawmind.co/privacy`; substance already recorded in `docs/PRIVACY_PII.md`] and the
**training-consent notice** described in §11.6, form the entire agreement between
you and Helmor in relation to Lawmind. They replace any prior understanding,
including anything said in a demonstration, a sales conversation, or a beta
programme.

---

## 2 · What Lawmind is, and what it is not — read this clause first

**2.1 Lawmind is a research and drafting instrument for licensed practitioners.**
It assists an advocate who is already qualified to do the work. It does not
practise law, it does not advise, and it is not a substitute for your own
professional judgment.

**2.2 Lawmind does not provide legal advice to anyone.** Nothing it produces is
advice to you, and nothing it produces may be passed to your client as advice
originating from us. If you share Lawmind output with a client — including through
the client-update feature in §7.7 — you are giving your advice, on your
responsibility, under your name.

**2.3 Lawmind is not available to the general public as a legal-help service.** It
is offered to practising advocates. We do not accept instructions, we do not form
an advocate–client relationship with you or with anyone you act for, and no
communication with us is privileged.

**2.4 Your duty to the court is yours and is not delegable.** You remain fully
responsible for every authority you cite, every date you rely on, every
computation you act on, and every document you file. **Verify before filing.** This
is the single most important obligation in this agreement and no other clause
qualifies it.

**2.5 We are not a party to your matters.** We do not know your case, we cannot see
what you have not given us, and we will never be in a position to tell you that
something is missing.

---

## 3 · Acceptance, and how your acceptance is recorded

**3.1** By registering for, accessing or using Lawmind you accept these terms in
full. If you do not accept them, do not register and do not use the Services.

**3.2** Acceptance is taken **once, explicitly, at onboarding** — not by implication
from continued browsing. You are shown the consent text and you must actively
accept it. We record the **date and time of acceptance and the exact version of the
terms accepted** against your account.

**3.3 Versioned acceptance, and re-acceptance on change.** We record *which text*
you agreed to, not merely *that* you agreed. When the substance of these terms
changes we issue a new version, and **you are asked to accept the new version
before you continue to use the Services.** We do not treat silence as acceptance of
amended terms, and we do not rely on a clause obliging you to keep re-reading this
page. A version you have not been shown does not bind you.

**3.4** We will give reasonable advance notice of a change that materially reduces
what you receive or increases what you pay, by email to your registered address or
by in-app notice, and in the case of a price change on the notice period in §8.6.

**3.5 Correction of the surviving fiction in older consent flows.** Some services
in this market treat registration as an *"irrevocable waiver of any claim that you
did not read, understand, or agree"* to their terms. **We do not adopt that
clause.** It is not enforceable against a consumer in any form we would want to
rely on, and it is inconsistent with recording versioned consent at all. What we
rely on is the record in §3.2: you were shown a specific text and you accepted it.

---

## 4 · Eligibility

**4.1** You must be at least 18 years of age and legally capable of entering into a
contract under the Indian Contract Act, 1872.

**4.2** Lawmind is designed for advocates enrolled with a State Bar Council in
India. **Enrolment is captured and never gates access** (PD-2). If you provide your
Bar Council enrolment number we store it and mark it for manual review. A pending,
absent or rejected enrolment does not restrict your account in any way. We record
it because Lawmind is positioned as a tool for licensed practitioners, not as a
security control, and it is not a representation by us that you are enrolled.

**4.3** You are responsible for ensuring that your use of Lawmind complies with the
Advocates Act, 1961, the Bar Council of India Rules, and any professional-conduct
obligation that binds you. Where a rule of professional conduct and a feature of
Lawmind conflict, the rule governs and you must not use the feature.

---

## 5 · Your account

**5.1 Sign-in.** Access is by email magic link and, where enabled, by one-time
password sent to a phone number you supply (PD-1). We do not require you to set a
password, which removes an entire class of credential compromise — but it makes the
**security of your email inbox and your device the security of your Lawmind
account.**

**5.2** You agree to take reasonable care to protect access to the inbox and device
associated with your account, and to **notify us promptly** at [FOUNDER — security
contact address] of any known, suspected or anticipated compromise. We will act on
such a notice; we cannot act on one we never receive.

**5.3 No account sharing.** We grant you a limited, non-exclusive,
non-transferable, revocable right to access the Services. **An account is for one
named advocate.** You may not share access with a colleague, a junior, a clerk or
anyone else, and you may not permit access on a rota. Where two or more advocates
need access, that is the **Firm** plan (§8.2) and per-matter sharing (§7.6), both of
which exist precisely so that account sharing is never necessary. We may enforce
this by any reasonable means, including suspension or termination.

**5.4 Authority where you are employed or in a chamber.** If you register in
connection with employment, a partnership, or a chamber arrangement, you warrant
that you are authorised to enter into this agreement and to disclose to Lawmind the
material you upload. Where the material relates to a client of your employer or
your chamber, you warrant that you have whatever consent or authority that
relationship requires.

**5.5** You are responsible for all activity under your account.

---

## 6 · The Services — what we actually provide

This clause describes the Services as they exist. Features are added and withdrawn;
where a described feature is withdrawn, §8.6 and §14 govern.

**6.1 Court decision search with server-verified citations.** A plain-language or
Hindi query returns judgments with title, citation, court, date, a short statement
of the holding and the operative paragraph. **Every citation is put through the
verification process in §7 before it is shown to you.**

**6.2 The 24-hour hearing briefing.** Where a matter in your workspace is listed for
hearing, we prepare a briefing the night before: where the matter stands, what is
pending, authorities on the live issue, and a preparation checklist. It is delivered
by push notification and is readable offline.

**6.3 Drafting in English and Hindi.** Structured input produces a court-format
draft which you edit at paragraph level and export to `.docx` or PDF.

**6.4 The matter workspace.** Per-matter history: drafts, research, briefings,
notes and a hearing timeline.

**6.5 The daily-practice screens.** A daily cause list, adjournment capture, a
client update you can share, a limitation calculator, a bare-acts reader, and a fee
and appearance log.

**6.6 Editing is at paragraph level and citations are locked** (PD-7). You may edit
the text of a paragraph. You may not free-type over a citation, because a
hand-edited citation would break the verification chain while continuing to appear
verified. To change a citation, use the citation picker, which re-verifies. This is
a deliberate restriction and not a limitation we intend to remove.

**6.7 Exported documents carry no watermark** (PD-8). A single line identifying the
document as AI-assisted is written into the export metadata, and a citation summary
appears in the draft footer while the draft is in the app. The exported file itself
is unmarked, because a watermark on a court filing is both patronising to a
professional and a disadvantage at the filing counter. **This is exactly why the
consent in §3 is taken explicitly**: the absence of a mark on the document rests on
your having accepted, in terms, that the document is AI-assisted and that verifying
it before filing is your duty.

---

## 7 · Citations, verification, and the limits of each — the core of this agreement

**7.1 The rule we operate under.** No citation is shown to you without going
through verification. The model is never permitted to produce a citation from its
own memory; it may reference only judgment identifiers handed to it in retrieved
context, and every field you see — case title, citation, court, date — is rendered
from our database record of the judgment, not from what the model wrote.

**7.2 Verification is layered.** A citation is confirmed against our own corpus,
or against two independent public sources that agree, or against the eCourts record
where a human has personally confirmed it. Some citations are resolved against a
court registry in bulk; that is recorded distinctly from a human confirmation and is
weighted lower, because a machine may not carry a human's assurance.

**7.3 An unconfirmed citation is shown to you, marked, and never silently
dropped.** Where no layer can confirm a reference, Lawmind displays it in an
explicit **unconfirmed** state which says, in substance, *we found this reference
and could not confirm it exists*. **We do not delete it and we do not present it as
confirmed.** If you rely on a reference in that state without checking it yourself,
you do so entirely at your own risk.

**7.4 Verification answers whether a judgment exists. It does not answer whether
the judgment is still good law.** These are separate questions from separate
sources, and **a judgment can be both correctly verified and no longer good law at
the same time.** Where our records show that a judgment has been set aside, partly
set aside, or doubted, Lawmind displays that status on every surface where the
judgment appears, and reads it afresh each time rather than relying on a cached
value.

**7.5 What verification does not do, stated plainly.** Verification confirms that a
judgment exists, that its identifying particulars are as displayed, and — where our
records reach it — its subsequent history. **It does not confirm that the judgment
supports the proposition for which it is offered, that it is the best or the most
recent authority, that it binds your court, or that it has not been distinguished
on facts closer to yours.** Those are questions of legal judgment. They are yours.

**7.6 Sharing within a matter** (PD-3, PD-4). Matters are shared per matter, by
invitation to a named colleague. Notes are private to their author by default and
are shared only when you choose to share them. **We do not publish your notes,
drafts or research to other subscribers or to the public, and we operate no
directory in which your name, photograph, location or practice details are exposed
to other users.** Some legal-research services reserve exactly that right. **We do
not, and we will not introduce one without asking you separately.**

**7.7 The client update.** Where you send a client update from Lawmind, the
recipient is not a user of ours and has agreed to nothing with us. **You decide what
is in it and you are responsible for the disclosure.** Ensure it contains nothing
privileged or confidential that the recipient should not have.

---

## 8 · Subscriptions, payment and refunds

**8.1 Plans and prices** (PD-13). The subscription plans are:

| Plan | Price | Unit |
| --- | --- | --- |
| **Practice** | ₹799 per month | One advocate, starting out |
| **Chamber** | ₹1,999 per month | One advocate, full practice |
| **Expert** | ₹3,499 per month | One advocate, heavy volume |
| **Firm** | On application | 5–10 advocates, shared matters |

[FOUNDER — confirm whether the listed prices are inclusive or exclusive of GST, and
state Helmor's GSTIN. This must be settled before publication; an ambiguous
inclusive/exclusive price is a consumer-law problem, not a presentation problem.]

**8.2 How you pay depends on the plan** (OD-3). Practice, Chamber and Expert are
purchased **inside the iOS or Android app through Apple's or Google's billing
system**. Firm is **not** available for purchase in the app: it is quoted on
application and invoiced directly, and access is activated by a redemption code.

**8.3 App-store subscriptions renew automatically.** A subscription bought through
Apple or Google renews automatically at the end of each billing period unless you
cancel at least 24 hours before the period ends. **You manage and cancel it in your
Apple ID or Google Play account settings, not in Lawmind, and not by writing to
us** — we have no ability to cancel a store subscription on your behalf.

**8.4 Refunds on app-store subscriptions are handled by the store, not by us.**
Apple and Google operate their own refund policies and their own decision process,
and a refund granted or refused there is their decision. If you believe a refund is
owed, raise it with Apple or Google. We will assist with information where we can,
but we cannot process, override or guarantee a store refund.

> **This clause deliberately does not copy the "full refund within 48 hours by
> email" promise used by directly-billed services.** We cannot make that promise for
> money we never receive directly. Offering it would be a term we are structurally
> unable to perform.

**8.5 Refunds on directly-invoiced Firm subscriptions.** Where you are invoiced
directly, [FOUNDER — state the refund window and process for direct invoices, and
confirm with counsel; a pro-rata refund on unused full months is the recommended
default]. Refunds, where approved, are credited to the original payment method
within [FOUNDER — number] working days.

**8.6 Price changes.** We may change prices. **You will be notified at least thirty
days before a change takes effect**, by email to your registered address or by
notice in the app, and a change never applies to a period you have already paid
for. For app-store subscriptions, any price increase also requires your consent
through the store before it takes effect, in accordance with that store's rules.

**8.7 The founding-advocate offer** (PD-14). Where you subscribed under the founding
offer — *"founding advocates keep 50% off, permanently, first 5,000 only"* — that
discount continues to apply to your subscription **for as long as it remains
continuously active on a paid plan**. It does not survive a cancellation and a later
re-subscription, and it does not transfer to another person. Both the discount and
the number of places are fixed and are not extended.

> [FOUNDER — **this clause narrows a published promise and you must approve it.**
> PD-14 says *"permanently"* with no continuity condition, and the offer is already
> live on the site. The continuity condition above is the normal commercial reading
> and it stops the discount being farmed by cancelling and re-subscribing, but it is
> **not** what PD-14 says. Either approve the narrowing here, or strike the second
> sentence and accept that a founding rate survives a lapse. Do not leave the
> published offer and the terms saying different things.]

**8.8 Non-payment.** If a subscription lapses, paid features become unavailable.
**Your matters, drafts and notes are retained and are not deleted on lapse** — see
§14.4 for what happens on termination and deletion.

**8.9 Taxes.** You are responsible for any tax arising on your side, including any
input-credit position. We are responsible for tax we are required to collect and
remit.

---

## 9 · Availability, and what we do not warrant

**9.1** We will make reasonable efforts to keep the Services available and
performing. **We do not warrant uninterrupted or error-free availability**, and we
are not liable for loss arising from unavailability. Maintenance, provider outages,
network failure and force majeure all occur.

**9.2 Briefings and alerts are best-efforts, and must never be your only diary.**
The 24-hour briefing and the citator alerts depend on court listing data, on push
delivery by Apple and Google, on your device settings, and on your connectivity.
**A briefing that does not arrive, arrives late, arrives twice, or is incomplete is
a foreseeable failure of this system.** You must maintain your own record of your
listings and your own diary. We accept no liability for a hearing missed, a date
mis-recorded, or an appearance not made.

**9.3 The limitation calculator is an aid to computation, not a determination of
limitation.** It applies general rules to dates you enter. It does not know the
facts of your matter, the date of knowledge, the exclusions that may apply, any
condonation, or any special statutory period. **Compute limitation yourself. Do not
file on the strength of this feature alone.** We accept no liability for a claim
barred by limitation.

**9.4 Court and cause-list data comes from third parties and from public court
systems, and those systems are frequently late, incomplete or wrong.** A listing we
show, or fail to show, is not a substitute for the board.

**9.5 Statutory text.** The bare-acts reader reproduces statutory text from official
sources. Amendments, commencement notifications and state amendments may not be
reflected immediately. **Check the current text against the official gazette before
relying on it in a filing.**

**9.6 Optical character recognition is never trusted silently.** Where Lawmind
extracts fields from a document you upload, **you are asked to confirm those fields
before anything is saved**, and that confirmation is yours. An unchecked extracted
date that becomes a missed hearing is a failure we have designed the product to make
you catch, and we cannot catch it for you.

**9.7 Offline use.** Parts of Lawmind are designed to work without connectivity.
Offline content is a copy taken at the time of the last sync and **may be out of
date — including as to whether a judgment is still good law.**

**9.8 The Services and all data provided through them are supplied "AS IS" and "AS
AVAILABLE"**, without warranty of any kind, express or implied, including any
implied warranty of merchantability, fitness for a particular purpose, accuracy or
non-infringement, save to the extent such a warranty cannot lawfully be excluded.

---

## 10 · Artificial intelligence: specific terms and specific disclaimers

**10.1** Lawmind uses large language models to summarise, extract, draft and
explain. Its outputs are generated by statistical models. **They can be wrong,
incomplete, out of date, internally inconsistent, or confidently mistaken.**

**10.2 Fabrication is a known and unsolved property of these models.** Our
verification harness is designed to stop a fabricated *citation* reaching you, and
it is the most heavily protected part of the product. **It does not and cannot stop
a fabricated or mistaken *proposition*, summary, translation or argument.** A
correctly verified judgment can be described inaccurately in the sentence beside it.

**10.3 The new criminal codes.** The Bharatiya Nyaya Sanhita, the Bharatiya
Nagarik Suraksha Sanhita and the Bharatiya Sakshya Adhiniyam replaced the Indian
Penal Code, the Code of Criminal Procedure and the Indian Evidence Act with effect
from 1 July 2024. **No general-purpose language model was trained on them, and every
such model will answer with the repealed provisions unless constrained.** Lawmind
constrains its models against our own record of the new codes and the mapping
between old and new provisions. **The applicable code depends on the date of the
offence, which is a fact only you have. Check the section number and the code
against the bare act before you cite it.**

**10.4 Hindi.** Legal Hindi output is reviewed against register and terminology, but
translation and generation in Hindi carry the same risks as in English and, in
places, greater ones. Read Hindi output as carefully as English output.

**10.5 YOUR USE OF THE AI FEATURES IS AT YOUR SOLE RISK.** We do not warrant that
output is accurate, reliable, complete, current or free from fabrication. Output is
**informational and assistive only and does not constitute legal advice.** It is not
a substitute for professional judgment, comprehensive research, or reading the
authority itself. **It is your sole responsibility to evaluate, verify and confirm
any output before relying on it or acting on it.**

**10.6** We are not liable for any loss, damage or harm arising from your reliance
on AI-generated output, including from errors, omissions, inaccuracies or
fabrications within it, and including direct, indirect, incidental, special,
consequential or punitive damages and any loss of profit or revenue, whether
incurred directly or indirectly.

**10.7 We do not claim, and you must not represent to any court, client or
regulator, that Lawmind has verified the correctness of your legal position.** What
we verify is stated in §7.2; the limits are stated in §7.5. Where a court or a bar
council asks whether the authorities in a document were checked, the honest answer
is that **you** checked them.

---

## 11 · Your data, privacy, and confidential material

**11.1 Routing by sensitivity.** Public material — judgments, statutes, bare acts —
is processed by a cost-efficient model, because that text is already published.
**Material relating to your matters — uploaded documents, matter notes, party names,
client detail — is treated as sensitive**, is pseudonymised before any model sees
it, and is sent only to a provider operating under written data-processing terms.
Where the classification is ambiguous, we treat the material as sensitive.

**11.2 One document per model call.** We never place two case documents in a single
model context. Mixing case files causes a model to conflate parties between matters,
which would be a confidentiality breach between two of your own clients and would be
invisible in fluent output. This is an architectural rule, not a preference.

**11.3 We do not claim complete removal of personal information, and you should not
assume it.** Automated detection of names, addresses, identifiers and similar data
is **partial**. Indian names, transliteration variants and Devanagari make this
materially harder than published benchmarks suggest. **Do not upload material whose
exposure you could not tolerate.** For a matter of exceptional sensitivity, do not
rely on automated pseudonymisation at all.

**11.4 Third-party personal data.** Documents you upload routinely name accused
persons, witnesses, complainants and minors. **None of those people are our users
and none of them have consented to anything with us.** You warrant that you are
lawfully entitled to disclose that material to us for the purpose of obtaining the
Services, and you must not upload material where you are not.

**11.5 Where your data is processed** (OD-2). Lawmind runs on infrastructure whose
nearest available region to India is **Singapore**, and your data is therefore
processed outside India. This is a recorded position taken with legal advice, with a
migration path in place ahead of the full compliance date under the Digital Personal
Data Protection Act, 2023. **We state it here rather than leaving it to be
discovered.** [FOUNDER — counsel's written view is still owed and must be on file
before publication; `docs/OPEN_DECISIONS.md` OD-2.]

**11.6 Consent to your work being used to improve our models is separate, specific,
and withdrawable.** Accepting these terms is **not** consent to your drafting,
notes or matter content being used to train or improve our models. That is asked
separately, against its own notice, and recorded separately. **You may withdraw it
at any time, in one step, from within the app, without asking anyone and without
giving a reason** — as easily as it was given. Withdrawal takes effect for future
use immediately and, by design, no training material is retained in a form that
survives it.

**11.7 Copied citations are recorded, and we tell you why.** When you copy a
citation out of Lawmind we record which judgment, when, and the matter if there was
one. **This exists for one reason:** if that judgment is later set aside or
overruled, this record is the only means by which we can warn you about a citation
you took outside the app. It is deleted with your account and on an erasure request.

**11.8 Your rights.** You may request access to, correction of, or erasure of your
personal data, and we operate a tracked process for those requests with a response
clock. Address requests to the Grievance Officer named in §17.

**11.9 We do not sell your data**, and we do not use your matter content to market
to you or to anyone else.

**11.10 Security.** We follow reasonable industry practice: data is replicated and
backed up, and known vulnerabilities are patched on a regular cycle. **No system is
immune.** In the event of a breach we will act diligently to contain it, to recover
data, and to notify you and the Data Protection Board of India as the law requires.
Where, after that diligence, data cannot be recovered, **we are not liable for the
loss or for any misuse of the data by the party responsible for the breach.**

---

## 12 · Intellectual property

**12.1 There is no copyright in a judgment.** Section 52(1)(q)(iv) of the Copyright
Act, 1957 exempts the reproduction of any judgment or order of a court, tribunal or
other judicial authority, and that exemption does not distinguish commercial use.
Lawmind uses **raw court text and official sources**. It does not reproduce any law
reporter's copy-edited version — headnotes, editorial paragraph numbering, or other
original editorial matter, which is protected (*Eastern Book Company v. D.B.
Modak*).

**12.2 What is ours.** The Lawmind software, interface, design, the organisation and
enrichment of the corpus, the verification system, our prompts and our models are
owned by Helmor and are protected by law. Nothing in these terms transfers any of it
to you.

**12.3 What is yours.** Your matters, notes, uploaded documents and the drafts you
produce remain yours. **We claim no ownership of them, we do not publish them, and
we do not use them to train models without the separate consent in §11.6.** You
grant us only the licence necessary to host, process and display that material in
order to provide the Services to you.

**12.4 Licence to you.** We grant you a limited, non-exclusive, non-transferable,
revocable licence to use Lawmind for your own legal practice for the duration of
your subscription.

**12.5 What you may not do.** You may not, and may not permit anyone else to:
systematically download, scrape, mirror or bulk-extract our corpus or any part of
it; resell, sublicense, rent or redistribute the Services or their output as a
research service; use the Services to build or train a competing product; reverse
engineer or decompile the applications; circumvent any rate limit, access control or
technical restriction; or remove any attribution required by a data source we rely
on.

**12.6 Acceptable use.** You may not use Lawmind to produce anything unlawful,
defamatory, harassing or fraudulent; to file anything you know to be false; to
impersonate another advocate; or in any way that would bring a court, your bar
council or Helmor into disrepute.

**12.7 Moderation.** We may review, edit or remove material we consider unlawful or
in breach of these terms, and may withdraw access from anyone in breach. Given
§11.2 and §7.6, **this right is exercised over material shared or reported to us,
not by routinely reading your private matter notes.**

---

## 13 · Liability

**13.1** You acknowledge that using legal research and drafting material requires
your own skill and judgment, and you warrant that you have the skill and judgment
required to evaluate what Lawmind gives you. You are solely responsible for every
decision, opinion, recommendation, submission or filing made in reliance on it.

**13.2** To the maximum extent permitted by law, Helmor is not liable for any loss
of profit, revenue, goodwill, opportunity, business, client relationship or
anticipated saving, nor for any indirect or consequential loss of any kind, in
contract, tort (including negligence), statute or otherwise, arising out of or in
connection with the Services — **including, specifically, an adverse order, a costs
order, a professional-conduct proceeding, a missed hearing, a barred claim, or the
citation of an authority that was fabricated, misdescribed, or no longer good law.**

**13.3 Aggregate cap.** To the maximum extent permitted by law, Helmor's total
aggregate liability arising out of or in connection with these terms, however
caused, is limited to **the total amount you actually paid to Helmor for the
Services in the twelve months immediately preceding the event giving rise to the
claim**. [FOUNDER/COUNSEL — confirm this cap is the one you want; it is the standard
formulation and it is deliberately not a nominal figure.]

**13.4** Nothing in this agreement excludes or limits liability that cannot lawfully
be excluded or limited, including for fraud or for death or personal injury caused
by negligence.

**13.5 Indemnity.** You will indemnify Helmor against any claim, demand, loss or
expense arising from your breach of these terms, from your uploading material you
were not entitled to disclose, from your use of Lawmind output in a filing, or from
your breach of any professional-conduct obligation.

---

## 14 · Suspension and termination

**14.1** You may stop using Lawmind and cancel your subscription at any time. For
app-store subscriptions, cancel through Apple or Google (§8.3).

**14.2** Either party may terminate this agreement by **thirty days' notice** to the
other, by email to the registered address on the account.

**14.3** We may suspend or terminate immediately, without notice, where you are in
material breach — in particular account sharing (§5.3), bulk extraction of the
corpus (§12.5), or unlawful use (§12.6).

**14.4 On termination.** Paid features stop. **You may export your matters, drafts
and notes for a period of thirty days after termination.** [FOUNDER — the thirty-day
export window is not recorded anywhere in the repo; I have proposed it because a
matter workspace holding six months of an advocate's work needs a stated exit and
its absence is what makes a product feel like a trap. Confirm the period, and
confirm that the export path actually exists before this sentence is published.]
After that, and on any erasure request, we delete your data — including stored objects, database records,
derived embeddings and caches. **A deletion flag is not deletion**; deletion means
removal. Records we are required by law to retain are retained for that purpose
only.

**14.5** Clauses 2, 7.5, 10, 12, 13, 14.4, 15 and 16 survive termination.

---

## 15 · Force majeure, assignment, and general

**15.1 Force majeure.** Neither party is liable for a failure to perform caused by
something entirely outside its control, including act of God, war, civil unrest,
epidemic, strike, failure of a public court system, failure of an internet or cloud
provider, or governmental action.

**15.2 Assignment.** Neither party may assign this agreement, in whole or in part,
including to an affiliate, without the other's prior written consent, which will not
be unreasonably withheld. Helmor may assign to a successor in a merger, acquisition
or sale of substantially all of its business, on notice to you.

**15.3 Severability.** If any provision is held unenforceable, the rest continues in
force and the unenforceable provision is read down to the minimum extent necessary.

**15.4 No waiver.** A failure to enforce a provision is not a waiver of it.

**15.5 Notices.** Notices to you go to the email address on your account. Notices to
us go to the address in §17.

**15.6 Language.** These terms are issued in English. [FOUNDER — decide whether a
Hindi translation is published; if it is, state that the English version governs in
the event of a conflict. Given that the product ships at genuine Hindi parity,
publishing English-only terms is a defensible but conspicuous gap.]

---

## 16 · Governing law and dispute resolution

**16.1** This agreement is governed by and construed in accordance with the laws of
India.

**16.2** The parties submit to the jurisdiction of the competent courts at
**Gwalior, Madhya Pradesh**, being the location of Helmor's registered office.
[FOUNDER/COUNSEL — confirm. The alternative worth weighing is a metro seat such as
Delhi or Bengaluru, which is more convenient for a counterparty and is what most
comparable services choose. Registered office is the conservative default and is
what this draft states.]

**16.3** The parties will attempt to settle any dispute amicably. Failing that, the
dispute is referred to **arbitration under the Arbitration and Conciliation Act,
1996**, before a sole arbitrator appointed jointly by the parties. The seat and
venue of arbitration is **Gwalior, Madhya Pradesh** and the language is English.

**16.4** Nothing in this clause prevents either party from seeking urgent interim
relief from a competent court.

---

## 17 · Grievance Officer and contact

In accordance with the Information Technology Act, 2000 and the rules made under it,
and with the Digital Personal Data Protection Act, 2023:

**Grievance Officer:** [FOUNDER — name]
**Designation:** [FOUNDER — designation]
**Email:** [FOUNDER — grievance email on a Helmor-controlled domain]
**Address:** [FOUNDER — registered office address, Gwalior, Madhya Pradesh]
**Response time:** we acknowledge within 24 hours and resolve within 15 days of
receipt, as required.

**General contact:** `hello@lawmind.in`

> [FOUNDER — **domain inconsistency to resolve before publication.** The app's Firm
> enquiry link uses `hello@lawmind.in`
> (`apps/mobile/src/screens/subscription/SubscriptionScreen.tsx`), while outbound
> mail is verified and sending from `lawmind.co`
> (`no-reply@lawmind.co`, `DEPLOYMENT.md`). Two domains in a published legal
> document is the kind of detail that gets read as carelessness. Pick one.]

---

## Appendix A · What was deliberately NOT carried over from the source document

Recorded so that the omissions read as decisions rather than oversights, and so that
nobody re-inserts one later.

| Source clause | Why it is not here |
| --- | --- |
| *"Registration constitutes an irrevocable waiver of any claim that you did not read, understand, or agree"* | Not something we would want to rely on, and inconsistent with recording versioned consent at all. Replaced by §3.2–§3.5. |
| *"We may amend at any time by posting an amended version; it is your responsibility to review regularly"* | We bump the version and require re-acceptance instead (§3.3). The whole point of storing `terms_version` is that we know which text you agreed to. |
| *"We reserve the right to use your picture, name, occupation and location to help other members find you"* | We operate no directory and will not introduce one silently (§7.6). |
| *"Your research notes and drafts would be shared with the general public or other members as per your privacy settings"* | We never publish an advocate's notes or drafts (§7.6, §12.3). Notes are private by default (PD-4). |
| *"Full refund within 48 hours by writing to admin@…"* | Structurally impossible for money that goes to Apple or Google, not to us (§8.4). Promising it would be a term we cannot perform. |
| Per-feature numeric quotas (25 alerts, 250 downloads per month, etc.) | Our plans are not metered on those axes today. **Do not add a quota to this document until it is actually enforced in code** — a published limit we do not enforce is worse than no limit. |
| "Click I ACCEPT / I DO NOT ACCEPT" boilerplate and the software-download framing | Wrong artefact. Lawmind is a mobile app with an explicit onboarding consent screen; the mechanism is described in §3.2. |
| A named counterparty in the preamble | A contract of adhesion should not carry a specimen name. The parties are identified by the account record. |

---

## Appendix B · Everything a human must supply before this is published

1. Registered office address and CIN of Helmor Private Limited (§1.1, §17)
2. GSTIN, and whether listed prices are inclusive or exclusive of GST (§8.1)
3. Security contact address (§5.2)
4. Refund window and process for directly-invoiced Firm subscriptions (§8.5)
5. Confirmation of the liability cap formulation (§13.3)
6. Confirmation of jurisdiction and arbitration seat (§16.2, §16.3)
7. Grievance Officer name, designation and email (§17)
8. Resolution of the `lawmind.in` / `lawmind.co` split (§17)
9. Whether a Hindi translation is published, and which language governs (§15.6)
10. Counsel's written data-residency view, on file (§11.5, OD-2)
11. Publication of the Privacy Policy this document references (§1.4)
12. **Approval of the founding-offer continuity condition** — it narrows PD-14,
    which says "permanently" without one (§8.7)
13. **Confirmation of the thirty-day post-termination export window**, and that an
    export path exists to honour it (§14.4)
14. **Counsel review of the whole document**, and then the version bump in
    `services/api/src/auth/account.ts` so the in-app consent points at it (§3.3)
