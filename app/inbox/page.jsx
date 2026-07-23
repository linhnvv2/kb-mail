"use client";
// 📥 Inbox — mail chưa đọc (persist qua reload), so khớp KB, gợi ý trả lời (AI),
// gửi email trực tiếp, và tạo công việc. Kết quả quét + gợi ý được LƯU (inbox-cache.json).
import { useEffect, useState, useCallback } from "react";

export default function InboxPage() {
  const [data, setData] = useState({ items: [], count: 0, folder: "Inbox", fetchedAt: null, drafts: {}, sent: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [folder, setFolder] = useState("Inbox");
  const [auto, setAuto] = useState(false);
  const [interval, setIntervalMin] = useState(2);
  const [drafts, setDrafts] = useState({});   // messageId -> gợi ý (đã đồng bộ với cache)
  const [busy, setBusy] = useState({});
  const [openMap, setOpenMap] = useState({});
  const [allOpen, setAllOpen] = useState(false); // mặc định thu gọn cả danh sách
  const [taskDone, setTaskDone] = useState({});
  const [toMap, setToMap] = useState({});
  const [ccMap, setCcMap] = useState({});
  const [threads, setThreads] = useState({}); // messageId -> { loading, messages, open }

  // Load: mặc định lấy CACHE (persist); refresh=true để quét Graph mới
  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const url = refresh
        ? `/api/inbox?refresh=1&folder=${encodeURIComponent(folder)}`
        : `/api/inbox`;
      const r = await fetch(url);
      const out = await r.json();
      if (out.error) setError(out.error); // vẫn hiển thị cache kèm cảnh báo
      setData(out);
      setDrafts(out.drafts || {});
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [folder]);

  useEffect(() => { load(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      setAuto(localStorage.getItem("inboxAuto") === "1");
      setIntervalMin(parseInt(localStorage.getItem("inboxInterval") || "2", 10));
      setFolder(localStorage.getItem("inboxFolder") || "Inbox");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("inboxAuto", auto ? "1" : "0");
      localStorage.setItem("inboxInterval", String(interval));
      localStorage.setItem("inboxFolder", folder);
    } catch {}
    if (!auto) return;
    const id = setInterval(() => load(true), Math.max(1, interval) * 60000);
    return () => clearInterval(id);
  }, [auto, interval, folder, load]);

  async function suggest(item) {
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", messageId: item.messageId, folder }),
      });
      const out = await r.json();
      if (out.error) setError(out.error);
      else setDrafts((d) => ({ ...d, [item.messageId]: out.draft }));
    } catch (e) { setError(e.message); }
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  async function sendReply(item) {
    const draft = (drafts[item.messageId] || "").trim();
    if (!draft) { setError("Chưa có nội dung trả lời. Bấm 'Gợi ý trả lời' trước."); return; }
    if (!confirm(`Gửi trả lời vào luồng của ${item.from}?`)) return;
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          messageId: item.messageId,
          draft,
          to: toMap[item.messageId] || "",
          cc: ccMap[item.messageId] || "",
        }),
      });
      const out = await r.json();
      if (out.error) setError(out.error);
      else {
        setData((d) => ({ ...d, sent: { ...(d.sent || {}), [item.messageId]: out.sentAt } }));
      }
    } catch (e) { setError(e.message); }
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  async function loadThread(item) {
    const cur = threads[item.messageId];
    // toggle nếu đã load
    if (cur && cur.messages) {
      setThreads((t) => ({ ...t, [item.messageId]: { ...cur, open: !cur.open } }));
      return;
    }
    setThreads((t) => ({ ...t, [item.messageId]: { loading: true, open: true } }));
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "thread", messageId: item.messageId, conversationId: item.conversationId }),
      });
      const out = await r.json();
      if (out.error) { setError(out.error); setThreads((t) => ({ ...t, [item.messageId]: { loading: false, open: false } })); }
      else setThreads((t) => ({ ...t, [item.messageId]: { loading: false, open: true, messages: out.messages || [] } }));
    } catch (e) {
      setError(e.message);
      setThreads((t) => ({ ...t, [item.messageId]: { loading: false, open: false } }));
    }
  }

  async function hideItem(item) {
    if (!confirm(`Xóa mail "${item.subject || "(không tiêu đề)"}" khỏi danh sách Inbox? (không xóa mail thật trong Outlook)`)) return;
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    try {
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", messageId: item.messageId }),
      });
      setData((d) => ({ ...d, items: (d.items || []).filter((x) => x.messageId !== item.messageId) }));
    } catch (e) { setError(e.message); }
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  async function resolveItem(item) {
    if (!confirm(`Đánh dấu "${item.subject || "(không tiêu đề)"}" là ĐÃ XỬ LÝ?\nMail sẽ được chuyển vào Lịch sử hỗ trợ và gỡ khỏi Inbox.`)) return;
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", messageId: item.messageId }),
      });
      const out = await r.json();
      if (out.error) setError(out.error);
      else setData((d) => ({ ...d, items: (d.items || []).filter((x) => x.messageId !== item.messageId) }));
    } catch (e) { setError(e.message); }
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  async function createTask(item) {
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    try {
      const note = [
        item.bodyPreview ? `📩 Nội dung mail:\n${item.bodyPreview}` : "",
        drafts[item.messageId] ? `\n\n🤖 Gợi ý trả lời:\n${drafts[item.messageId]}` : "",
      ].join("").trim();
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.subject || "(mail không tiêu đề)",
          note, from: item.from, subject: item.subject,
          messageId: item.messageId, conversationId: item.conversationId, status: "todo",
        }),
      });
      const out = await r.json();
      if (out.error) setError(out.error);
      else setTaskDone((t) => ({ ...t, [item.messageId]: true }));
    } catch (e) { setError(e.message); }
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  const isOpen = (item) => openMap[item.messageId] ?? allOpen;
  const toggle = (item) => setOpenMap((m) => ({ ...m, [item.messageId]: !isOpen(item) }));
  const toggleAll = () => { setAllOpen((v) => !v); setOpenMap({}); };
  const isSent = (item) => !!(data.sent || {})[item.messageId];

  const items = data.items || [];

  return (
    <div>
      <h1>📥 Inbox — mail realtime + gợi ý trả lời</h1>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <button className="primary" disabled={loading} onClick={() => load(true)}>
          {loading ? "Đang tải..." : "🔄 Quét mail mới"}
        </button>
        <button className="ghost" disabled={loading} onClick={() => load(false)} title="Tải lại từ dữ liệu đã lưu (không gọi Outlook)">
          ♻️ Tải lại cache
        </button>
        <span className="muted">Folder:</span>
        <input type="text" style={{ width: 120 }} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Inbox" />
        <button className={auto ? "primary" : "ghost"} onClick={() => setAuto(!auto)} title="Tự quét lại theo chu kỳ (chỉ khi tab mở)">
          {auto ? "⏹ Tắt realtime" : "▶ Bật realtime"}
        </button>
        <span className="muted">mỗi</span>
        <select value={interval} onChange={(e) => setIntervalMin(parseInt(e.target.value, 10))} className="auto-select">
          <option value={1}>1 phút</option>
          <option value={2}>2 phút</option>
          <option value={5}>5 phút</option>
        </select>
        <button className="ghost" onClick={toggleAll} title="Thu gọn / mở rộng tất cả mail">
          {allOpen ? "▾ Thu gọn tất cả" : "▸ Mở tất cả"}
        </button>
        <span className="muted" style={{ marginLeft: "auto" }}>
          {data.fetchedAt ? `${data.count} mail · quét lúc ${new Date(data.fetchedAt).toLocaleString("vi-VN")}` : "Chưa quét lần nào"}
        </span>
      </div>

      {auto && (
        <div className="auto-banner">
          🟢 <b>Realtime đang BẬT</b> — tự quét mỗi {interval} phút.
          <span className="muted"> (chỉ chạy khi tab này đang mở)</span>
        </div>
      )}
      {error && <div className="notice">⚠️ {error}</div>}

      {items.length === 0 && !loading && (
        <div className="card">
          <p className="muted">Chưa có mail. Bấm "Quét mail mới" để lấy mail chưa đọc từ Outlook.</p>
        </div>
      )}

      {items.map((item) => (
        <div className="card" key={item.messageId} style={{ marginBottom: 14, opacity: isSent(item) ? 0.7 : 1 }}>
          <div className="row">
            <button className="ghost" style={{ padding: "2px 8px", fontSize: 13 }} onClick={() => toggle(item)}>
              {isOpen(item) ? "▾" : "▸"}
            </button>
            <h3 style={{ marginRight: 6, cursor: "pointer" }} onClick={() => toggle(item)}>
              {item.subject || "(không tiêu đề)"}
            </h3>
            {item.topScore > 0 && <span className="tag" title="Có kiến thức khớp">📚 khớp KB (điểm {item.topScore})</span>}
            {isSent(item) && <span className="tag" style={{ background: "#dcfce7", color: "#15803d" }}>✅ đã gửi</span>}
            {isOpen(item) ? (
              <>
                <button className="primary" style={{ marginLeft: "auto", padding: "5px 12px" }}
                  disabled={busy[item.messageId]} onClick={() => suggest(item)}
                  title="Sinh nội dung trả lời bằng AI dựa trên kho kiến thức">
                  {busy[item.messageId] ? "⏳..." : "🤖 Gợi ý trả lời"}
                </button>
                <button className="ghost" style={{ padding: "5px 12px", borderColor: taskDone[item.messageId] ? "#16a34a" : undefined, color: taskDone[item.messageId] ? "#15803d" : undefined }}
                  disabled={busy[item.messageId] || taskDone[item.messageId]} onClick={() => createTask(item)}
                  title="Lưu mail này thành task để xử lý sau">
                  {taskDone[item.messageId] ? "✅ Đã tạo task" : "🗂️ Tạo task"}
                </button>
                <button className="ghost" style={{ padding: "5px 12px" }}
                  disabled={threads[item.messageId]?.loading} onClick={() => loadThread(item)}
                  title="Xem toàn bộ luồng hội thoại (các mail trả lời qua lại)">
                  {threads[item.messageId]?.loading ? "⏳..." : `🧵 Xem luồng${threads[item.messageId]?.messages ? ` (${threads[item.messageId].messages.length})` : ""}`}
                </button>
                <button className="ghost" style={{ padding: "5px 12px", color: "#15803d", borderColor: "#bbf7d0" }}
                  disabled={busy[item.messageId]} onClick={() => resolveItem(item)}
                  title="Đánh dấu mail đã xử lý xong → chuyển vào Lịch sử hỗ trợ (rồi có thể nạp vào Kho kiến thức)">
                  ✅ Đã xử lý
                </button>
                <button className="ghost" style={{ padding: "5px 12px", color: "#b91c1c", borderColor: "#f3c7c7" }}
                  disabled={busy[item.messageId]} onClick={() => hideItem(item)}
                  title="Xóa mail khỏi danh sách Inbox (không xóa mail thật trong Outlook)">
                  🗑 Xóa
                </button>
              </>
            ) : (
              <button className="ghost" style={{ marginLeft: "auto", padding: "3px 10px", color: "#b91c1c" }}
                disabled={busy[item.messageId]} onClick={() => hideItem(item)} title="Xóa khỏi danh sách">🗑</button>
            )}
          </div>
          <div className="muted">Từ: <b>{item.from}</b> · {new Date(item.receivedDateTime).toLocaleString("vi-VN")}</div>
          {isOpen(item) && (item.to || []).length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>Đến: {(item.to || []).join(", ")}</div>
          )}
          {isOpen(item) && (item.cc || []).length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>CC: {(item.cc || []).join(", ")}</div>
          )}

          {isOpen(item) && (<>
            <hr className="sep" style={{ margin: "12px 0" }} />
            <span className="label" style={{ marginTop: 0 }}>📄 Nội dung mail</span>
            <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 0 }}>{item.bodyPreview}</p>

            {/* Luồng hội thoại — hiện GỌN trong khối riêng khi bật "Xem luồng" */}
            {threads[item.messageId]?.open && threads[item.messageId]?.messages && (
              <div style={{ marginTop: 12, background: "#f7f9fd", border: "1px solid #dbe4f3", borderRadius: 8, padding: 10 }}>
                <div className="row" style={{ alignItems: "center", marginBottom: 4 }}>
                  <b style={{ fontSize: 13 }}>🧵 Luồng hội thoại ({threads[item.messageId].messages.length} mail)</b>
                  <button className="ghost" style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px" }}
                    onClick={() => setThreads((t) => ({ ...t, [item.messageId]: { ...t[item.messageId], open: false } }))}>
                    ✕ Đóng luồng
                  </button>
                </div>
                {threads[item.messageId].messages.map((tm, i) => (
                  <div key={tm.messageId} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : "none", paddingTop: i > 0 ? 8 : 4, marginTop: i > 0 ? 8 : 0 }}>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <b>{tm.from}</b> · {new Date(tm.receivedDateTime).toLocaleString("vi-VN")}
                      {tm.messageId === item.messageId && <span className="tag" style={{ marginLeft: 6 }}>mail này</span>}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 3, maxHeight: 180, overflow: "auto" }}>
                      {tm.bodyText || "(trống)"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <span className="label">📚 Kiến thức khớp ({(item.matches || []).length})</span>
            {(item.matches || []).length === 0 && <p className="muted">Chưa khớp kiến thức.</p>}
            {(item.matches || []).map((m) => (
              <div className="msg" key={m.conversationId}>
                <div className="head">
                  <b>{m.subject}</b> <span className="badge-score">điểm {m.score}</span>{" "}
                  {(m.matchedTags || []).map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
                {m.summary && <div style={{ fontSize: 13 }}>📝 {m.summary}</div>}
                {m.solution && <div style={{ fontSize: 13, marginTop: 4 }}>✅ {m.solution}</div>}
              </div>
            ))}

            {drafts[item.messageId] !== undefined && (
              <div style={{ marginTop: 10 }}>
                <span className="label">🤖 Gợi ý trả lời (AI + kho kiến thức)</span>
                <textarea rows={8} style={{ width: "100%", fontSize: 13 }}
                  value={drafts[item.messageId]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [item.messageId]: e.target.value }))} />
                <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                  <label className="muted" style={{ fontSize: 12 }}>Thêm To:
                    <input type="text" style={{ marginLeft: 4, width: 180 }} placeholder="a@fpt.com, b@fpt.com"
                      value={toMap[item.messageId] || ""} onChange={(e) => setToMap((s) => ({ ...s, [item.messageId]: e.target.value }))} />
                  </label>
                  <label className="muted" style={{ fontSize: 12 }}>CC:
                    <input type="text" style={{ marginLeft: 4, width: 180 }} placeholder="sep@fpt.com"
                      value={ccMap[item.messageId] || ""} onChange={(e) => setCcMap((s) => ({ ...s, [item.messageId]: e.target.value }))} />
                  </label>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="primary" disabled={busy[item.messageId] || isSent(item)} onClick={() => sendReply(item)}
                    title="Gửi trả lời trực tiếp vào luồng mail qua Outlook">
                    {isSent(item) ? "✅ Đã gửi" : "📤 Gửi email"}
                  </button>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(drafts[item.messageId] || "")}>
                    📋 Copy
                  </button>
                </div>
              </div>
            )}
          </>)}
        </div>
      ))}
    </div>
  );
}
