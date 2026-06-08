import { NextResponse } from "next/server";
import { getRules, saveRules } from "../../../lib/store.js";
import { parseEmails } from "../../../lib/email.js";

export const dynamic = "force-dynamic";

const ACTIONS = ["none", "draft", "reply"];

// Chuẩn hóa danh sách điều kiện: nhận mảng hoặc chuỗi "a, b" -> mảng đã trim, bỏ rỗng.
function toList(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRule(r, i) {
  const action = ACTIONS.includes(r?.action) ? r.action : "none";
  return {
    id: r?.id || `r_${Date.now().toString(36)}_${i}`,
    name: String(r?.name || "").trim() || `Rule ${i + 1}`,
    enabled: r?.enabled !== false,
    match: r?.match === "all" ? "all" : "any",
    conditions: {
      tags: toList(r?.conditions?.tags),
      subjectContains: toList(r?.conditions?.subjectContains),
      fromContains: toList(r?.conditions?.fromContains),
    },
    action,
    to: parseEmails(r?.to),
    cc: parseEmails(r?.cc),
    requireKnowledgeMatch: r?.requireKnowledgeMatch !== false,
    unflagAfterSend: r?.unflagAfterSend !== false,
  };
}

export async function GET() {
  return NextResponse.json(getRules());
}

// Ghi toàn bộ cấu hình rule + chu kỳ quét job nền.
export async function PUT(req) {
  const body = await req.json();
  const rules = Array.isArray(body?.rules) ? body.rules.map(normalizeRule) : [];
  saveRules({
    scanIntervalMinutes: body?.scanIntervalMinutes,
    scanSource: body?.scanSource,
    scanFolder: body?.scanFolder,
    rules,
  });
  return NextResponse.json({ ok: true, ...getRules() });
}
