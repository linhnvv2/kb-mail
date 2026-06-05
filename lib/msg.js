// Parse file Outlook .msg về cùng chuẩn JSON như mail lấy từ Graph
// (dùng cho luồng nạp kiến thức THỦ CÔNG: thả .msg -> chuẩn hóa -> lưu import)
import MsgReader from "@kenjiuno/msgreader";

function isSmtp(addr) {
  return typeof addr === "string" && addr.includes("@");
}

// Ưu tiên địa chỉ SMTP, tránh định dạng EX (/O=EXCHANGE.../CN=...)
function senderAddress(f) {
  return (
    f.senderSmtpAddress ||
    f.sentRepresentingSmtpAddress ||
    (isSmtp(f.senderEmail) ? f.senderEmail : "") ||
    f.senderName ||
    ""
  );
}

function recipAddress(r) {
  return r.smtpAddress || (isSmtp(r.email) ? r.email : "") || r.name || "";
}

export function stripHtml(html) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toIso(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Tách "Date:" từ raw transport headers nếu thiếu thuộc tính ngày
function dateFromHeaders(headers) {
  const m = (headers || "").match(/^Date:\s*(.+)$/im);
  return m ? toIso(m[1]) : null;
}

// Bỏ tiền tố RE/FW/FWD để gom luồng theo chủ đề
export function normalizeSubject(s) {
  return (s || "").replace(/^((RE|FW|FWD)\s*:\s*)+/i, "").trim();
}

// Parse 1 file .msg -> message chuẩn { id, receivedDateTime, from, to, cc, subject, bodyText, conversationTopic }
export function parseMsg(arrayBuffer, fileName = "") {
  const reader = new MsgReader(arrayBuffer);
  const f = reader.getFileData();
  if (f.error) throw new Error(`File .msg lỗi: ${f.error}`);

  const recips = f.recipients || [];
  const to = recips.filter((r) => r.recipType !== "cc" && r.recipType !== "bcc").map(recipAddress).filter(Boolean);
  const cc = recips.filter((r) => r.recipType === "cc").map(recipAddress).filter(Boolean);

  const receivedDateTime =
    toIso(f.messageDeliveryTime) ||
    toIso(f.clientSubmitTime) ||
    dateFromHeaders(f.headers) ||
    toIso(f.creationTime) ||
    null;

  const subject = f.subject || f.normalizedSubject || f.conversationTopic || "(không tiêu đề)";
  const bodyText = (f.body && f.body.trim()) || stripHtml(f.bodyHtml) || "";

  return {
    id: f.messageId || `msg:${fileName}`,
    receivedDateTime,
    from: senderAddress(f),
    to,
    cc,
    subject,
    bodyText,
    conversationTopic: f.conversationTopic || normalizeSubject(subject),
  };
}

// Gom nhiều message (.msg) thành các luồng theo conversationTopic
export function threadsFromMessages(messages) {
  const byTopic = new Map();
  for (const m of messages) {
    const key = m.conversationTopic || normalizeSubject(m.subject);
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(m);
  }

  const threads = [];
  for (const [topic, msgs] of byTopic) {
    msgs.sort((a, b) => (a.receivedDateTime || "").localeCompare(b.receivedDateTime || ""));
    const first = msgs[0];
    threads.push({
      conversationId: "msg:" + encodeURIComponent(topic).slice(0, 120),
      subject: normalizeSubject(first?.subject) || topic || "(không tiêu đề)",
      participants: [...new Set(msgs.flatMap((m) => [m.from, ...m.to, ...m.cc]).filter(Boolean))],
      messageCount: msgs.length,
      lastReceived: msgs[msgs.length - 1]?.receivedDateTime,
      messages: msgs.map(({ id, receivedDateTime, from, to, cc, subject, bodyText }) => ({
        id, receivedDateTime, from, to, cc, subject, bodyText,
      })),
      tags: [],
      summary: "",
      solution: "",
    });
  }
  return threads;
}
