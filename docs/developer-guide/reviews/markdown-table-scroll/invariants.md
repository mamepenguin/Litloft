# Invariants — markdown table scroll

## Touch points
- `createMarkdownRenderer` in `frontend/src/components/MarkdownPreview.tsx` (table_open / table_close render rules), shared by every MarkdownPreview caller (notes, intelligence DetailedSummarySection, Ask answers).
- `.markdown-body table` rules in `frontend/src/app/globals.css`.

## Invariants
1. At a phone width (393px), a markdown table wider than the reading column never makes the page scroll horizontally; the table scrolls horizontally inside its own container.
2. A table narrower than the column still spans the full column width (`width: 100%`).
3. Table vertical rhythm is unchanged: one `1em` margin above and below each table, not doubled.
4. The sanitizer still strips scripts/handlers; the wrapper adds no attribute beyond `class`.
5. Non-table markdown output (paragraphs, code, mermaid, wiki links, images) is byte-identical to before.
