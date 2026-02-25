import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
// Increase body size limit to 8MB (Vercel default is 4MB)
export const dynamic = "force-dynamic";

/**
 * POST /api/upload-image
 * Accepts multipart/form-data with field "image".
 * Uploads to catbox.moe (free, anonymous, no API key).
 * Returns { url: "https://files.catbox.moe/..." }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Validate type
    const type = (file as File).type || "image/jpeg";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Max 10MB
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
    }

    // Upload to catbox.moe via their anonymous API
    const catboxForm = new FormData();
    catboxForm.append("reqtype", "fileupload");
    catboxForm.append("userhash", ""); // anonymous
    catboxForm.append(
      "fileToUpload",
      new Blob([bytes], { type }),
      (file as File).name || `upload.${type.split("/")[1] || "jpg"}`
    );

    const catboxRes = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: catboxForm,
    });

    if (!catboxRes.ok) {
      throw new Error(`catbox.moe returned ${catboxRes.status}`);
    }

    const catboxUrl = (await catboxRes.text()).trim();

    // catbox returns the URL directly as plain text
    if (!catboxUrl.startsWith("https://")) {
      throw new Error(`Unexpected catbox response: ${catboxUrl}`);
    }

    return NextResponse.json({ url: catboxUrl });
  } catch (err) {
    console.error("Image upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
