import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "../../../../lib/session.js";
import { getGraphTokenStatus, setGraphToken } from "../../../../lib/settings.js";
import { getMyAddress } from "../../../../lib/graph.js";

export const dynamic = "force-dynamic";

// Lớp phòng vệ thứ hai (middleware đã chặn non-admin với /api/settings)
async function requireAdmin() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const sess = token ? await verifySession(token) : null;
  return sess && sess.role === "admin" ? sess : null;
}

// Thử gọi Graph /me để xác nhận token còn hiệu lực, trả về email tài khoản.
async function probeAccount() {
  try {
    const account = await getMyAddress();
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// GET: trạng thái token hiện tại (đã che) + tùy chọn ?test=1 để kiểm tra kết nối
export async function GET(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const status = getGraphTokenStatus();
  const wantTest = new URL(req.url).searchParams.get("test") === "1";
  const probe = wantTest && status.set ? await probeAccount() : null;
  return NextResponse.json({ status, probe });
}

// POST: cập nhật token, sau đó tự kiểm tra kết nối bằng Graph /me
export async function POST(req) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const { token } = await req.json();
  const clean = String(token || "").trim();
  if (!clean) return NextResponse.json({ error: "Token rỗng" }, { status: 400 });

  const status = setGraphToken(clean, admin.username);
  const probe = await probeAccount();
  return NextResponse.json({ ok: true, status, probe });
}
