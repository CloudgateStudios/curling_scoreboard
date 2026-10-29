import { guidePath, guideTitle } from './helpMarkdown';

// The guides for club admins, read from docs/guides when the portal is built,
// so the help pages always match the build they ship in. This uses Vite's
// import.meta.glob, so unlike the rest of src/lib it cannot run under Node's
// tests; the logic it uses is in helpMarkdown.ts.

const files = import.meta.glob<string>('../../../docs/guides/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export interface Guide {
  /** The file name without `.md`; `README` for the list of guides. */
  slug: string;
  title: string;
  path: string;
  markdown: string;
}

const guides = new Map<string, Guide>();
for (const [file, markdown] of Object.entries(files)) {
  const name = file.split('/').pop()!;
  const slug = name.replace(/\.md$/, '');
  guides.set(slug, { slug, title: guideTitle(markdown), path: guidePath(name), markdown });
}

/** The guide with this slug, or the list of guides with none. */
export function guideFor(slug: string | undefined): Guide | undefined {
  return guides.get(slug ?? 'README');
}

/** Every guide, in the order the list of guides gives them. */
export function allGuides(): Guide[] {
  const index = guides.get('README')?.markdown ?? '';
  const order = [...index.matchAll(/\]\(([^/)#]+)\.md\)/g)].map((m) => m[1]);
  return order.flatMap((slug) => guides.get(slug) ?? []);
}
