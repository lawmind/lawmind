"""
NEW2 -- OCR RECOVERY, THE PRODUCTION STEP.

The probe (`new2-ocr-recovery-probe.py`) answered *can this be recovered*: 20 of
20 suspects recovered, 0 of 20 recovered by a second extractor, 3.7 s a page.
This is the step that actually recovers one document, and it differs from the
probe in three ways that matter:

  * WHOLE DOCUMENT, not page 1. The probe's headline figure is a page-1 figure
    and the policy document says so in its own "what is NOT established". A
    document whose first page OCRs cleanly and whose fifth does not would have
    read as a success there.
  * IT REPORTS PER PAGE. `pages` carries a score per page, so a partial recovery
    is visible as a partial recovery instead of averaging into a single number
    that hides it.
  * IT NEVER DECIDES ANYTHING. No verdict, no database, no state. It reads a PDF
    and prints what it read; the caller adjudicates. That is what keeps the
    digit crosscheck in one place instead of two.

Pure stdin -> stdout JSON, so the caller owns retries, ordering and the queue.

    echo '{"judgmentId":"...","sourceUrl":"https://..."}' \
      | python scripts/new2-ocr-recover.py --max-pages 40
"""
import argparse
import io
import json
import re
import sys
import time
import urllib.request

import pymupdf
from rapidocr_onnxruntime import RapidOCR

ENGINE = "rapidocr-onnxruntime/PP-OCRv4"

CTRL = re.compile("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]")
EN = re.compile(
    r"\b(the|of|and|to|in|is|that|for|this|be|by|with|as|it|has|have|not|shall|been|on|are|was|"
    r"court|petitioner|respondent|order|application|learned|counsel|section|dated|filed|hon)\b",
    re.I,
)


def score(text):
    """The same two numbers `text-damage.ts` and the probe use, so a verdict
    here and a verdict there mean the same thing."""
    n = len(text) or 1
    return {
        "chars": len(text),
        "controlDensity": round(len(CTRL.findall(text)) / n, 4),
        "englishRate": round(1000 * len(EN.findall(text)) / n, 2),
    }


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "lawmind-new2-recovery"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def recover(row, ocr, dpi, max_pages):
    out = {
        "judgmentId": row.get("judgmentId"),
        "sourceUrl": row.get("sourceUrl"),
        "engine": ENGINE,
        "dpi": dpi,
    }
    t0 = time.time()
    raw = fetch(row["sourceUrl"])
    # The bucket serves soft 404s: HTTP 200, Content-Type application/pdf, and
    # 124 bytes of HTML in the body. HEAD cannot see it; magic bytes can.
    if not raw.startswith(b"%PDF-"):
        out["error"] = f"not_a_pdf ({len(raw)} bytes)"
        return out

    doc = pymupdf.open(stream=raw, filetype="pdf")
    out["pageCount"] = doc.page_count
    n = min(doc.page_count, max_pages)
    out["pagesRead"] = n
    # Recorded, not silently ignored: a 90-page judgment truncated at 40 is a
    # PARTIAL recovery and the caller has to be able to see that it was.
    out["truncated"] = doc.page_count > n

    pages = []
    texts = []
    for i in range(n):
        page = doc[i]
        pix = page.get_pixmap(dpi=dpi)
        res, _ = ocr(pix.tobytes("png"))
        text = "\n".join(x[1] for x in res) if res else ""
        texts.append(text)
        s = score(text)
        s["page"] = i + 1
        pages.append(s)
    doc.close()

    full = "\n".join(texts)
    out["pages"] = pages
    out["text"] = full
    out["score"] = score(full)
    out["seconds"] = round(time.time() - t0, 1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--max-pages", type=int, default=40)
    args = ap.parse_args()

    ocr = RapidOCR()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        try:
            out = recover(row, ocr, args.dpi, args.max_pages)
        except Exception as e:  # noqa: BLE001 - the failure itself is the datum
            out = {
                "judgmentId": row.get("judgmentId"),
                "sourceUrl": row.get("sourceUrl"),
                "engine": ENGINE,
                "error": f"{type(e).__name__}: {e}",
            }
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
