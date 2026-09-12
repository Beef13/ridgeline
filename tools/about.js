/**
 * The About page's content, and the code that turns it into HTML.
 *
 * The page used to be hand-written HTML, which meant every copy change was a
 * code change and every code change risked the layout. Now the words live in
 * about.content.json and this module renders them, so the editor at
 * /about-editor.html only ever has to touch a JSON file — no HTML parsing, no
 * chance of a stray tag taking the page down.
 *
 * Substitution happens through Vite's transformIndexHtml, exactly as the
 * version number already does, so dev and the published build cannot disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CONTENT = resolve('about.content.json');

/* The colour tokens the page exposes, in the order they are written out. The
   editor reads this list too, so adding a colour here adds a picker there. */
export const COLOURS = [
  ['ground', 'Page background'],
  ['panel', 'Card background'],
  ['score', 'Accent (headings, links)'],
  ['faint', 'Body text'],
  ['fine', 'Quiet text, rules'],
  ['rule', 'Hairlines']
];

export function read() {
  return JSON.parse(readFileSync(CONTENT, 'utf8'));
}

export function write(data) {
  writeFileSync(CONTENT, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/* ---------------------------------------------------------------------------
 * Escaping.
 *
 * Everything from the JSON is escaped. That makes it impossible to break the
 * page by typing an angle bracket into the editor — which matters, because the
 * person typing is doing copywriting, not authoring markup.
 *
 * The one exception is links, because a studio page without them is not much
 * use. They are written in the markdown form [text](url) and nothing else is
 * interpreted, so the surface area stays one well-understood pattern.
 */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/* Only http(s) and page-relative targets. A javascript: URL typed into a link
   would otherwise become a live script in a file on disk. */
function safeHref(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[./#?]/.test(u) && !/^javascript:/i.test(u)) return u;
  return '';
}

export function rich(s) {
  return esc(s).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const href = safeHref(url.replace(/&amp;/g, '&'));
    if (!href) return text;
    const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${esc(href)}"${ext}>${text}</a>`;
  });
}

/* ---------------------------------------------------------------------------
 * Rendering.
 */

const IND = '      ';

function paragraphs(list) {
  return (list || [])
    .filter((p) => String(p).trim())
    .map((p) => `${IND}  <p>${rich(p)}</p>`)
    .join('\n');
}

function section(s) {
  const head = s.heading ? `${IND}  <h2>${esc(s.heading)}</h2>\n` : '';

  if (s.type === 'game') {
    const play = safeHref(s.playHref || './');
    return `${IND}<section>
${head}${IND}  <div class="game">
${IND}    <h3>${esc(s.name)}</h3>
${IND}    <p class="meta">${rich(s.meta)}</p>
${IND}    <p>${rich(s.blurb)}</p>
${play ? `${IND}    <a class="play" href="${esc(play)}">${esc(s.playLabel || 'Play')}</a>\n` : ''}${IND}  </div>
${IND}</section>`;
  }

  if (s.type === 'spec') {
    const rows = (s.rows || [])
      .filter((r) => String(r[0] || '').trim() || String(r[1] || '').trim())
      .map((r) => `${IND}    <dt>${rich(r[0])}</dt><dd>${rich(r[1])}</dd>`)
      .join('\n');
    const intro = s.intro ? `${IND}  <p>${rich(s.intro)}</p>\n` : '';
    return `${IND}<section>
${head}${intro}${IND}  <dl class="spec">
${rows}
${IND}  </dl>
${IND}</section>`;
  }

  return `${IND}<section>
${head}${paragraphs(s.paragraphs)}
${IND}</section>`;
}

export function body(d) {
  const mark = d.mark
    ? `${IND}<img class="mark" src="./${esc(d.mark)}" alt="" width="${Number(d.markWidth) || 96}" />\n\n`
    : '';
  const parts = (d.sections || []).map(section).join('\n\n');
  return `${mark}${IND}<h1>${esc(d.heading)}</h1>
${IND}<p class="line">${rich(d.pitch)}</p>

${parts}

${IND}<footer>${rich(d.footer)}</footer>`;
}

export function tokens(d) {
  const c = d.colours || {};
  return COLOURS
    .filter(([k]) => c[k])
    .map(([k, why]) => `        --${k}:${' '.repeat(Math.max(1, 8 - k.length))}${c[k]};${' '.repeat(Math.max(1, 10 - c[k].length))}/* ${why} */`)
    .join('\n');
}

/* The mark's rendered width also drives how much room the page leaves for it,
   so it is written as a token rather than baked into the img tag alone. */
export function render(html, d) {
  return html
    .replaceAll('__ABOUT_TITLE__', esc(d.title))
    .replaceAll('__ABOUT_DESCRIPTION__', esc(d.description))
    .replaceAll('__ABOUT_MARK_W__', String(Number(d.markWidth) || 96))
    .replace('__ABOUT_TOKENS__', tokens(d))
    .replace('__ABOUT_BODY__', body(d));
}
