"""
Solve one eCourts CAPTCHA image. PaddleOCR only.

WHY PADDLEOCR, MEASURED RATHER THAN ASSUMED
-------------------------------------------
Benchmarked on 12 real retained eCourts CAPTCHAs against labels read by eye
(`scripts/lcc-captcha-engine-bench.py`, artifacts in `docs/ai/lcc-r11/`):

    PaddleOCR PP-OCRv6_medium   11/12 exact (91.7%)  98.6% char  0.44 s/image
    RapidOCR  PP-OCRv4 ONNX      8/12 exact (66.7%)  90.3% char  0.63 s/image

PaddleOCR wins on accuracy AND speed, so it is the only engine used here.
RapidOCR remains in the bench as the comparator that produced that evidence and
is not a fallback: a silent fallback to a worse engine would mean the pilot's
accuracy quietly depended on which import happened to succeed.

The published OCR leaderboards could not have decided this. They rank engines on
documents — reading order, tables, multi-column flow — and a six-character
CAPTCHA has none of those properties. The only way to know was to measure.

ABOUT THE ONE MISS
------------------
`w939l3` vs `w93913`: a bare vertical stroke that is either lowercase `l` or
digit `1`, indistinguishable in this face. PaddleOCR may be right and the human
label wrong. It is left as a known ambiguity rather than "fixed" by a rule,
because the operational cost is nil: a rejected code returns `status: 0` and the
caller asks for a fresh CAPTCHA. One retry takes 91.7% to ~99.3%.

WHAT THIS DOES NOT DO
---------------------
It does not decide whether solving is permitted. That is `authorisation.ts`
(`captchaBypassRefusal`) and the guard, and this is never called except from the
adapter that has already passed them.

    python scripts/lcc-captcha-solve.py --image path.png
    -> {"code": "tmtgr8", "engine": "paddleocr", "raw": "tmtgr8"}
"""

import argparse
import json
import re
import sys

CHARSET = re.compile(r"[^a-z0-9]")

_OCR = None


def _ocr():
    global _OCR
    if _OCR is None:
        from paddleocr import PaddleOCR

        # oneDNN off deliberately: paddle 3.3.1's PIR executor cannot lower a
        # double-array attribute through the oneDNN instruction path and aborts
        # the detector with an Unimplemented error. `FLAGS_use_mkldnn=0` does not
        # reach the predictor config; this argument does.
        _OCR = PaddleOCR(
            lang="en",
            use_textline_orientation=False,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            enable_mkldnn=False,
        )
    return _OCR


def solve(path: str) -> dict:
    result = _ocr().predict(path)
    texts = []
    for page in result or []:
        texts.extend(page.get("rec_texts", []) or [])
    raw = "".join(texts)
    # The charset the source actually uses, established by reading real samples:
    # six lowercase alphanumerics. The page's own instructions say "the 5 digit
    # numbers shown on the screen" and are wrong about both length and charset,
    # so this follows the observed images and not the prose.
    code = CHARSET.sub("", raw.lower())
    return {"code": code, "engine": "paddleocr", "raw": raw, "length": len(code)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    args = ap.parse_args()
    out = solve(args.image)
    print(json.dumps(out))
    # A length other than six is reported, never silently padded or trimmed: the
    # caller can decide to refetch, and a wrong-length code posted anyway would
    # spend a grant request to learn nothing.
    return 0 if out["length"] == 6 else 1


if __name__ == "__main__":
    sys.exit(main())
