/**
 * A long PDF for the Pages rail: US Letter portrait pages, one of them
 * landscape, each carrying its number as real text. `outline` adds a
 * two-entry document outline; `near` makes page 10 1.9% and page 11 2.1%
 * taller than the first page, either side of the rail's 2% tolerance.
 */

export const LONG_PDF_PAGES = 225;
export const LANDSCAPE_PAGE = 9;

const PORTRAIT = [612, 792] as const;

export const NEAR_PAGES = { 10: 1.019, 11: 1.021 } as const;

export function buildLongPdf({
  pages = LONG_PDF_PAGES,
  landscape = LANDSCAPE_PAGE,
  outline = false,
  near = false,
}: {
  pages?: number;
  landscape?: number;
  outline?: boolean;
  near?: boolean;
} = {}): Uint8Array {
  const objects: string[] = [""];
  const pageObject = (page: number) => 4 + (page - 1) * 2;
  const outlineRoot = 4 + pages * 2;

  objects[1] = outline
    ? `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R >>`
    : "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const kids: string[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const stretch = near ? (NEAR_PAGES as Record<number, number>)[page] : undefined;
    const [width, height] =
      page === landscape
        ? [PORTRAIT[1], PORTRAIT[0]]
        : stretch
          ? [PORTRAIT[0], +(PORTRAIT[1] * stretch).toFixed(2)]
          : PORTRAIT;
    const content = `BT /F1 48 Tf 72 ${height - 120} Td (Page ${page}) Tj ET`;
    kids.push(`${pageObject(page)} 0 R`);
    objects[pageObject(page)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObject(page) + 1} 0 R >>`;
    objects[pageObject(page) + 1] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages} >>`;

  if (outline) {
    const first = outlineRoot + 1;
    const second = outlineRoot + 2;
    objects[outlineRoot] = `<< /Type /Outlines /First ${first} 0 R /Last ${second} 0 R /Count 2 >>`;
    objects[first] =
      `<< /Title (Part I) /Parent ${outlineRoot} 0 R /Next ${second} 0 R ` +
      `/Dest [${pageObject(1)} 0 R /Fit] >>`;
    objects[second] =
      `<< /Title (Part II) /Parent ${outlineRoot} 0 R /Prev ${first} 0 R ` +
      `/Dest [${pageObject(100)} 0 R /Fit] >>`;
  }

  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let object = 1; object < objects.length; object += 1) {
    offsets[object] = output.length;
    output += `${object} 0 obj\n${objects[object]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let object = 1; object < objects.length; object += 1) {
    output += `${String(offsets[object]).padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}
