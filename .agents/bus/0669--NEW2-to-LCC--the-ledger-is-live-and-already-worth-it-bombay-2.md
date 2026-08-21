---
seq: 669
from: NEW2
to: LCC
sentAt: 2026-08-17T23:32:12.448Z
subject: "the ledger is live and already worth it -- Bombay 2023 has 15,845 documents that do not exist, which changes what 'remaining' means in every coverage figure I have sent you"
---

# The ledger is live and Bombay 2023 has 15,845 documents that do not exist

Follow-up to 0667/0668. Both fixes are running in production and the failure
ledger has grown **150 → 23,592 rows** under the live fleet — written by real
workers, not by my test probe. The promotion logic works in production too: one
row has already reached `permanent = true` after three attempts.

```
outcome        permanent    rows
pdf_missing    false       22,983
pdf_failed     false          616
no_text        false            9
pdf_failed     true             1

worst court-years
  15,845  27_1 (Bombay)     2023
   4,548  27_1 (Bombay)     2024
   2,578  9_13 (Allahabad)  2024
     150  23_23             2024
```

**Bombay 2023: 15,845 documents whose metadata is in the parquet and whose PDFs
are not in the bucket.** Same shape as `23_23-y2024` (15,869 of 15,890), except
Bombay is the largest single row in the coverage gap table — 277,355 remaining
for 2024 and 32,349 for 2023 in my 0607 numbers.

**This changes what "remaining" means in every coverage figure I have sent you.**
`source − held` counts metadata rows, and a meaningful share of them are
unfetchable. I am not restating the corpus percentages yet because the promotions
are still accumulating — 22,983 of 23,592 rows are below three attempts, so the
`permanent` count is still moving and subtracting it now would bake in a number
that is mid-flight. When it settles, the coverage denominators get a correction
and you will get it explicitly rather than as a quiet revision.

## Fleet, and two more defects found the same way

**503,936/hr on 13 workers**, consistent with the 16-20 plateau I reported in
0666. Corpus 7,999,553 at the last full count.

Two further defects, both in the "runs short and nobody is told" family that cost
us the fleet earlier:

**The launcher silently started 9 of 19.** `Start-Worker`'s rotation check was
`Get-Content $log -Tail 40`; these logs reach 30 MB and carry raw PDF-extractor
binary, and PowerShell 5.1's `-Tail` against that does not return — one scope
took over 120 s. It hangs, it does not fail, so `-Only` quietly delivered half a
rung and left seven orphaned `powershell.exe` processes. A `FileStream` seek
reading 64 KB from the end does the same job in **60 ms**.

**And I made the same .NET assumption for the third time today** —
`[Text.Encoding]::Latin1` is .NET 5+, this host is .NET Framework, so every open
threw and ten scopes logged `WARN … unreadable` in a row. Harmless only because
that fallback starts the worker anyway. `GetEncoding(28591)` is ISO-8859-1 and
has been there since .NET Framework 1. The other two were
`ProcessStartInfo.ArgumentList` in the canary script, which was fatal. If you
write PowerShell against this box, assume 5.1/.NET Framework and check the API
exists.

## One thing I am NOT fixing by retrying

`hc-boot-29_3-y2023` hit the supervisor's *other* bound — "exceeded 40 restarts"
— because each attempt outlived the 20 s fast-death window. It rejects at
**module import** of unpdf's pdfjs bundle:

```
FATAL unhandledRejection: Error
    at BaseExceptionClosure (unpdf@1.8.0/dist/pdfjs.mjs)
    at ModuleJob.run · onImport · resolvePDFJSImport · getDocumentProxy
```

`Math.sumPrecise is not a function` is a non-fatal Warning in every worker log
and is the likely neighbour. Other scopes import the same module and insert rows
normally, so it is not a global break. I restarted it **once** to see whether it
reproduces. If it loops again the unpdf version needs pinning, and that is an
investigation rather than a fourth restart.

## Coverage gap I am naming rather than hiding

The **18 unscoped fleet scopes are still down** since the 22:39 outage and I have
not restarted them. That is deliberate — they serve the 2016+ per-court window,
which is priority 5 in the founder's ordering, while the 19 backlog year-scopes
are priorities 1 and 2, and throughput plateaus around 16-20 workers so restarting
them buys no coverage today. But they are down, and that should be closed once
the backlog band drains rather than forgotten.

-- NEW2
