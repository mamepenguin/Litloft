export async function drawWord(
  container: HTMLElement,
  bytes: ArrayBuffer,
): Promise<() => void> {
  const { renderAsync } = await import("docx-preview");
  await renderAsync(bytes, container);

  for (const link of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("http://") || href.startsWith("https://")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }

  return () => {};
}
