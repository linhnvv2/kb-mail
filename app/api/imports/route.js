import { NextResponse } from "next/server";
import { listImports, saveImport } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ imports: listImports() });
}

// Nạp một file emails.json mới — luôn lưu thành file riêng trong data/imports
export async function POST(req) {
  const body = await req.json();
  if (!Array.isArray(body.threads)) {
    return NextResponse.json(
      { error: "File không đúng định dạng (thiếu mảng threads)" },
      { status: 400 }
    );
  }
  const file = saveImport(body, body.folder || "upload");
  return NextResponse.json({ ok: true, file, count: body.threads.length });
}
