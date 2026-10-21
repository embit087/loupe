import { Fragment, type ReactNode } from "react";

// A small, safe Markdown renderer for provider text (news summaries): headings, paragraphs,
// lists, quotes, rules, and inline bold, italic, code and http(s) links. Raw HTML is never rendered.

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "rule" };

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function parse(source: string, dropTitle?: string): Block[] {
  const blocks: Block[] = [];
  const title = dropTitle ? normalize(dropTitle) : "";
  // Outlets append their name after "｜", "|" or " - "; a repeat of the core headline counts too.
  const titleCore = dropTitle ? normalize(dropTitle.split(/\s*[｜|]\s*|\s+[-–—]\s+/)[0]) : "";
  const isTitle = (value: string) => {
    const text = normalize(value.replace(/^#{1,6}\s+/, ""));
    return Boolean(title) && (text === title || text === titleCore || normalize(value.split(/\s*[｜|]\s*|\s+[-–—]\s+/)[0]) === titleCore);
  };
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph }); paragraph = []; };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    // Providers repeat the headline (often under a "Story" label); the card already shows it.
    if (line && isTitle(line)) continue;
    if (!line) { flush(); continue; }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      if (!(title && !blocks.length && /^story$/i.test(heading[1].trim()))) blocks.push({ type: "heading", text: heading[1] });
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(line)) { flush(); blocks.push({ type: "rule" }); continue; }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const last = blocks.at(-1);
      const text = (bullet ?? numbered)![1];
      if (last?.type === "list" && last.ordered === ordered) last.items.push(text);
      else blocks.push({ type: "list", ordered, items: [text] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      const last = blocks.at(-1);
      if (last?.type === "quote") last.lines.push(quote[1]);
      else blocks.push({ type: "quote", lines: [quote[1]] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

const inlinePattern = /!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\s][^*]*)\*|(?<![\p{L}\p{N}])_([^_\s][^_]*)_(?![\p{L}\p{N}])/gu;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [, imageAlt, linkText, linkUrl, bold, boldAlt, code, italic, italicAlt] = match;
    const key = nodes.length;
    if (imageAlt !== undefined) { if (imageAlt) nodes.push(imageAlt); }
    else if (linkText !== undefined) nodes.push(<a key={key} href={linkUrl} target="_blank" rel="noopener noreferrer">{linkText}</a>);
    else if (bold ?? boldAlt) nodes.push(<strong key={key}>{bold ?? boldAlt}</strong>);
    else if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
    else nodes.push(<em key={key}>{italic ?? italicAlt}</em>);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownText({ source, dropTitle, className }: { source: string; dropTitle?: string; className?: string }) {
  const blocks = parse(source, dropTitle);
  return <div className={`markdown-text${className ? ` ${className}` : ""}`}>
    {blocks.map((block, index) => {
      if (block.type === "heading") return <h4 key={index}>{inline(block.text)}</h4>;
      if (block.type === "rule") return <hr key={index} />;
      if (block.type === "list") {
        const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>);
        return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
      }
      const content = block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</Fragment>);
      return block.type === "quote" ? <blockquote key={index}>{content}</blockquote> : <p key={index}>{content}</p>;
    })}
  </div>;
}
