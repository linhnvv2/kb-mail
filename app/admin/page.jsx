"use client";
// Trang quản trị (chỉ admin): tạo/sửa/xóa tài khoản và gán quyền theo menu.
import { useEffect, useState } from "react";
import { MENUS } from "../../lib/menus.js";

const EMPTY = { username: "", password: "", name: "", role: "user", menus: [] };

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false); // đang sửa user có sẵn?
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Đổi mật khẩu của chính mình
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  // Cập nhật GRAPH_TOKEN
  const [gToken, setGToken] = useState("");
  const [gStatus, setGStatus] = useState(null);
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const [gTesting, setGTesting] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    const out = await res.json();
    if (!out.error) setUsers(out.users);
  }
  async function loadGraph() {
    const res = await fetch("/api/settings/graph-token");
    const out = await res.json();
    if (!out.error) setGStatus(out.status);
  }
  useEffect(() => { load(); loadGraph(); }, []);

  async function saveGraphToken(e) {
    e.preventDefault();
    setGMsg("");
    if (!gToken.trim()) { setGMsg("Lỗi: Token rỗng."); return; }
    setGBusy(true);
    try {
      const res = await fetch("/api/settings/graph-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: gToken.trim() }),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setGStatus(out.status);
      setGToken("");
      setGMsg(out.probe?.ok
        ? `✅ Đã lưu & kết nối OK (tài khoản: ${out.probe.account}).`
        : `⚠️ Đã lưu nhưng kết nối thất bại: ${out.probe?.error || "không rõ"}.`);
    } catch (err) {
      setGMsg("Lỗi: " + err.message);
    }
    setGBusy(false);
  }

  async function testGraphToken() {
    setGMsg("");
    setGTesting(true);
    try {
      const res = await fetch("/api/settings/graph-token?test=1");
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setGStatus(out.status);
      setGMsg(out.probe?.ok
        ? `✅ Kết nối OK (tài khoản: ${out.probe.account}).`
        : `❌ Kết nối thất bại: ${out.probe?.error || "không rõ"}.`);
    } catch (err) {
      setGMsg("Lỗi: " + err.message);
    }
    setGTesting(false);
  }

  function resetForm() {
    setForm(EMPTY);
    setEditing(false);
    setMsg("");
  }

  function editUser(u) {
    setForm({ username: u.username, password: "", name: u.name, role: u.role, menus: u.menus || [] });
    setEditing(true);
    setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleMenu(path) {
    setForm((f) => ({
      ...f,
      menus: f.menus.includes(path) ? f.menus.filter((m) => m !== path) : [...f.menus, path],
    }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setMsg(`Đã lưu tài khoản "${out.user.username}".`);
      resetForm();
      await load();
    } catch (err) {
      setMsg("Lỗi: " + err.message);
    }
    setBusy(false);
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg("");
    if (pw.next.length < 6) { setPwMsg("Lỗi: Mật khẩu mới tối thiểu 6 ký tự."); return; }
    if (pw.next !== pw.confirm) { setPwMsg("Lỗi: Xác nhận mật khẩu không khớp."); return; }
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setPwMsg("✅ Đã đổi mật khẩu.");
      setPw({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwMsg("Lỗi: " + err.message);
    }
    setPwBusy(false);
  }

  async function remove(username) {
    if (!confirm(`Xóa tài khoản "${username}"?`)) return;
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const out = await res.json();
    if (out.error) setMsg("Lỗi: " + out.error);
    else { await load(); if (form.username === username) resetForm(); }
  }

  const isAdminRole = form.role === "admin";

  return (
    <div>
      <h1>Quản trị tài khoản</h1>

      <form className="card" style={{ marginBottom: 14 }} onSubmit={save}>
        <b>{editing ? `✏️ Sửa: ${form.username}` : "➕ Tạo tài khoản mới"}</b>

        <div className="admin-grid" style={{ marginTop: 10 }}>
          <div>
            <span className="label" style={{ marginTop: 0 }}>Tên đăng nhập</span>
            <input
              type="text"
              value={form.username}
              disabled={editing}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="vd: linhnvv2"
            />
          </div>
          <div>
            <span className="label" style={{ marginTop: 0 }}>Tên hiển thị</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="vd: Nguyễn Văn A"
            />
          </div>
          <div>
            <span className="label" style={{ marginTop: 0 }}>Mật khẩu {editing && <span className="muted">(để trống = giữ nguyên)</span>}</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={editing ? "••••••" : "Mật khẩu"}
            />
          </div>
          <div>
            <span className="label" style={{ marginTop: 0 }}>Vai trò</span>
            <select
              className="admin-select"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="user">User (chỉ menu được gán)</option>
              <option value="admin">Admin (toàn quyền)</option>
            </select>
          </div>
        </div>

        <span className="label">Quyền truy cập menu</span>
        {isAdminRole ? (
          <p className="muted" style={{ margin: 0 }}>Admin tự động có toàn bộ menu + trang quản trị.</p>
        ) : (
          <div className="row">
            {MENUS.map((m) => (
              <label key={m.path} className={"menu-check" + (form.menus.includes(m.path) ? " on" : "")}>
                <input type="checkbox" checked={form.menus.includes(m.path)} onChange={() => toggleMenu(m.path)} />
                {m.label}
              </label>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Đang lưu..." : editing ? "💾 Cập nhật" : "➕ Tạo tài khoản"}
          </button>
          {editing && <button type="button" className="ghost" onClick={resetForm}>Hủy</button>}
        </div>
        {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
      </form>

      <form className="card" style={{ marginBottom: 14 }} onSubmit={changePassword}>
        <b>🔑 Đổi mật khẩu của tôi</b>
        <div className="admin-grid" style={{ marginTop: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <span className="label" style={{ marginTop: 0 }}>Mật khẩu hiện tại</span>
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              placeholder="Mật khẩu đang dùng"
              style={{ maxWidth: "calc(50% - 8px)" }}
            />
          </div>
          <div>
            <span className="label" style={{ marginTop: 0 }}>Mật khẩu mới</span>
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>
          <div>
            <span className="label" style={{ marginTop: 0 }}>Xác nhận mật khẩu mới</span>
            <input
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              placeholder="Nhập lại mật khẩu mới"
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={pwBusy}>
            {pwBusy ? "Đang đổi..." : "🔑 Đổi mật khẩu"}
          </button>
        </div>
        {pwMsg && <div className="notice" style={{ marginTop: 12 }}>{pwMsg}</div>}
      </form>

      <form className="card" style={{ marginBottom: 14 }} onSubmit={saveGraphToken}>
        <b>🔐 GRAPH_TOKEN (Microsoft Graph)</b>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Token truy cập Graph (delegated, scope Mail.Read / Mail.Send). Cập nhật ở đây có hiệu lực
          ngay, không cần khởi động lại. Lấy nhanh từ{" "}
          <a href="https://developer.microsoft.com/graph/graph-explorer" target="_blank" rel="noreferrer">Graph Explorer</a>.
        </p>

        <div className="notice" style={{ marginTop: 10 }}>
          {gStatus
            ? (gStatus.set
                ? <>Hiện tại: <code>{gStatus.masked}</code> · nguồn: <b>{gStatus.source === "settings" ? "đã cập nhật" : ".env"}</b>
                    {gStatus.updatedAt && <> · cập nhật: {new Date(gStatus.updatedAt).toLocaleString("vi-VN")}{gStatus.updatedBy ? ` bởi ${gStatus.updatedBy}` : ""}</>}</>
                : <span style={{ color: "#c0392b" }}>Chưa có token — Graph chưa hoạt động.</span>)
            : "Đang tải trạng thái…"}
        </div>

        <span className="label">Token mới</span>
        <textarea
          value={gToken}
          onChange={(e) => setGToken(e.target.value)}
          placeholder="Dán access token mới vào đây…"
          rows={4}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={gBusy}>
            {gBusy ? "Đang lưu…" : "💾 Lưu & kiểm tra"}
          </button>
          <button type="button" className="ghost" onClick={testGraphToken} disabled={gTesting || !gStatus?.set}>
            {gTesting ? "Đang kiểm tra…" : "🔌 Kiểm tra kết nối"}
          </button>
        </div>
        {gMsg && <div className="notice" style={{ marginTop: 12 }}>{gMsg}</div>}
      </form>

      <div className="card">
        <b>Danh sách tài khoản ({users.length})</b>
        <div className="table-scroll">
        <table className="user-table">
          <thead>
            <tr><th>Tài khoản</th><th>Tên</th><th>Vai trò</th><th>Menu được phép</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username}>
                <td><b>{u.username}</b></td>
                <td>{u.name}</td>
                <td>{u.role === "admin" ? <span className="tag">admin</span> : "user"}</td>
                <td>
                  {u.role === "admin"
                    ? <span className="muted">Toàn bộ</span>
                    : (u.menus.length
                        ? u.menus.map((p) => <span key={p} className="tag">{MENUS.find((m) => m.path === p)?.label || p}</span>)
                        : <span className="muted">(chưa gán)</span>)}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="ghost" onClick={() => editUser(u)}>Sửa</button>{" "}
                  <button className="ghost" style={{ color: "#c0392b" }} onClick={() => remove(u.username)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
