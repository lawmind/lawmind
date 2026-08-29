# The moat is off this machine, encrypted, and proven readable

**LCC R12b, 30 August 2026.** §16 of R12 asked for the encrypted upload and
readback that R12 built the pack for but never performed.

    OFF_MACHINE_VERIFIED   = yes
    ENCRYPTED_CLIENT_SIDE  = yes (AES-256-GCM, key never uploaded)
    READBACK               = 0 differences, every byte, 93 s
    END_TO_END_DECRYPT     = MATCH
    RESTORE_PROVEN         = yes (this exact pack, 685.2 s)
    KEY_ESCROWED           = NO  <-- FQ-BACKUP-KEY-ESCROW

---

## 1. WHY CLIENT-SIDE ENCRYPTION, WHEN R2 ALREADY ENCRYPTS AT REST

R2 gives TLS in transit and server-side encryption at rest. For the bulk corpus
that is plenty: judgments are published documents.

**This pack is not that.** `scripts/lcc-moat-backup.mjs` packs `users`,
`matters`, `matter_events`, `matter_authorities`, `matter_shares`,
`judgment_annotations` and `documents` — client names, party names, hearing notes
and an advocate's own highlights. `CLAUDE.md` §5 classes that as sensitive.

Server-side encryption is a control **the storage provider holds the key to**. It
defends against a stolen disk. It does not defend against a misconfigured bucket
policy, a leaked object-scoped key, or the provider itself. So the pack is
encrypted here, and the key never goes to Cloudflare.

`scripts/migration/encrypt-pack.mjs`. AES-256-GCM, fresh 96-bit IV per file,
128-bit auth tag appended:

    MAGIC(8) || VERSION(1) || IV(12) || ciphertext || TAG(16)

GCM is authenticated, so a tampered or truncated object **fails to decrypt**
rather than yielding plausible garbage — which for a backup is the whole point,
because nobody reads a restore closely enough to notice.

It refuses honestly with no key, in the `packages/auth/src/mail.ts` pattern.
Observed: it printed a freshly generated key and exited 2. An "encrypted backup"
that silently fell back to plaintext would be the worst object in the directory.

---

## 2. WHAT WAS DONE, IN ORDER, WITH WHAT WAS OBSERVED

| step | evidence |
| --- | --- |
| Pack rebuilt (the R12 pack had been cleaned off disk) | 35 tables, 0 absent, 1.587 GB, 79.9 s |
| Uncompressed `judgment-verdicts.csv` (957 MB) dropped | it is an intermediate; the `.gz` is what the manifest names |
| Encrypted, 5 files | `backup-encryption-manifest.json` — plaintext AND ciphertext sha256 for each |
| **Local round trip before uploading anything** | `schema.sql` decrypted to `f4e9e9f4…a1933` — **MATCH** |
| Uploaded | 6 files, 1.48 GB, 140 s |
| **Read back, every byte, and compared** | `0 differences found`, 7 matching files, 93 s |
| **Pulled one object fresh from R2 and decrypted it** | `f4e9e9f4…a1933` — **END-TO-END MATCH** |
| Rotation | kept 3, deleted 1 (`2026-08-16T01-48-46-142Z-chunked`) |
| **Restore-proved the pack itself** | 35 tables, every row count `ok`, content checksum `5388aa9b…` **MATCH**, 685.2 s — `moat-restore-proof-r12b.txt` |

Remote: `lawmind-corpus/backups/postgres/2026-08-29T23-04-23-326Z-moat-r12b-enc`
Rollup sha256: `308daef48b2c2f54884391be8574609012df4a74ab531bf7c29d750b5de03f1e`

The restore was run with `--skip-dump`, which restores the pack **already on
disk** rather than one taken thirty seconds earlier. That is the harder and more
honest exercise: a restore proved against a fresh dump only shows that `pg_dump`
and `pg_restore` agree, whereas what anyone actually needs to know is whether the
pack sitting there can be brought back.

The readback is `rclone check --download`, which fetches every object and
compares content rather than trusting an ETag. R2 charges no egress, so proving
the bytes costs nothing — on S3 this would be a bill and the temptation would be
to trust the ETag instead.

**Two proofs, not one, and they answer different questions.** The readback proves
the ciphertext we uploaded is the ciphertext R2 holds. The end-to-end decrypt
proves that ciphertext is still *our data* — that the key, the envelope and the
auth tag all survive a round trip through someone else's storage. Either alone
would leave the other unanswered.

---

## 3. THE TRADE, STATED BECAUSE IT IS THE FOUNDER'S TO ACCEPT

**The key exists in exactly one place: `R2_BACKUP_ENCRYPTION_KEY` in `.env` on
this workstation.**

That is the same workstation the backup exists to survive the loss of. Until the
key is escrowed somewhere else — a password manager is enough — this change has
**raised confidentiality and lowered recoverability**, and it is not yet a backup
in the sense that matters.

`.env` is gitignored; the key is in no commit, artifact or log. `FOUNDER_QUEUE.md`
**FQ-BACKUP-KEY-ESCROW** carries the five-minute action.

---

## 4. WHAT IS DELIBERATELY NOT IN THE PACK

Recorded so a future reader does not mistake absence for loss:

- `judgments` — 151 GB, rebuildable from the AWS Open Data buckets
- `judgment_paragraphs` — 92 GB, derived from `judgments`
- `judgment_chunks` — 9.4 GB, rebuildable at GPU cost

The pack is the part that **cannot be rebuilt from a public source**: the
advocates, their matters, the citation graph, the provenance artifacts and the
verdict projection over the corpus.
