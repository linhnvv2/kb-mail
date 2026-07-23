"use client";
// 🗂️ Công việc — danh sách task (tạo từ Inbox hoặc thủ công), quản lý theo trạng thái.
// 3 cột: todo (chờ) · doing (đang làm) · done (hoàn thành).
import { useEffect, useState } from "react";

const COLS = [
  { key: "todo", label: "📋 Chờ xử lý", color: "#92400e", bg: "#fef3c7" },
  { key: "doing", label: "🔨 Đang làm", color: "#6d28d9", bg: "#ede9fe" },
  { key: "done", label: "✅ Hoàn thành", color: "#15803d", bg: "#dcfce7" },
];

export default function TasksPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState({});
  const [noteEdit, setNoteEdit] = useState({});  // id -> đang mở ô thêm ghi chú
  const [noteVal, setNoteVal] = useState({});    // id -> nội dung ghi chú mới đang gõ

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/tasks");
      const out = await r.json();
      setItems(out.items || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addQuick() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
  }

  async function setStatus(task, status) {
    setBusy((b) => ({ ...b, [task.id]: true }));
    const r = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status }),
    });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [task.id]: false }));
  }

  async function addNote(task) {
    const text = (noteVal[task.id] || "").trim();
    if (!text) return;
    setBusy((b) => ({ ...b, [task.id]: true }));
    const r = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addNote", id: task.id, text }),
    });
    const out = await r.json();
    if (out.error) setError(out.error);
    else { setNoteVal((v) => ({ ...v, [task.id]: "" })); setNoteEdit((e) => ({ ...e, [task.id]: false })); }
    await load();
    setBusy((b) => ({ ...b, [task.id]: false }));
  }
  async function delNote(task, noteId) {
    if (!confirm("Xóa ghi chú này?")) return;
    setBusy((b) => ({ ...b, [task.id]: true }));
    const r = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteNote", id: task.id, noteId }),
    });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [task.id]: false }));
  }

  async function remove(task) {
    if (!confirm(`Chuyển "${task.title}" vào sọt rác?`)) return;
    setBusy((b) => ({ ...b, [task.id]: true }));
    const r = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [task.id]: false }));
  }

  async function restore(task) {
    setBusy((b) => ({ ...b, [task.id]: true }));
    const r = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", id: task.id }),
    });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [task.id]: false }));
  }

  async function purge(task) {
    if (!confirm(`Xóa VĨNH VIỄN "${task.title}"? Không khôi phục được.`)) return;
    setBusy((b) => ({ ...b, [task.id]: true }));
    const r = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}&purge=1`, { method: "DELETE" });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [task.id]: false }));
  }

  async function emptyTrash() {
    if (!confirm("Dọn sạch sọt rác? Xóa vĩnh viễn tất cả công việc trong sọt rác.")) return;
    const r = await fetch("/api/tasks?emptyTrash=1", { method: "DELETE" });
    const out = await r.json();
    if (out.error) setError(out.error);
    await load();
  }

  const active = items.filter((t) => !t.deleted);
  const trash = items.filter((t) => t.deleted);
  const byStatus = (s) => active.filter((t) => t.status === s);
  const counts = { todo: byStatus("todo").length, doing: byStatus("doing").length, done: byStatus("done").length };
  const [showTrash, setShowTrash] = useState(false);

  // ===== Drag & drop =====
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  function onDragStart(e, task) {
    setDragId(task.id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", task.id); } catch {}
  }
  function onDragEnd() { setDragId(null); setOverCol(null); }
  function onDragOver(e, colKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overCol !== colKey) setOverCol(colKey);
  }
  async function onDrop(e, colKey) {
    e.preventDefault();
    const id = dragId || (() => { try { return e.dataTransfer.getData("text/plain"); } catch { return null; } })();
    setOverCol(null);
    setDragId(null);
    if (!id) return;
    const task = items.find((t) => t.id === id);
    if (!task || task.status === colKey) return;
    // optimistic UI
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status: colKey } : t)));
    await setStatus(task, colKey);
  }

  return (
    <div>
      <h1>🗂️ Task</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          type="text"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="Thêm công việc nhanh... (Enter để lưu)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addQuick()}
        />
        <button className="primary" onClick={addQuick}>+ Thêm</button>
        <button className="ghost" disabled={loading} onClick={load}>{loading ? "..." : "🔄 Tải lại"}</button>
        <span className="muted" style={{ marginLeft: "auto" }}>
          Chờ {counts.todo} · Đang làm {counts.doing} · Xong {counts.done}
        </span>
      </div>
      {error && <div className="notice">⚠️ {error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {COLS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDrop={(e) => onDrop(e, col.key)}
            style={{
              borderRadius: 8,
              padding: 4,
              transition: "background .15s",
              background: overCol === col.key ? "#eef4ff" : "transparent",
              outline: overCol === col.key ? "2px dashed #7ea6ff" : "2px dashed transparent",
            }}
          >
            <div style={{ background: col.bg, color: col.color, borderRadius: 8, padding: "8px 12px", fontWeight: 700, marginBottom: 10 }}>
              {col.label} ({byStatus(col.key).length})
            </div>
            {byStatus(col.key).length === 0 && (
              <p className="muted" style={{ fontSize: 13, textAlign: "center", padding: 10 }}>
                {overCol === col.key ? "Thả vào đây" : "Chưa có"}
              </p>
            )}
            {byStatus(col.key).map((t) => (
              <div
                className="card"
                key={t.id}
                draggable
                onDragStart={(e) => onDragStart(e, t)}
                onDragEnd={onDragEnd}
                style={{ marginBottom: 10, padding: 12, cursor: "grab", opacity: dragId === t.id ? 0.4 : 1 }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  <span className="muted" style={{ cursor: "grab", marginRight: 4 }} title="Kéo để đổi trạng thái">⠿</span>
                  {t.title}
                </div>
                {t.subject && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    ✉️ {t.subject}{t.from ? ` — ${t.from}` : ""}
                  </div>
                )}
                {/* Nội dung gốc (từ mail) — CHỈ ĐỌC, không sửa */}
                {t.note && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>📩 Nội dung gốc (từ mail)</summary>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#334", maxHeight: 160, overflow: "auto", background: "#f8fafc", borderRadius: 6, padding: "6px 8px", marginTop: 4 }}>
                      {t.note}
                    </div>
                  </details>
                )}

                {/* Ghi chú riêng (nhiều mục, mỗi mục độc lập) */}
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>📝 Ghi chú ({(t.notes || []).length})</div>
                  {(t.notes || []).map((n) => (
                    <div key={n.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, background: "#fffef5", border: "1px solid #f0e8c8", borderRadius: 6, padding: "5px 8px", marginTop: 4 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
                        <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{new Date(n.at).toLocaleString("vi-VN")}</div>
                      </div>
                      <button className="ghost" style={{ fontSize: 11, padding: "1px 6px", color: "#b91c1c" }} disabled={busy[t.id]} onClick={() => delNote(t, n.id)} title="Xóa ghi chú này">✕</button>
                    </div>
                  ))}
                  {noteEdit[t.id] ? (
                    <div style={{ marginTop: 4 }}>
                      <textarea
                        rows={2}
                        style={{ width: "100%", fontSize: 12 }}
                        placeholder="Nhập ghi chú mới..."
                        value={noteVal[t.id] ?? ""}
                        onChange={(e) => setNoteVal((v) => ({ ...v, [t.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote(t); }}
                      />
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <button className="primary" style={{ fontSize: 12, padding: "3px 8px" }} disabled={busy[t.id]} onClick={() => addNote(t)}>➕ Thêm ghi chú</button>
                        <button className="ghost" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => setNoteEdit((e) => ({ ...e, [t.id]: false }))}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <button className="ghost" style={{ fontSize: 11, padding: "2px 8px", marginTop: 4 }} onClick={() => setNoteEdit((e) => ({ ...e, [t.id]: true }))}>
                      ➕ Thêm ghi chú
                    </button>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Tạo {new Date(t.createdAt).toLocaleString("vi-VN")}
                  {t.doneAt ? ` · Xong ${new Date(t.doneAt).toLocaleString("vi-VN")}` : ""}
                </div>
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  {col.key !== "todo" && (
                    <button className="ghost" style={{ fontSize: 12, padding: "3px 8px" }} disabled={busy[t.id]} onClick={() => setStatus(t, "todo")}>← Chờ</button>
                  )}
                  {col.key !== "doing" && (
                    <button className="ghost" style={{ fontSize: 12, padding: "3px 8px" }} disabled={busy[t.id]} onClick={() => setStatus(t, "doing")}>🔨 Đang làm</button>
                  )}
                  {col.key !== "done" && (
                    <button className="primary" style={{ fontSize: 12, padding: "3px 8px" }} disabled={busy[t.id]} onClick={() => setStatus(t, "done")}>✅ Xong</button>
                  )}
                  <button className="ghost" style={{ fontSize: 12, padding: "3px 8px", marginLeft: "auto", color: "#b91c1c" }} disabled={busy[t.id]} onClick={() => remove(t)} title="Chuyển vào sọt rác">🗑</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ===== Sọt rác ===== */}
      <div style={{ marginTop: 20 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <button className="ghost" onClick={() => setShowTrash((v) => !v)}>
            🗑️ Sọt rác ({trash.length}) {showTrash ? "▾" : "▸"}
          </button>
          {trash.length > 0 && showTrash && (
            <button className="ghost" style={{ color: "#b91c1c" }} onClick={emptyTrash}>
              🧹 Dọn sạch sọt rác
            </button>
          )}
        </div>
        {showTrash && (
          <div style={{ marginTop: 10 }}>
            {trash.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sọt rác trống.</p>}
            {trash.map((t) => (
              <div className="card" key={t.id} style={{ marginBottom: 8, padding: 10, opacity: 0.85 }}>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, textDecoration: "line-through", color: "#64748b" }}>{t.title}</div>
                    {t.subject && <div className="muted" style={{ fontSize: 12 }}>✉️ {t.subject}</div>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Đã xóa {t.deletedAt ? new Date(t.deletedAt).toLocaleString("vi-VN") : ""}
                    </div>
                  </div>
                  <button className="primary" style={{ fontSize: 12, padding: "4px 10px" }} disabled={busy[t.id]} onClick={() => restore(t)}>♻️ Khôi phục</button>
                  <button className="ghost" style={{ fontSize: 12, padding: "4px 10px", color: "#b91c1c" }} disabled={busy[t.id]} onClick={() => purge(t)}>❌ Xóa hẳn</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
