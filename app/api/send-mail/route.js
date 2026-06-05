import { NextResponse } from "next/server";
import { replyToMessage } from "../../../lib/graph.js";
import { getHistory, updateHistoryItem } from "../../../lib/store.js";
import { parseEmails } from "../../../lib/email.js";

export const dynamic = "force-dynamic";

// Gửi trả lời vào đúng luồng — CHỈ khi đã duyệt OK (status = approved)
export async function POST(req) {
  const { messageId, extraTo, cc } = await req.json();
  const item = getHistory().items[messageId];
  if (!item) return NextResponse.json({ error: "Không tìm thấy mail" }, { status: 404 });
  if (item.status !== "approved") {
    return NextResponse.json(
      { error: "Chưa duyệt OK — hãy bấm 'Duyệt OK' trước khi gửi." },
      { status: 400 }
    );
  }
  if (!item.draft?.trim()) {
    return NextResponse.json({ error: "Nội dung trả lời đang trống." }, { status: 400 });
  }
  const toList = parseEmails(extraTo);
  const ccList = parseEmails(cc);
  try {
    await replyToMessage(messageId, item.draft, { extraTo: toList, cc: ccList });
    updateHistoryItem(messageId, {
      status: "sent",
      sentAt: new Date().toISOString(),
      ...(toList.length && { extraTo: toList }),
      ...(ccList.length && { cc: ccList }),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
