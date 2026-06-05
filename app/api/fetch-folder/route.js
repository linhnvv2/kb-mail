import { NextResponse } from "next/server";
import { buildFolderImport } from "../../../lib/ingest.js";
import { saveImport } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Nạp kiến thức TỰ ĐỘNG: quét folder (mặc định Inbox/AI) qua Microsoft Graph
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const folder = body.folder || process.env.AI_FOLDER || "Inbox/AI";
    const days = parseInt(body.days || process.env.MAIL_DAYS || "30", 10);

    const payload = await buildFolderImport(folder, days);
    const file = saveImport(payload, folder);
    return NextResponse.json({ ok: true, file, folder, count: payload.threads.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
