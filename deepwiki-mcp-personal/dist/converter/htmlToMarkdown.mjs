import { parseHTML } from 'linkedom';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { rehypeRewriteLinks } from '../lib/linkRewrite.mjs';
import { sanitizeSchema } from '../lib/sanitizeSchema.mjs';
import 'unist-util-visit';
import 'hast-util-sanitize';

async function htmlToMarkdown(html, mode) {
  const { document } = parseHTML("<!doctype html>");
  globalThis.document = document;
  const file = await unified().use(rehypeParse, { fragment: true }).use(rehypeSanitize, sanitizeSchema).use(rehypeRewriteLinks, { mode }).use(rehypeRemark).use(remarkGfm).use(remarkStringify, { fences: true, bullet: "-", rule: "-" }).process(html);
  return String(file);
}

export { htmlToMarkdown };
