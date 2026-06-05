// Logic dùng chung cho nạp kiến thức TỰ ĐỘNG: quét 1 folder qua Graph,
// gom full luồng theo conversationId -> payload import chuẩn { exportedAt, folder, days, threads }
import { findFolderByPath, fetchFolderMessages, fetchConversation } from "./graph.js";
import { getThreadsWithKb } from "./store.js";

export async function buildFolderImport(folder, days, onProgress) {
  const folderId = await findFolderByPath(folder);
  const messages = await fetchFolderMessages(folderId, days);
  const convIds = [...new Set(messages.map((m) => m.conversationId))];

  // giữ lại tag/summary/solution cũ nếu luồng đã có trong kho
  const oldKb = Object.fromEntries(
    getThreadsWithKb().threads.map((t) => [t.conversationId, t])
  );

  const threads = [];
  for (const [i, cid] of convIds.entries()) {
    const msgs = await fetchConversation(cid);
    const first = msgs[0];
    threads.push({
      conversationId: cid,
      subject: (first?.subject || "").replace(/^(RE|FW|FWD):\s*/i, ""),
      participants: [...new Set(msgs.flatMap((m) => [m.from, ...m.to, ...m.cc]))],
      messageCount: msgs.length,
      lastReceived: msgs[msgs.length - 1]?.receivedDateTime,
      messages: msgs.map(({ id, receivedDateTime, from, to, cc, subject, bodyText }) => ({
        id, receivedDateTime, from, to, cc, subject, bodyText,
      })),
      tags: oldKb[cid]?.tags || [],
      summary: oldKb[cid]?.summary || "",
      solution: oldKb[cid]?.solution || "",
    });
    onProgress?.(i + 1, convIds.length, threads[threads.length - 1]);
  }

  return { exportedAt: new Date().toISOString(), folder, days, threads };
}
