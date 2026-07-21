/**
 * Renderer for the public legal pages.
 *
 * The body is stored as plain text with `## ` headings and blank-line
 * paragraphs. Rendered by splitting rather than with a markdown library and
 * `dangerouslySetInnerHTML`: the content is editable from the admin panel, and
 * a stored-HTML path on a public page is an XSS vector that buys us nothing —
 * these documents only ever need headings, paragraphs and bullets.
 */

function renderBlocks(body: string) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return blocks.map((block, i) => {
    if (block.startsWith('## ')) {
      return <h2 key={i}>{block.slice(3).trim()}</h2>;
    }
    // A block whose every line is a bullet becomes a list.
    const lines = block.split('\n').map((l) => l.trim());
    if (lines.every((l) => l.startsWith('- '))) {
      return (
        <ul key={i}>
          {lines.map((l, j) => <li key={j}>{renderInline(l.slice(2))}</li>)}
        </ul>
      );
    }
    return <p key={i}>{renderInline(block.replace(/\n/g, ' '))}</p>;
  });
}

/** Only **bold** — enough for emphasis, nothing that can inject markup. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

export default function LegalPage({ title, body }: { title: string; body: string }) {
  return (
    <main className="legal">
      <h1>{title}</h1>
      {renderBlocks(body)}
      <p className="legal-footer">
        <a href="/">← KIBA</a>
      </p>

      <style>{`
        .legal {
          max-width: 680px;
          margin: 0 auto;
          padding: 64px 24px 96px;
          color: #cfe3f0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 15px;
          line-height: 1.7;
        }
        .legal h1 { font-size: 28px; color: #f0f9ff; margin: 0 0 20px; letter-spacing: -0.3px; }
        .legal h2 { font-size: 16px; color: #f0f9ff; margin: 32px 0 8px; }
        .legal p { margin: 0 0 14px; }
        .legal ul { margin: 0 0 14px; padding-left: 20px; }
        .legal li { margin-bottom: 6px; }
        .legal strong { color: #f0f9ff; }
        .legal a { color: #38bdf8; }
        .legal-footer { margin-top: 48px; font-size: 13px; }
      `}</style>
    </main>
  );
}
