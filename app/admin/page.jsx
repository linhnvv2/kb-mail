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

  async function load() {
    const res = await fetch("/api/users");
    const out = await res.json();
    if (!out.error) setUsers(out.users);
  }
  useEffect(() => { load(); }, []);

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

      <div className="card">
        <b>Danh sách tài khoản ({users.length})</b>
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
  );
}
