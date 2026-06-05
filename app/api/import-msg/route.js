import { NextResponse } from "next/server";
import { parseMsg, threadsFromMessages } from "../../../lib/msg.js";
import { saveImport } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Nạp kiến thức THỦ CÔNG: nhận nhiều file .msg -> chuẩn hóa về JSON -> lưu import
export async function POST(req) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f) => typeof f.arrayBuffer === "function");
    if (files.length === 0) {
      return NextResponse.json({ error: "Không có file .msg nào được gửi lên" }, { status: 400 });
    }

    const messages = [];
    const errors = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        messages.push(parseMsg(buf, file.name));
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    if (messages.length === 0) {
      return NextResponse.json({ error: "Không đọc được file .msg nào. " + errors.join("; ") }, { status: 400 });
    }

    const threads = threadsFromMessages(messages);
    const payload = { exportedAt: new Date().toISOString(), folder: "MSG thủ công", threads };
    const out = saveImport(payload, "msg");
    return NextResponse.json({
      ok: true,
      file: out,
      count: threads.length,
      messages: messages.length,
      errors,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
