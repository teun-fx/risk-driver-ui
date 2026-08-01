import { NextResponse } from "next/server";

/**
 * PDF -> plain text, on the server. Extraction ran client-side first, but
 * pdf.js needs APIs (module workers, async-iterable ReadableStream) that
 * Safari and older Chromiums lack — the exact browsers people upload from.
 * Here it runs under Node, so every browser gets the same result.
 */
export const runtime = "nodejs";

/** 25 MB — a text-based report is well under this; a scan can exceed it. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) {
    return NextResponse.json({ error: "Empty upload." }, { status: 400 });
  }
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "PDF is larger than 25 MB — export a text-based report instead." },
      { status: 413 },
    );
  }

  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Node has no DOM worker; pdf.js falls back to its in-process worker.
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

    let out = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Regroup runs into lines by y — the trade-list parser is line-oriented.
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

    if (out.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            "This PDF has no text layer — it looks like a scan or an image export. Upload the report as HTML or CSV instead.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ text: out });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Could not read this PDF (${detail}).` },
      { status: 422 },
    );
  }
}
