"""
Render the two client messages to PDF.

Kept as a script rather than a one-off so the PDFs can be regenerated after an
edit to the source markdown — the .md files stay the single source of truth.

Deliberately minimal markdown handling: these two documents only use headings,
bold, blockquotes, bullets and horizontal rules, so a full parser would be more
surface area than the job needs.
"""
import re
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, ListFlowable, ListItem,
)

HERE = Path(__file__).parent

INK = colors.HexColor('#1a1a1a')
MUTED = colors.HexColor('#5a6b7a')
ACCENT = colors.HexColor('#0ea5e9')

BODY = ParagraphStyle(
    'body', fontName='Helvetica', fontSize=10.5, leading=15.5,
    textColor=INK, spaceAfter=10,
)
H1 = ParagraphStyle(
    'h1', fontName='Helvetica-Bold', fontSize=17, leading=21,
    textColor=INK, spaceAfter=4,
)
H2 = ParagraphStyle(
    'h2', fontName='Helvetica-Bold', fontSize=12, leading=16,
    textColor=INK, spaceBefore=16, spaceAfter=6,
)
QUOTE = ParagraphStyle(
    'quote', parent=BODY, leftIndent=14, textColor=MUTED,
    borderPadding=0, fontName='Helvetica-Oblique', spaceAfter=7,
)
BULLET = ParagraphStyle('bullet', parent=BODY, spaceAfter=4)


def inline(text: str) -> str:
    """**bold** -> <b>, escape the few characters reportlab treats as markup."""
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # `code` -> a monospace run. Left as literal backticks the first time, which
    # reads as a typo in a document going to a client.
    text = re.sub(r'`([^`]+)`', r'<font face="Courier">\1</font>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)', r'<i>\1</i>', text)
    return text


def build(md_path: Path, out_path: Path, title: str) -> None:
    lines = md_path.read_text(encoding='utf-8').splitlines()
    flow, para, bullets = [], [], []

    def flush_para():
        if para:
            flow.append(Paragraph(inline(' '.join(para)), BODY))
            para.clear()

    def flush_bullets():
        if bullets:
            flow.append(ListFlowable(
                [ListItem(Paragraph(inline(b), BULLET), leftIndent=12) for b in bullets],
                bulletType='bullet', start='•', leftIndent=14, bulletFontSize=8,
                bulletColor=ACCENT,
            ))
            flow.append(Spacer(1, 6))
            bullets.clear()

    for raw in lines:
        line = raw.rstrip()

        if not line.strip():
            flush_para(); flush_bullets()
            continue
        if line.startswith('---'):
            flush_para(); flush_bullets()
            flow.append(Spacer(1, 6))
            flow.append(HRFlowable(width='100%', thickness=0.6, color=colors.HexColor('#d8e0e6')))
            flow.append(Spacer(1, 8))
            continue
        if line.startswith('# '):
            flush_para(); flush_bullets()
            flow.append(Paragraph(inline(line[2:]), H1))
            continue
        if line.startswith('## '):
            flush_para(); flush_bullets()
            flow.append(Paragraph(inline(line[3:]), H2))
            continue
        if line.startswith('>'):
            flush_para(); flush_bullets()
            # A bare ">" is the blank line BETWEEN quoted paragraphs. Without
            # this it fell through and printed a literal ">" in the PDF.
            body = line[1:].strip()
            flow.append(Spacer(1, 4) if not body else Paragraph(inline(body), QUOTE))
            continue
        if line.startswith('- '):
            flush_para()
            bullets.append(line[2:])
            continue

        flush_bullets()
        para.append(line.strip())

    flush_para(); flush_bullets()

    SimpleDocTemplate(
        str(out_path), pagesize=LETTER,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=0.85 * inch, bottomMargin=0.8 * inch,
        title=title, author='KIBA',
    ).build(flow)
    print('wrote', out_path)


if __name__ == '__main__':
    build(
        HERE / '2026-07-21-karibi-msg-action-items.md',
        HERE / 'KIBA_Action_Items_2026-07-21.pdf',
        'KIBA — Action Items',
    )
    build(
        HERE / '2026-07-21-karibi-msg-fixes-shipped.md',
        HERE / 'KIBA_Fixes_Shipped_2026-07-21.pdf',
        'KIBA — Fixes Shipped',
    )
