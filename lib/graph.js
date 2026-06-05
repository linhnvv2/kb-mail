const GRAPH = "https://graph.microsoft.com/v1.0";

function token() {
  const t = process.env.GRAPH_TOKEN;
  if (!t) throw new Error("Thiếu GRAPH_TOKEN trong .env");
  return t;
}

async function graphFetch(url, options = {}) {
  const res = await fetch(url.startsWith("http") ? url : GRAPH + url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.body-content-type="text"',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.status === 202 || res.status === 204 ? null : res.json();
}

function mapRecipients(list) {
  return (list || []).map((r) => r.emailAddress?.address).filter(Boolean);
}

export function mapMessage(m) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    receivedDateTime: m.receivedDateTime,
    from: m.from?.emailAddress?.address || "",
    to: mapRecipients(m.toRecipients),
    cc: mapRecipients(m.ccRecipients),
    subject: m.subject || "",
    bodyText: (m.body?.content || m.bodyPreview || "").trim(),
  };
}

const SELECT =
  "$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,flag";

// Tìm folder theo tên (duyệt cả folder con cấp 1)
export async function findFolderId(name) {
  if (name.toLowerCase() === "inbox") return "inbox";
  const top = await graphFetch(`/me/mailFolders?$top=100`);
  for (const f of top.value) {
    if (f.displayName.toLowerCase() === name.toLowerCase()) return f.id;
  }
  for (const f of top.value) {
    if (f.childFolderCount > 0) {
      const children = await graphFetch(`/me/mailFolders/${f.id}/childFolders?$top=100`);
      for (const c of children.value) {
        if (c.displayName.toLowerCase() === name.toLowerCase()) return c.id;
      }
    }
  }
  throw new Error(`Không tìm thấy folder "${name}"`);
}

// Địa chỉ email của chủ hộp thư đang đăng nhập (để loại khỏi danh sách To khi reply)
export async function getMyAddress() {
  const me = await graphFetch(`/me?$select=mail,userPrincipalName`);
  return (me.mail || me.userPrincipalName || "").toLowerCase();
}

// Resolve folder theo đường dẫn phân cấp, vd "Inbox/AI" -> folder con "AI" trong Inbox
export async function findFolderByPath(pathStr) {
  const parts = pathStr.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return findFolderId(parts[0] || "Inbox");

  let parentId = null;
  for (const part of parts) {
    const list = parentId
      ? await graphFetch(`/me/mailFolders/${parentId}/childFolders?$top=100`)
      : await graphFetch(`/me/mailFolders?$top=100`);
    // Inbox là well-known folder, dùng id "inbox" để chắc chắn
    if (!parentId && part.toLowerCase() === "inbox") {
      parentId = "inbox";
      continue;
    }
    const found = list.value.find((f) => f.displayName.toLowerCase() === part.toLowerCase());
    if (!found) throw new Error(`Không tìm thấy folder "${part}" trong đường dẫn "${pathStr}"`);
    parentId = found.id;
  }
  return parentId;
}

export async function fetchFolderMessages(folderId, days) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let url = `/me/mailFolders/${folderId}/messages?${SELECT}&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=50`;
  const out = [];
  while (url) {
    const page = await graphFetch(url);
    out.push(...page.value.map(mapMessage));
    url = page["@odata.nextLink"] || null;
  }
  return out;
}

// Toàn bộ message cùng thread (full luồng), tìm trong mọi folder
export async function fetchConversation(conversationId) {
  const q = `/me/messages?${SELECT}&$filter=conversationId eq '${conversationId.replace(/'/g, "''")}'&$top=50`;
  const page = await graphFetch(q);
  return page.value
    .map(mapMessage)
    .sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
}

// Mail được đánh dấu cờ (flagged), sắp xếp mới nhất trước theo thời điểm nhận.
// Graph KHÔNG cho $orderby=receivedDateTime cùng $filter flag/flagStatus (lỗi 400),
// và thứ tự mặc định không theo ngày -> phải duyệt HẾT các trang rồi tự sắp xếp,
// nếu không mail mới nhất nằm ở trang sau sẽ bị bỏ sót.
export async function fetchFlaggedMessages() {
  let url = `/me/messages?${SELECT}&$filter=flag/flagStatus eq 'flagged'&$top=100`;
  const out = [];
  while (url) {
    const page = await graphFetch(url);
    out.push(...page.value.map(mapMessage));
    url = page["@odata.nextLink"] || null;
  }
  return out.sort((a, b) => (b.receivedDateTime || "").localeCompare(a.receivedDateTime || ""));
}

// Bỏ cờ một mail (flagStatus -> notFlagged)
export async function unflagMessage(messageId) {
  await graphFetch(`/me/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ flag: { flagStatus: "notFlagged" } }),
  });
}

// Trả lời một mail (reply giữ nguyên thread), có thể bổ sung người nhận / CC
export async function replyToMessage(messageId, comment, { extraTo = [], cc = [] } = {}) {
  const body = { comment };
  const message = {};
  if (extraTo.length) message.toRecipients = extraTo.map((a) => ({ emailAddress: { address: a } }));
  if (cc.length) message.ccRecipients = cc.map((a) => ({ emailAddress: { address: a } }));
  if (Object.keys(message).length) body.message = message;
  await graphFetch(`/me/messages/${messageId}/reply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Tạo nháp trả lời lưu vào Outlook (Drafts), có thể bổ sung To/CC — trả về draft (id, webLink)
export async function createReplyDraft(messageId, comment, { extraTo = [], cc = [] } = {}) {
  const body = { comment: comment || "" };
  const message = {};
  if (extraTo.length) message.toRecipients = extraTo.map((a) => ({ emailAddress: { address: a } }));
  if (cc.length) message.ccRecipients = cc.map((a) => ({ emailAddress: { address: a } }));
  if (Object.keys(message).length) body.message = message;
  return graphFetch(`/me/messages/${messageId}/createReply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Gửi mail mới
export async function sendMail({ to, subject, bodyText }) {
  await graphFetch(`/me/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: bodyText },
        toRecipients: to.map((a) => ({ emailAddress: { address: a } })),
      },
    }),
  });
}
