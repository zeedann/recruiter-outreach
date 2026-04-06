import bleach

ALLOWED_TAGS = [
    "p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
    "span", "div", "table", "thead", "tbody", "tr", "td", "th", "hr",
]

ALLOWED_ATTRS = {
    "a": ["href", "target", "rel"],
    "*": ["class", "style"],
}


def sanitize_html(html: str) -> str:
    return bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
