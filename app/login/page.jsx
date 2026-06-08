"use client";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || "Đăng nhập thất bại");
      // chuyển về trang đích (next) hoặc trang chủ
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-logo" aria-hidden="true">📚</div>
        <div className="login-brand">KB Mail</div>
        <p className="muted" style={{ margin: "0 0 4px" }}>Đăng nhập để vào hệ thống quản lý kiến thức.</p>

        <span className="label">Tài khoản</span>
        <input
          type="text"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
        />

        <span className="label">Mật khẩu</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && <div className="notice" style={{ marginTop: 12 }}>{error}</div>}

        <button className="primary" type="submit" disabled={loading} style={{ marginTop: 14, width: "100%" }}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
