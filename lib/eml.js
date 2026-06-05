// Parse file .eml (RFC 822 / MIME) về cùng chuẩn message như .msg và mail Graph.
// Tự thân, không thêm dependency — dùng Buffer + TextDecoder (Node hỗ trợ nhiều charset).
import { stripHtml, toIso, normalizeSubject } from "./msg.js";

// Giải mã chuỗi byte theo charset, fallback utf-8 → latin1 nếu charset lạ
function decodeCharset(buf, charset) {
  const cs = (charset || "utf-8").toLowerCase().replace(/^["']|["']$/g, "");
  try {
    return new TextDecoder(cs).decode(buf);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(buf);
    } catch {
      return buf.toString("latin1");
    }
  }
}

// quoted-printable -> Buffer (bytes), giữ nguyên byte để decode charset sau
function qpToBuffer(str, isHeader = false) {
  const s = str.replace(/=\r?\n/g, ""); // bỏ soft line break
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "=" && /[0-9A-Fa-f]{2}/.test(s.substr(i + 1, 2))) {
      out.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else if (isHeader && c === "_") {
      out.push(0x20); // '_' = space trong encoded-word
    } else {
      out.push(c.charCodeAt(0) & 0xff);
    }
  }
  return Buffer.from(out);
}

// Giải mã MIME encoded-word trong header: =?charset?B|Q?text?=
function decodeEncodedWords(value) {
  if (!value || !value.includes("=?")) return value || "";
  // gộp các encoded-word liền nhau (chỉ cách nhau bởi whitespace) theo RFC 2047
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, text) => {
      const buf =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : qpToBuffer(text, true);
      return decodeCharset(buf, charset);
    });
}

// Tách header (đã gỡ folding) và phần body thô của một entity MIME
function splitHeaderBody(raw) {
  const idx = raw.search(/\r?\n\r?\n/);
  const headRaw = idx === -1 ? raw : raw.slice(0, idx);
  const body = idx === -1 ? "" : raw.slice(idx).replace(/^\r?\n\r?\n/, "");
  // gỡ folding: dòng bắt đầu bằng space/tab nối tiếp dòng trước
  const unfolded = headRaw.replace(/\r?\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([!-9;-~]+):\s?(.*)$/); // tên header hợp lệ
    if (m) {
      const key = m[1].toLowerCase();
      if (headers[key] === undefined) headers[key] = m[2];
    }
  }
  return { headers, body };
}

function getParam(headerVal, name) {
  const m = (headerVal || "").match(new RegExp(name + '\\s*=\\s*"?([^";]+)"?', "i"));
  return m ? m[1].trim() : "";
}

function decodeBody(body, cte, charset) {
  const enc = (cte || "").toLowerCase();
  let buf;
  if (enc.includes("base64")) buf = Buffer.from(body.replace(/\s+/g, ""), "base64");
  else if (enc.includes("quoted-printable")) buf = qpToBuffer(body);
  else buf = Buffer.from(body, "latin1"); // 7bit/8bit/binary: giữ nguyên byte
  return decodeCharset(buf, charset);
}

// Đệ quy: trả về { plain, html } từ một entity MIME (gồm header + body)
function parseEntity(raw, depth = 0) {
  const { headers, body } = splitHeaderBody(raw);
  const ct = headers["content-type"] || "text/plain";
  const lower = ct.toLowerCase();

  if (lower.startsWith("multipart/") && depth < 8) {
    const boundary = getParam(ct, "boundary");
    if (!boundary) return { plain: "", html: "" };
    const out = { plain: "", html: "" };
    const sections = body.split("--" + boundary);
    for (const sec of sections.slice(1)) {
      if (/^--\s*\r?\n?/.test(sec)) break; // boundary kết thúc
      const part = sec.replace(/^\r?\n/, "");
      const sub = parseEntity(part, depth + 1);
      if (!out.plain && sub.plain) out.plain = sub.plain;
      if (!out.html && sub.html) out.html = sub.html;
    }
    return out;
  }

  const cte = headers["content-transfer-encoding"] || "";
  const charset = getParam(ct, "charset") || "utf-8";
  if (lower.startsWith("text/html"))
    return { plain: "", html: decodeBody(body, cte, charset) };
  if (lower.startsWith("text/plain") || (depth === 0 && !lower.startsWith("multipart")))
    return { plain: decodeBody(body, cte, charset), html: "" };
  return { plain: "", html: "" }; // đính kèm khác -> bỏ qua
}

// Lấy danh sách địa chỉ email từ header (To/Cc/From)
function parseAddresses(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => {
      const m = s.match(/<([^>]+)>/);
      return (m ? m[1] : s).trim();
    })
    .filter((a) => a.includes("@"));
}

// Parse 1 file .eml -> message chuẩn { id, receivedDateTime, from, to, cc, subject, bodyText, conversationTopic }
export function parseEml(arrayBuffer, fileName = "") {
  const raw = Buffer.from(arrayBuffer).toString("latin1"); // giữ byte thô, decode charset sau
  const { headers } = splitHeaderBody(raw);

  const subject =
    decodeEncodedWords(headers["subject"]) || "(không tiêu đề)";
  const fromList = parseAddresses(decodeEncodedWords(headers["from"]));
  const from = fromList[0] || decodeEncodedWords(headers["from"]).trim() || "";
  const to = parseAddresses(decodeEncodedWords(headers["to"]));
  const cc = parseAddresses(decodeEncodedWords(headers["cc"]));

  const { plain, html } = parseEntity(raw, 0);
  const bodyText = (plain && plain.trim()) || stripHtml(html) || "";

  const receivedDateTime = toIso(headers["date"]);

  return {
    id: (headers["message-id"] || "").replace(/^<|>$/g, "") || `eml:${fileName}`,
    receivedDateTime,
    from,
    to,
    cc,
    subject,
    bodyText,
    conversationTopic:
      decodeEncodedWords(headers["thread-topic"]) || normalizeSubject(subject),
  };
}
