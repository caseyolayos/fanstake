import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { json } = await req.json();
    if (!json || typeof json !== "string") {
      return NextResponse.json({ error: "Missing json field" }, { status: 400 });
    }

    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", new Blob([json], { type: "application/json" }), "metadata.json");

    const res = await fetch("https://catbox.moe/user.php", { method: "POST", body: form });
    if (!res.ok) {
      return NextResponse.json({ error: `catbox.moe error: ${res.status}` }, { status: 502 });
    }

    const url = (await res.text()).trim();
    if (!url.startsWith("https://")) {
      return NextResponse.json({ error: `Unexpected response: ${url}` }, { status: 502 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
