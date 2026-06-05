#!/usr/bin/env node
// MCP server cho KB Mail — cho Claude Code (hoặc client MCP khác) tra cứu
// kho kiến thức, lịch sử hỗ trợ và thông tin job quét mail gắn cờ.
//
// Giao thức: JSON-RPC 2.0 qua stdio (mỗi message 1 dòng). Không thêm dependency.
// Cấu hình trong Claude Code: xem .mcp.json ở thư mục gốc project.
//
// LƯU Ý: stdout CHỈ dùng cho JSON-RPC. Mọi log phải ghi ra stderr.
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// store.js tính DATA_DIR theo process.cwd() lúc import → chuyển cwd về gốc project trước
process.chdir(ROOT);

const { getThreadsWithKb, getHistory } = await import("../lib/store.js");
const { matchKnowledge } = await import("../lib/match.js");

const log = (...a) => process.stderr.write("[kb-mail-mcp] " + a.join(" ") + "\n");

// ===== Lấy dữ liệu (đọc mới mỗi lần gọi để luôn phản ánh file hiện tại) =====
function kbThreads() {
  return getThreadsWithKb().threads;
}
function isKbEntry(t) {
  return (t.tags?.length || 0) > 0 || !!t.summary || !!t.solution;
}

// ===== Định nghĩa tool =====
const tools = [
  {
    name: "kb_search",
    description:
      "Tìm trong kho kiến thức theo từ khóa (tag + subject + tóm tắt). Trả về các luồng khớp nhất kèm điểm số, tag, tóm tắt và giải pháp.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khóa / câu hỏi cần tra cứu" },
        limit: { type: "number", description: "Số kết quả tối đa (mặc định 5)" },
      },
      required: ["query"],
    },
    run: ({ query, limit = 5 }) => {
      const msg = { subject: query, bodyText: query };
      return matchKnowledge(msg, kbThreads(), limit);
    },
  },
  {
    name: "kb_list",
    description:
      "Liệt kê các mục trong kho kiến thức (đã có tag/tóm tắt/giải pháp). Lọc tùy chọn theo tag.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Chỉ lấy mục có tag này (khớp một phần, không phân biệt hoa thường)" },
        limit: { type: "number", description: "Số mục tối đa (mặc định 30)" },
      },
    },
    run: ({ tag, limit = 30 }) => {
      let list = kbThreads().filter(isKbEntry);
      if (tag) {
        const q = tag.toLowerCase();
        list = list.filter((t) => (t.tags || []).some((x) => x.toLowerCase().includes(q)));
      }
      return list.slice(0, limit).map((t) => ({
        conversationId: t.conversationId,
        subject: t.subject,
        tags: t.tags || [],
        summary: t.summary || "",
        lastReceived: t.lastReceived || null,
      }));
    },
  },
  {
    name: "kb_get",
    description:
      "Lấy chi tiết một mục kiến thức theo conversationId: tag, tóm tắt, giải pháp và toàn bộ luồng mail.",
    inputSchema: {
      type: "object",
      properties: { conversationId: { type: "string" } },
      required: ["conversationId"],
    },
    run: ({ conversationId }) => {
      const t = kbThreads().find((x) => x.conversationId === conversationId);
      if (!t) return { error: "Không tìm thấy conversationId này" };
      return {
        conversationId: t.conversationId,
        subject: t.subject,
        tags: t.tags || [],
        summary: t.summary || "",
        solution: t.solution || "",
        participants: t.participants || [],
        messageCount: t.messageCount,
        messages: (t.messages || []).map((m) => ({
          from: m.from,
          to: m.to,
          cc: m.cc,
          receivedDateTime: m.receivedDateTime,
          subject: m.subject,
          bodyText: (m.bodyText || "").slice(0, 2000),
        })),
      };
    },
  },
  {
    name: "kb_tags",
    description: "Liệt kê tất cả tag trong kho kiến thức kèm số luồng dùng mỗi tag (giảm dần).",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      const counts = {};
      for (const t of kbThreads().filter(isKbEntry))
        for (const tag of t.tags || []) counts[tag] = (counts[tag] || 0) + 1;
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));
    },
  },
  {
    name: "history_search",
    description:
      "Tra cứu lịch sử hỗ trợ (mail đã gắn cờ + đề xuất). Lọc theo từ khóa (tiêu đề/người gửi/nội dung) và/hoặc trạng thái.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khóa trong subject/from/bodyPreview" },
        status: {
          type: "string",
          description: "Lọc theo trạng thái: pending | ai_drafted | approved | sent | dismissed",
        },
        limit: { type: "number", description: "Số kết quả tối đa (mặc định 20)" },
      },
    },
    run: ({ query, status, limit = 20 }) => {
      let items = Object.values(getHistory().items);
      if (status) items = items.filter((i) => i.status === status);
      if (query) {
        const q = query.toLowerCase();
        items = items.filter((i) =>
          [i.subject, i.from, i.bodyPreview].some((x) => (x || "").toLowerCase().includes(q))
        );
      }
      items.sort((a, b) => (b.receivedDateTime || "").localeCompare(a.receivedDateTime || ""));
      return items.slice(0, limit).map((i) => ({
        messageId: i.messageId,
        conversationId: i.conversationId,
        subject: i.subject,
        from: i.from,
        receivedDateTime: i.receivedDateTime,
        status: i.status,
        matchCount: (i.matches || []).length,
        topMatchTags: i.matches?.[0]?.tags || [],
      }));
    },
  },
  {
    name: "history_get",
    description: "Lấy chi tiết một mục lịch sử hỗ trợ theo messageId (gồm đề xuất khớp và nháp trả lời).",
    inputSchema: {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"],
    },
    run: ({ messageId }) => {
      const item = getHistory().items[messageId];
      if (!item) return { error: "Không tìm thấy messageId này" };
      return item;
    },
  },
  {
    name: "flag_status",
    description:
      "Thông tin lần quét mail gắn cờ gần nhất + thống kê lịch sử hỗ trợ (tổng số, theo trạng thái, theo tháng, số mail có kiến thức khớp).",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      const h = getHistory();
      const items = Object.values(h.items);
      const byStatus = {};
      const byMonth = {};
      let withKnowledge = 0;
      for (const i of items) {
        byStatus[i.status] = (byStatus[i.status] || 0) + 1;
        const m = (i.receivedDateTime || i.createdAt || "").slice(0, 7);
        if (m) byMonth[m] = (byMonth[m] || 0) + 1;
        if ((i.matches || []).length > 0) withKnowledge++;
      }
      return {
        lastJobRun: h.meta?.lastJobRun || null,
        lastFlaggedCount: h.meta?.lastFlaggedCount ?? null,
        owner: h.meta?.owner || null,
        total: items.length,
        withKnowledge,
        byStatus,
        byMonth: Object.fromEntries(Object.entries(byMonth).sort()),
      };
    },
  },
];

// ===== JSON-RPC qua stdio =====
const PROTOCOL_VERSION = "2024-11-05";
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const result = (id, res) => send({ jsonrpc: "2.0", id, result: res });
const error = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

function handle(req) {
  const { id, method, params } = req;
  // notification (không có id) → không trả lời
  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "kb-mail", version: "1.0.0" },
      });
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, {
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return error(id, -32602, `Tool không tồn tại: ${params?.name}`);
      try {
        const out = tool.run(params.arguments || {});
        return result(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        log("Lỗi tool", tool.name, e.message);
        return result(id, {
          isError: true,
          content: [{ type: "text", text: "Lỗi: " + e.message }],
        });
      }
    }
    default:
      return error(id, -32601, `Method không hỗ trợ: ${method}`);
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (e) {
      log("JSON không hợp lệ:", e.message);
    }
  }
});
process.stdin.on("end", () => process.exit(0));

log("MCP server sẵn sàng (root:", ROOT + ")");
