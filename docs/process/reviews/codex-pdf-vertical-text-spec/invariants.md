spec: docs/specs/pdf-vertical-text.md

## Revisions

I2. (r4) A page where non-whitespace characters in lines with direction (0, 1) do not outnumber those in lines with direction (1, 0) retains its existing horizontal Markdown and gains each vertical box whose normalized text is not already present; a page where the former outnumber the latter uses the complete pdfminer page text. Each component has a tolerance of 0.01, and other directions, including (0, -1), are ignored in both counts.

I10. (r5) A page containing text inside a PDF figure container recovers nested text boxes at any depth by the same predominant-vertical and mixed-page rules as top-level boxes, and indexes or reads them on that page.

I11. (r6) On a predominantly vertical page, text boxes inside figure containers, including horizontal chart labels, are included in the page text in depth-first pdfminer layout order, even when that differs from the visual reading order.
