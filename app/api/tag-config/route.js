import { NextResponse } from "next/server";
import { getTagConfig, saveTagConfig } from "../../../lib/store.js";
import { parseEmails } from "../../../lib/email.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getTagConfig());
}

// Cấu hình To/CC mặc định cho 1 tag. Gửi to/cc rỗng cả hai -> xóa cấu hình tag đó.
export async function POST(req) {
  const { tag, to, cc } = await req.json();
  if (!tag || !tag.trim()) {
    return NextResponse.json({ error: "Thiếu tên tag" }, { status: 400 });
  }
  const cfg = getTagConfig();
  const entry = { to: parseEmails(to), cc: parseEmails(cc) };
  if (!entry.to.length && !entry.cc.length) delete cfg[tag];
  else cfg[tag] = entry;
  saveTagConfig(cfg);
  return NextResponse.json({ ok: true, config: cfg });
}
