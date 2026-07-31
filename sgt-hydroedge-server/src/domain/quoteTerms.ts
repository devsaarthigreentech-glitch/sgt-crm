// =====================================================================
// domain/quoteTerms.ts — terms as something a person can edit.
//
// The terms live in ERPNext as Quill markup: a <div class="ql-editor">
// wrapping an <ol> of <li> clauses, each with a throwaway <span> Quill
// uses for its own bullet rendering. Correct, and unreadable — asking a
// sales person to proofread a customer-facing contract through angle
// brackets is asking for a mistake nobody catches.
//
// So the screen edits TEXT and this module does the translating:
//
//   toText(html)   for the editor  — one clause per paragraph, **bold**
//   toHtml(text)   for the document — rebuilt as the same <ol> Quill made
//
// The round trip is deliberately lossy. Anything richer than bold and
// paragraphs is dropped, because anything richer has no business in a
// clause list and would otherwise survive as markup the next editor
// cannot see. What comes back out is always well-formed, whatever was
// pasted in.
//
// See also textToHtml in services/quoteMail.ts, which does the same job
// for the covering note. They are separate because the OUTPUT shapes
// differ — a mail is <p>, a terms list is <ol><li> — and merging them
// would mean a flag at every call site.
// =====================================================================

/** The stamp block appended under every set of terms. Configurable. */
const STAMP_URL = process.env.ERP_COMPANY_STAMP_URL?.trim() ?? '';
const END_LABEL = process.env.ERP_TERMS_END_LABEL?.trim() || 'End of Terms';

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘',
  '&ldquo;': '“', '&rdquo;': '”',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-zA-Z]+;|&#\d+;/g, m => {
      if (ENTITIES[m]) return ENTITIES[m];
      const num = /^&#(\d+);$/.exec(m);
      return num ? String.fromCharCode(Number(num[1])) : m;
    });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Stored terms -> what the editor shows.
 *
 * Blank in, blank out: a quotation with no terms must not acquire an
 * empty clause just by being opened.
 */
export function termsToText(html: string | null | undefined): string {
  const src = String(html ?? '');
  if (!src.trim()) return '';

  return decodeEntities(
    src
      // Quill's own scaffolding carries no meaning.
      .replace(/<span class="ql-ui"[^>]*>\s*<\/span>/gi, '')
      // Emphasis survives as markdown, so it can be edited and rebuilt.
      .replace(/<\s*(strong|b)\s*>/gi, '**')
      .replace(/<\s*\/\s*(strong|b)\s*>/gi, '**')
      // Anything that ends a block becomes a paragraph break.
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(li|p|div|h[1-6]|tr)\s*>/gi, '\n\n')
      // Everything else goes.
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Editor text -> the markup ERPNext stores and prints.
 *
 * One blank-line-separated block becomes one numbered clause, which is
 * exactly how the terms read on the page. A single newline inside a
 * block stays a line break within that clause.
 *
 * The Quill wrapper is reproduced rather than replaced with plain
 * <ul>/<p>: the existing "Quotation Terms and Conditions" template is
 * Quill markup, and two templates that render differently side by side
 * is a bug someone eventually has to chase.
 */
export function textToTerms(text: string | null | undefined): string {
  const blocks = String(text ?? '')
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  if (!blocks.length) return '';

  const items = blocks.map(block => {
    const body = esc(block)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    return `<li data-list="ordered"><span class="ql-ui" contenteditable="false"></span>${body}</li>`;
  });

  return `<div class="ql-editor read-mode"><ol>${items.join('')}</ol></div>`;
}

/**
 * Close the terms off, on the document itself.
 *
 * This was a separate block in the print format, which meant it floated
 * wherever the layout put it — usually not under the terms at all. Here
 * it is part of `terms`, so it is always the last thing after the last
 * clause, on any print format, including ones nobody has written yet.
 *
 * Applied at CREATION, never stored in the editable text. If it were
 * editable it would come back through toText() and be appended a second
 * time on the next edit.
 */
export function withTermsFooter(html: string): string {
  if (!html || !html.trim()) return html;

  const rule =
    `<div style="margin-top:16px;text-align:center;font-size:9pt;` +
    `letter-spacing:0.12em;text-transform:uppercase;color:#8a867c;">` +
    `— ${esc(END_LABEL)} —</div>`;

  const stamp = STAMP_URL
    ? `<div style="margin-top:10px;text-align:center;">` +
      `<img src="${esc(STAMP_URL)}" alt="" ` +
      `style="max-height:110px;max-width:210px;width:auto;"></div>`
    : '';

  return `${html}<div class="sgt-terms-end">${rule}${stamp}</div>`;
}
