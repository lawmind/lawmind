#!/usr/bin/env python
"""Render a PDF with PyMuPDF and OCR it with local Tesseract only."""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--tesseract", required=True)
    parser.add_argument("--language", default="hin+eng")
    parser.add_argument("--tessdata")
    parser.add_argument("--dpi", type=int, default=250)
    args = parser.parse_args()

    document = fitz.open(args.pdf)
    pages: list[str] = []
    with tempfile.TemporaryDirectory(prefix="lawmind-cx1-ocr-") as temp:
        for number, page in enumerate(document):
            pixmap = page.get_pixmap(dpi=args.dpi, alpha=False)
            image = Path(temp) / f"page-{number:04d}.png"
            pixmap.save(image)
            command = [
                    args.tesseract,
                    str(image),
                    "stdout",
                    "-l",
                    args.language,
                    "--psm",
                    "6",
                ]
            if args.tessdata:
                command.extend(["--tessdata-dir", args.tessdata])
            command.append("quiet")
            run = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            pages.append(run.stdout.strip())
    print("\n\n".join(pages))


if __name__ == "__main__":
    main()
