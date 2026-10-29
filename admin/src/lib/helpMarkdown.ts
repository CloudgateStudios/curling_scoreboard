import { Marked, type Tokens } from 'marked';

// The guides in docs/guides are written for GitHub, so the portal's help
// pages turn their links and headings into what GitHub would make of them.

const REPO_FILES = 'https://github.com/CloudgateStudios/curling_scoreboard/blob/main/';

/** A guide's address in the portal, from its file name: `run-a-bonspiel.md` is `/help/run-a-bonspiel`. */
export function guidePath(file: string): string {
  const slug = file.replace(/\.md$/, '');
  return slug === 'README' ? '/help' : `/help/${slug}`;
}

/**
 * Where a link in a guide goes. Another guide opens in the portal. Anything
 * else in the repo, such as the architecture docs, opens on GitHub.
 */
export function guideHref(href: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return href;
  const [path, hash] = href.split('#');
  if (/^[^/]+\.md$/.test(path)) return guidePath(path) + (hash ? `#${hash}` : '');
  const resolved = new URL(href, 'https://repo/docs/guides/');
  return REPO_FILES + resolved.pathname.slice(1) + resolved.hash;
}

/** The id GitHub gives a heading, so a link to `#a-bonspiel-screen` still lands. */
export function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The guide's title: its first `#` heading. */
export function guideTitle(markdown: string): string {
  return /^# (.+)$/m.exec(markdown)?.[1].trim() ?? '';
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** A guide as HTML. The guides are our own files, so the HTML is trusted. */
export function renderGuide(markdown: string): string {
  // GitHub numbers a repeated heading's id: -1, -2 and so on.
  const seen = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const html = this.parser.parseInline(tokens);
        const base = headingId(stripTags(html));
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        return `<h${depth} id="${escapeAttribute(id)}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const target = guideHref(href);
        const external = !target.startsWith('/') && !target.startsWith('#');
        const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
        const newTab = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeAttribute(target)}"${titleAttr}${newTab}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  return marked.parse(markdown, { async: false });
}
