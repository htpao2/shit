import { visit } from 'unist-util-visit';

function rehypeRewriteLinks(opts) {
  return function transformer(tree, file) {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a")
        return;
      const href = node.properties?.href;
      if (!href || href.startsWith("http"))
        return;
      if (opts.mode === "aggregate") {
        node.properties.href = `#${href.replace(/^\//, "")}`;
      } else {
        node.properties.href = `${href.replace(/^\//, "")}.md`;
      }
    });
  };
}

export { rehypeRewriteLinks };
