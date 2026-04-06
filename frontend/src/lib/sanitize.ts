import DOMPurify from "dompurify";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
      "span", "div", "table", "thead", "tbody", "tr", "td", "th", "hr",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  });
}
