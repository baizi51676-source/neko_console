/**
 * Dependency-free markdown → HTML (escapes first), used for plugin README /
 * changelog panes. Deliberately small: headings, lists, code, quotes, tables,
 * links, emphasis.
 */

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '&#39;');
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
  );
  return out;
}

export function renderMarkdown(markdown: string | undefined | null): string {
  if (!markdown) return '';
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let list: '' | 'ul' | 'ol' = '';
  let inQuote = false;
  let tableBuf: string[] = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = '';
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push('</blockquote>');
      inQuote = false;
    }
  };
  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf
      .filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r))
      .map((r) =>
        r
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim()),
      );
    if (rows.length) {
      out.push('<table><thead><tr>');
      rows[0].forEach((c) => out.push(`<th>${inline(c)}</th>`));
      out.push('</tr></thead><tbody>');
      rows.slice(1).forEach((r) => {
        out.push('<tr>');
        r.forEach((c) => out.push(`<td>${inline(c)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table>');
    }
    tableBuf = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushTable();
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        closeQuote();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      closeQuote();
      tableBuf.push(line);
      continue;
    }
    flushTable();
    if (/^\s*$/.test(line)) {
      closeList();
      closeQuote();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      closeList();
      closeQuote();
      const level = Math.min(m[1].length, 4);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:[-*_])\s*(?:[-*_]\s*){2,}$/.test(line)) {
      closeList();
      closeQuote();
      out.push('<hr />');
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      closeList();
      if (!inQuote) {
        out.push('<blockquote>');
        inQuote = true;
      }
      out.push(`<p>${inline(m[1])}</p>`);
      continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      closeQuote();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      closeQuote();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    closeList();
    closeQuote();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushTable();
  if (inCode && codeBuf.length) out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  closeList();
  closeQuote();
  return out.join('\n');
}
