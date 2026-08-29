"""
Measure OCR engines on the REAL eCourts CAPTCHA images, against ground truth.

WHY THIS EXISTS RATHER THAN A LEADERBOARD
-----------------------------------------
Every published OCR benchmark measures documents: reading order, tables,
multi-column flow. OmniDocBench and olmOCR-bench rank engines on exactly the
properties a six-character CAPTCHA does not have. So "which OCR is best" cannot
be answered here by citing a leaderboard - it has to be measured on these bytes,
against labels somebody actually read.

Two metrics, because they answer different questions:

  exact   - the whole string right. This is the only one that matters
            operationally: a CAPTCHA is right or the request is rejected.
  char    - per-position character accuracy. Diagnostic only; it says whether an
            engine is close or lost, which tells you if post-processing is worth
            trying.

Run:
  .venv-ocr/Scripts/python.exe scripts/lcc-captcha-engine-bench.py   # paddle
  python scripts/lcc-captcha-engine-bench.py --engine rapid          # 3.14
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / ".scratch/lcc-r11/captcha"
CHARSET = re.compile(r"[^a-z0-9]")


def normalise(text: str) -> str:
    """The charset the source actually uses: lowercase alphanumeric, nothing else."""
    return CHARSET.sub("", (text or "").lower())


def score(pred: str, truth: str) -> tuple[bool, float]:
    exact = pred == truth
    if not truth:
        return exact, 0.0
    hits = sum(1 for a, b in zip(pred.ljust(len(truth)), truth) if a == b)
    return exact, hits / len(truth)


def run_paddle(paths):
    from paddleocr import PaddleOCR

    # oneDNN is disabled explicitly, not by an env flag: paddle 3.3.1's PIR
    # executor cannot lower a double-array attribute through the oneDNN
    # instruction path and dies with an Unimplemented error on the detector.
    # FLAGS_use_mkldnn=0 does not reach the predictor config; this does.
    ocr = PaddleOCR(
        lang="en",
        use_textline_orientation=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        enable_mkldnn=False,
    )
    out = {}
    for p in paths:
        res = ocr.predict(str(p))
        texts = []
        for page in res or []:
            texts.extend(page.get("rec_texts", []) or [])
        out[p.name] = normalise("".join(texts))
    return out


def run_rapid(paths):
    from rapidocr_onnxruntime import RapidOCR

    ocr = RapidOCR()
    out = {}
    for p in paths:
        res, _ = ocr(str(p))
        text = "".join(line[1] for line in (res or []))
        out[p.name] = normalise(text)
    return out


ENGINES = {"paddle": run_paddle, "rapid": run_rapid}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="paddle", choices=sorted(ENGINES))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    truth = json.loads((SAMPLES / "ground-truth.json").read_text(encoding="utf-8"))["labels"]
    paths = sorted(SAMPLES.glob("captcha-*.png"))
    if not paths:
        print("no samples", file=sys.stderr)
        return 2

    started = time.time()
    preds = ENGINES[args.engine](paths)
    elapsed = time.time() - started

    rows, exact_n, char_sum = [], 0, 0.0
    for p in paths:
        t = truth.get(p.name, "")
        pred = preds.get(p.name, "")
        ok, ca = score(pred, t)
        exact_n += int(ok)
        char_sum += ca
        rows.append({"file": p.name, "truth": t, "pred": pred, "exact": ok, "charAcc": round(ca, 3)})
        print(f"{'OK ' if ok else '   '} {p.name}  truth={t!r:10} pred={pred!r:14} char={ca:.2f}")

    n = len(paths)
    report = {
        "artifact": "LCC_CAPTCHA_ENGINE_BENCH",
        "engine": args.engine,
        "samples": n,
        "exact": exact_n,
        "exactRate": round(exact_n / n, 4),
        "charAccuracy": round(char_sum / n, 4),
        "secondsPerImage": round(elapsed / n, 3),
        "results": rows,
        "note": (
            "Measured on real retained eCourts CAPTCHA images against labels read by eye. "
            "exactRate is the only operationally meaningful number: a CAPTCHA is either "
            "right or the request is rejected."
        ),
    }
    print(
        f"\n{args.engine}: exact {exact_n}/{n} = {exact_n / n:.1%} · "
        f"char {char_sum / n:.1%} · {elapsed / n:.2f}s/image"
    )
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("GLOG_minloglevel", "2")
    raise SystemExit(main())
