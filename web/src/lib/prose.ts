export type Inline = string | { strong: string };

/**
 * The seed's markdown is paragraphs (blank-line separated) with `**bold**` runs — that is all
 * this renders, on purpose: no markdown dependency for two constructs. Line breaks inside a
 * paragraph are soft (joined with a space).
 */
export function proseBlocks(markdown: string): Inline[][] {
  return markdown
    .trim()
    .split(/\n[ \t]*\n/)
    .filter((para) => para.trim())
    .map((para) =>
      para
        .replace(/\s*\n\s*/g, ' ')
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map((part): Inline =>
          part.startsWith('**') && part.endsWith('**') ? { strong: part.slice(2, -2) } : part,
        ),
    );
}
