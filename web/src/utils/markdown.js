import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(md) {
  if (!md) return '';
  return marked.parse(String(md));
}
