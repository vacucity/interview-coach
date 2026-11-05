"""Extract plain text from a résumé (PDF, DOCX, TXT, MD).

usage: python extract_resume.py <résumé file> <output .txt>
"""
import html
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


def from_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            reader.decrypt("")          # many "protected" PDFs only carry an owner password
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        if text.strip():
            return text
    except Exception as e:              # fall through to pdftotext
        print(f"pypdf failed ({type(e).__name__}: {e}); trying pdftotext", file=sys.stderr)
    if shutil.which("pdftotext"):
        r = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True)
        return r.stdout.decode("utf-8", errors="replace")
    raise SystemExit("Could not read the PDF: install pypdf (pip install pypdf) or poppler's pdftotext, or export the résumé as DOCX/TXT.")


def from_docx(path: Path) -> str:
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    paras = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        p = re.sub(r"<w:br(?:\s[^>]*)?/>", "\n", p)
        p = re.sub(r"<w:tab\s*/>", "<w:t> </w:t>", p)
        t = "".join(re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", p, re.S))
        if t.strip():
            paras.append(html.unescape(t))
    return "\n".join(paras)


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    suffix = src.suffix.lower()
    if suffix == ".pdf":
        text = from_pdf(src)
    elif suffix == ".docx":
        text = from_docx(src)
    elif suffix in (".txt", ".md"):
        text = src.read_text(encoding="utf-8", errors="replace")
    else:
        raise SystemExit(f"Unsupported résumé format: {suffix} (use PDF, DOCX, TXT or MD)")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding="utf-8")
    print(f"wrote {dst} ({len(text)} characters)")


if __name__ == "__main__":
    main()
