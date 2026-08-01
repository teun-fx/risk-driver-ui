/**
 * PDF -> plain text, client-side, via pdf.js. Loaded dynamically so the
 * (large) engine is only fetched when someone actually uploads a PDF.
 *
 * Text items are regrouped into lines by their y-coordinate — pdf.js returns
 * unordered runs, and the trade-list parser downstream is line-oriented.
 */
export async function pdfToText(buf: ArrayBuffer): Promise<string> {
  // Legacy build: the modern one requires bleeding-edge APIs (module
  // workers, Promise.withResolvers) that Safari and slightly older Chromiums
  // don't have — the exact browsers users upload from.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) out += "\n";
      else if (out && !out.endsWith("\n")) out += " ";
      out += item.str;
      lastY = y;
    }
    out += "\n";
  }
  return out;
}
