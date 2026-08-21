"""
NEW2 -- P3. CAN ANYTHING RECOVER THE GLYPH-DUMP DOCUMENTS?

Three readings of the SAME pdf, so the comparison is within-document and the
question is not confounded by which documents were chosen:

  A. STORED      what judgments.full_text holds today (unpdf, at ingest time)
  B. MUPDF       a DIFFERENT extractor on the same bytes. If this works, the
                 answer is a cheap re-extraction and OCR is not needed at all.
  C. OCR         the rendered page, read as pixels. This is the only route that
                 does not depend on the font's character map existing.

Controls are the point. A suspect-only run could report "OCR produced text" and
mean nothing, because it is unknown whether this OCR setup works at all on this
registry's PDFs. So readable documents from the SAME courts and from OTHER
courts are run through the identical path, and the number that matters is the
SEPARATION.

Bounded: --limit pdfs, page 1 only, CPU only. No GPU, so it cannot compete with
NEW1's embed sidecar.
"""
import json, sys, io, re, time, urllib.request, argparse

import pymupdf
from rapidocr_onnxruntime import RapidOCR

CTRL = re.compile("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]")
EN = re.compile(
    r"\b(the|of|and|to|in|is|that|for|this|be|by|with|as|it|has|have|not|shall|been|on|are|was|"
    r"court|petitioner|respondent|order|application|learned|counsel|section|dated|filed|hon)\b",
    re.I,
)


def score(text):
    """The same two numbers the deterministic detector uses, so a verdict here
    and a verdict in text-damage.ts mean the same thing."""
    n = len(text) or 1
    return {
        "chars": len(text),
        "controlDensity": round(len(CTRL.findall(text)) / n, 4),
        "englishRate": round(1000 * len(EN.findall(text)) / n, 2),
    }


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "lawmind-new2-quality-probe"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--dpi", type=int, default=200)
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(args.inp, encoding="utf-8") if l.strip()]
    ocr = RapidOCR()
    out = []
    for i, r in enumerate(rows, 1):
        rec = {k: r[k] for k in ("documentId", "court", "group", "storedText") if k in r}
        rec["sourceUrl"] = r.get("sourceUrl")
        rec["stored"] = score(r.get("storedText") or "")
        try:
            t0 = time.time()
            raw = fetch(r["sourceUrl"])
            # The bucket serves soft 404s: HTTP 200, application/pdf, 124 bytes
            # of HTML. Magic bytes are the only thing that can see it.
            if not raw.startswith(b"%PDF-"):
                rec["error"] = f"not a pdf ({len(raw)} bytes)"
                out.append(rec)
                continue
            doc = pymupdf.open(stream=raw, filetype="pdf")
            page = doc[0]
            mup = page.get_text()
            rec["mupdf"] = score(mup)
            rec["mupdfSample"] = mup[:200]
            # /ToUnicode presence, straight from the file, as the probe already
            # measured from the text side.
            fonts = page.get_fonts(full=True)
            rec["fontCount"] = len(fonts)
            pix = page.get_pixmap(dpi=args.dpi)
            res, _ = ocr(pix.tobytes("png"))
            otext = "\n".join(x[1] for x in res) if res else ""
            rec["ocr"] = score(otext)
            rec["ocrSample"] = otext[:300]
            rec["seconds"] = round(time.time() - t0, 1)
            doc.close()
        except Exception as e:  # noqa: BLE001 - the failure itself is the datum
            rec["error"] = f"{type(e).__name__}: {e}"
        out.append(rec)
        print(f"  {i}/{len(rows)} {rec.get('group','')} {rec.get('seconds','-')}s", flush=True)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
