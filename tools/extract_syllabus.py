"""Dump a syllabus PDF as text plus every hyperlink paired with the words it sits on.

Usage:
    python3 tools/extract_syllabus.py syllabi/SOME_SYLLABUS.pdf

Canvas syllabi hide reading links under titles ("Sudhir, 'Market Segmentation'"), so plain
text extraction loses them. The LINKS section prints `p<page> [anchor words] url` for each
unique URL so readings can be matched to their links.
"""
import sys

import pdfplumber


def main(path):
    with pdfplumber.open(path) as pdf:
        links = []
        for i, page in enumerate(pdf.pages, 1):
            print(f"\n=== PAGE {i} ===")
            print(page.extract_text() or "")
            for h in page.hyperlinks:
                url = h.get("uri")
                if not url or url.startswith("mailto:"):
                    continue
                try:
                    box = (max(h["x0"] - 1, 0), max(h["top"] - 1, 0),
                           min(h["x1"] + 1, page.width), min(h["bottom"] + 1, page.height))
                    anchor = " ".join((page.crop(box).extract_text() or "").split())
                except ValueError:
                    anchor = "?"
                links.append((i, anchor, url))
        print("\n=== LINKS (page, anchor words, url) ===")
        seen = set()
        for i, anchor, url in links:
            if url in seen:
                continue
            seen.add(url)
            print(f"p{i} [{anchor}] {url}")


if __name__ == "__main__":
    main(sys.argv[1])
