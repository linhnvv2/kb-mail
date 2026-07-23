"use client";
// Hỗ trợ trả lời: mail gắn cờ → kiến thức khớp → AI chat → duyệt OK → gửi mail
import { useEffect, useState } from "react";

function StatusBadge({ status }) {
  const map = {
    pending: ["⏳ Chờ xử lý", "#92400e", "#fef3c7"],
    ai_drafted: ["🤖 AI đã xử lý", "#6d28d9", "#ede9fe"],
    approved: ["✔ Đã duyệt OK", "#1d4ed8", "#e3edff"],
    sent: ["✅ Đã gửi", "#15803d", "#dcfce7"],
  };
  const [label, color, bg] = map[status] || map.pending;
  return (
    <span style={{ background: bg, color, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function ChatPanel({ item }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(q) {
    const question = (q || input).trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((ms) => [...ms, { role: "user", content: question }]);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.messageId, question, chatHistory: messages }),
    });
    const out = await res.json();
    setMessages((ms) => [...ms, { role: "assistant", content: out.answer || "⚠️ " + out.error }]);
    setBusy(false);
  }

  return (
    <div style={{ background: "#f7f9fd", border: "1px solid #dbe4f3", borderRadius: 8, padding: 10, marginTop: 8 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <b style={{ fontSize: 13 }}>💬 AI chat — hỏi đáp dựa trên các lần hỗ trợ trước</b>
        <button className="ghost" style={{ fontSize: 12, padding: "3px 10px" }} disabled={busy}
          onClick={() => ask("Dựa vào các lần hỗ trợ trước, hãy soạn nội dung mail trả lời phù hợp cho email này.")}>
          ✍️ Soạn mail trả lời
        </button>
        <button className="ghost" style={{ fontSize: 12, padding: "3px 10px" }} disabled={busy}
          onClick={() => ask("Vấn đề này đã từng được hỗ trợ như thế nào trước đây? Tóm tắt cách xử lý.")}>
          🔎 Đã xử lý thế nào?
        </button>
      </div>
      {messages.map((m, i) => (
        <div key={i} style={{ margin: "6px 0", fontSize: 13 }}>
          <b>{m.role === "user" ? "Bạn" : "AI"}:</b>{" "}
          <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
          {m.role === "assistant" && !m.content.startsWith("⚠️") && (
            <div>
              <button className="ghost" style={{ fontSize: 12, padding: "2px 8px", marginTop: 3 }}
                onClick={() => item.onUseAsDraft(m.content)}>
                ⬇ Dùng làm nội dung trả lời
              </button>
            </div>
          )}
        </div>
      ))}
      {busy && <div className="muted" style={{ fontSize: 13 }}>AI đang trả lời...</div>}
      <div className="row" style={{ marginTop: 6 }}>
        <input
          type="text"
          placeholder="Hỏi AI về cách xử lý, các case tương tự trước đó..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="primary" disabled={busy} onClick={() => ask()}>Gửi</button>
      </div>
    </div>
  );
}

export default function SuggestionsPage() {
  const [data, setData] = useState({ meta: {}, items: {} });
  const [running, setRunning] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [extraTo, setExtraTo] = useState({});
  const [cc, setCc] = useState({});
  const [tagCfg, setTagCfg] = useState({});
  const [allOpen, setAllOpen] = useState(true);
  const [openMap, setOpenMap] = useState({});
  const [autoMode, setAutoMode] = useState(false);
  const [autoInterval, setAutoInterval] = useState(5);
  const [autoBatch, setAutoBatch] = useState(3);
  const [autoStatus, setAutoStatus] = useState("");
  const [taskDone, setTaskDone] = useState({}); // messageId -> đã tạo task

  async function createTask(item) {
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    try {
      const draftText = draftFor(item);
      const note = [
        item.bodyPreview ? `📩 Nội dung mail:\n${item.bodyPreview}` : "",
        draftText ? `\n\n✉️ Nội dung trả lời:\n${draftText}` : "",
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

  async function load() {
    const [s, t] = await Promise.all([
      fetch("/api/suggestions").then((r) => r.json()),
      fetch("/api/tag-config").then((r) => r.json()),
    ]);
    setData(s);
    setTagCfg(t || {});
  }
  useEffect(() => { load(); }, []);

  // Khôi phục cấu hình tự động đã lưu
  useEffect(() => {
    try {
      setAutoMode(localStorage.getItem("autoMode") === "1");
      setAutoInterval(parseInt(localStorage.getItem("autoInterval") || "5", 10));
      setAutoBatch(parseInt(localStorage.getItem("autoBatch") || "3", 10));
    } catch {}
  }, []);

  // Chế độ tự động: quét + soạn nháp định kỳ (chạy khi trang đang mở)
  useEffect(() => {
    try {
      localStorage.setItem("autoMode", autoMode ? "1" : "0");
      localStorage.setItem("autoInterval", String(autoInterval));
      localStorage.setItem("autoBatch", String(autoBatch));
    } catch {}
    if (!autoMode) { setAutoStatus(""); return; }

    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      setAutoStatus("⏳ Đang quét mail gắn cờ...");
      try {
        await fetch("/api/suggestions", { method: "POST" });
        const s = await fetch("/api/suggestions").then((r) => r.json());
        if (cancelled) return;
        setData(s);
        // Soạn nháp tự động cho mail pending chưa có nháp tự động (tối đa 5 mail/lượt)
        const pend = Object.values(s.items || {}).filter(
          (i) => i.status === "pending" && !i.autoDraftedAt
        );
        const batch = pend.slice(0, autoBatch);
        for (let k = 0; k < batch.length; k++) {
          if (cancelled) break;
          setAutoStatus(`✍️ Đang soạn nháp tự động (${k + 1}/${batch.length})...`);
          await fetch("/api/auto-draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: batch[k].messageId }),
          });
        }
        if (cancelled) return;
        await load();
        const left = Math.max(0, pend.length - batch.length);
        setAutoStatus(
          `✅ Tự động lúc ${new Date().toLocaleTimeString("vi-VN")}: soạn ${batch.length} nháp` +
            (left ? `, còn ${left} mail sẽ soạn lượt sau` : "") +
            `. Quét lại sau ${autoInterval} phút.`
        );
      } catch (e) {
        if (!cancelled) setAutoStatus("⚠️ Lỗi tự động: " + e.message);
      }
    }
    tick();
    const id = setInterval(tick, autoInterval * 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [autoMode, autoInterval, autoBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = Object.values(data.items || {})
    .filter((i) => i.status !== "sent" && i.status !== "dismissed")
    .sort((a, b) => {
      const cmp = (a.receivedDateTime || "").localeCompare(b.receivedDateTime || "");
      return sortOrder === "newest" ? -cmp : cmp;
    });

  async function runJob() {
    setRunning(true);
    setError("");
    const res = await fetch("/api/suggestions", { method: "POST" });
    const out = await res.json();
    if (out.error) setError(out.error);
    else setData(out);
    setRunning(false);
  }

  function draftFor(item) {
    return drafts[item.messageId] !== undefined ? drafts[item.messageId] : item.draft || "";
  }

  const owner = (data.meta?.owner || "").toLowerCase();
  // To gốc bỏ chủ hộp thư (vì reply đã tự gửi cho người gửi gốc); CC giữ nguyên
  const defaultTo = (item) =>
    (item.to || []).filter((a) => a && a.toLowerCase() !== owner).join(", ");
  const defaultCc = (item) => (item.cc || []).join(", ");
  const toValue = (item) =>
    extraTo[item.messageId] !== undefined ? extraTo[item.messageId] : defaultTo(item);
  const ccValue = (item) =>
    cc[item.messageId] !== undefined ? cc[item.messageId] : defaultCc(item);

  // Tag liên quan tới mail = các tag đã khớp (fallback: toàn bộ tag của luồng khớp)
  const relevantTags = (item) => {
    const tags = new Set();
    for (const m of item.matches || []) {
      const list = m.matchedTags?.length ? m.matchedTags : m.tags || [];
      list.forEach((t) => tags.add(t));
    }
    return [...tags];
  };
  // Gom To/CC cấu hình theo các tag liên quan
  const suggestedRecipients = (item) => {
    const to = new Set(), ccs = new Set();
    for (const tag of relevantTags(item)) {
      (tagCfg[tag]?.to || []).forEach((e) => to.add(e));
      (tagCfg[tag]?.cc || []).forEach((e) => ccs.add(e));
    }
    return { to: [...to], cc: [...ccs] };
  };
  const emailSet = (str) =>
    new Set((str || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
  // Email được gợi ý nhưng còn thiếu trong ô tương ứng (bỏ qua chủ hộp thư)
  const missingRecipients = (item) => {
    const sug = suggestedRecipients(item);
    const inTo = emailSet(toValue(item));
    const inCc = emailSet(ccValue(item));
    return {
      to: sug.to.filter((e) => !inTo.has(e.toLowerCase()) && e.toLowerCase() !== owner),
      cc: sug.cc.filter((e) => !inCc.has(e.toLowerCase()) && e.toLowerCase() !== owner),
    };
  };
  const addMissing = (item, field, emails) => {
    const cur = field === "to" ? toValue(item) : ccValue(item);
    const merged = [...cur.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean), ...emails].join(", ");
    if (field === "to") setExtraTo((s) => ({ ...s, [item.messageId]: merged }));
    else setCc((s) => ({ ...s, [item.messageId]: merged }));
  };

  async function saveDraft(item, status) {
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.messageId, draft: draftFor(item), ...(status && { status }) }),
    });
    const out = await res.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  const isOpen = (item) =>
    openMap[item.messageId] !== undefined ? openMap[item.messageId] : allOpen;
  const toggleItem = (item) =>
    setOpenMap((m) => ({ ...m, [item.messageId]: !isOpen(item) }));
  const toggleAll = () => { setAllOpen((v) => !v); setOpenMap({}); };

  async function unflag(item) {
    if (!confirm(`Bỏ cờ mail "${item.subject || "(không tiêu đề)"}"? Mail sẽ rời khỏi danh sách hỗ trợ.`)) return;
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    const res = await fetch("/api/unflag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.messageId }),
    });
    const out = await res.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  async function send(item) {
    if (!confirm(`Gửi trả lời vào luồng của ${item.from}?`)) return;
    setBusy((b) => ({ ...b, [item.messageId]: true }));
    setError("");
    const res = await fetch("/api/send-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: item.messageId,
        extraTo: toValue(item),
        cc: ccValue(item),
      }),
    });
    const out = await res.json();
    if (out.error) setError(out.error);
    await load();
    setBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  return (
    <div>
      <h1>Hỗ trợ trả lời (mail gắn cờ)</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="primary" disabled={running} onClick={runJob}>
          {running ? "Đang quét..." : "🔄 Quét mail gắn cờ ngay"}
        </button>

        <span className="auto-box">
          <button
            className={autoMode ? "primary" : "ghost"}
            onClick={() => setAutoMode(!autoMode)}
            title="Tự động quét + soạn nháp + lưu nháp vào mail theo chu kỳ"
          >
            {autoMode ? "⏹ Tắt tự động" : "▶ Bật tự động"}
          </button>
          <span className="muted">mỗi</span>
          <select
            value={autoInterval}
            onChange={(e) => setAutoInterval(parseInt(e.target.value, 10))}
            className="auto-select"
          >
            <option value={5}>5 phút</option>
            <option value={10}>10 phút</option>
            <option value={15}>15 phút</option>
            <option value={20}>20 phút</option>
          </select>
          <span className="muted">·</span>
          <select
            value={autoBatch}
            onChange={(e) => setAutoBatch(parseInt(e.target.value, 10))}
            className="auto-select"
            title="Số mail tự soạn mỗi lượt"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} mail/lượt</option>
            ))}
          </select>
        </span>

        <span className="muted">
          {data.meta?.lastJobRun
            ? `Lần quét gần nhất: ${new Date(data.meta.lastJobRun).toLocaleString("vi-VN")} · ${data.meta.lastFlaggedCount ?? "?"} mail gắn cờ`
            : "Chưa chạy job. Bấm quét hoặc chạy npm run job."}
        </span>
        <span style={{ marginLeft: "auto" }} className="muted">Sắp xếp:</span>
        <button
          className="ghost"
          style={sortOrder === "newest" ? { background: "#e8effe", borderColor: "#b9cdfb" } : {}}
          onClick={() => setSortOrder("newest")}
        >
          ↓ Mới nhất
        </button>
        <button
          className="ghost"
          style={sortOrder === "oldest" ? { background: "#e8effe", borderColor: "#b9cdfb" } : {}}
          onClick={() => setSortOrder("oldest")}
        >
          ↑ Cũ nhất
        </button>
        <button className="ghost" onClick={toggleAll}>
          {allOpen ? "▾ Thu gọn nội dung" : "▸ Mở rộng nội dung"}
        </button>
      </div>
      {autoMode && (
        <div className="auto-banner">
          🤖 <b>Chế độ tự động đang BẬT</b> — {autoStatus || `quét & soạn nháp mỗi ${autoInterval} phút.`}
          <span className="muted"> (chỉ chạy khi tab này đang mở)</span>
        </div>
      )}
      {error && <div className="notice">⚠️ {error}</div>}

      {items.length === 0 && (
        <div className="card">
          <p className="muted">
            Không có mail chờ xử lý. Gắn cờ (flag) mail cần hỗ trợ trong Outlook rồi quét lại.
            Mail đã gửi xem ở mục Lịch sử & báo cáo.
          </p>
        </div>
      )}

      {items.map((item) => (
        <div className="card" key={item.messageId} style={{ marginBottom: 14 }}>
          <div className="row">
            <button
              className="ghost"
              style={{ padding: "2px 8px", fontSize: 13 }}
              title={isOpen(item) ? "Thu gọn" : "Mở rộng"}
              onClick={() => toggleItem(item)}
            >
              {isOpen(item) ? "▾" : "▸"}
            </button>
            <h3
              style={{ marginRight: 6, cursor: "pointer" }}
              onClick={() => toggleItem(item)}
            >
              {item.subject || "(không tiêu đề)"}
            </h3>
            <StatusBadge status={item.status} />
            {item.autoDraftedAt && item.draftSavedToMail && (
              <span className="tag" title={`Soạn tự động lúc ${new Date(item.autoDraftedAt).toLocaleString("vi-VN")}`}>
                📥 đã lưu nháp vào mail
              </span>
            )}
            <button
              className="ghost"
              style={{ marginLeft: "auto", padding: "5px 12px", borderColor: taskDone[item.messageId] ? "#16a34a" : undefined, color: taskDone[item.messageId] ? "#15803d" : undefined }}
              disabled={busy[item.messageId] || taskDone[item.messageId]}
              onClick={() => createTask(item)}
              title="Lưu mail này thành task để xử lý sau (menu Task)"
            >
              {taskDone[item.messageId] ? "✅ Đã tạo task" : "🗂️ Tạo task"}
            </button>
            <button
              className="ghost"
              style={{ padding: "5px 12px" }}
              disabled={busy[item.messageId]}
              onClick={() => unflag(item)}
              title="Bỏ cờ mail này trong Outlook và gỡ khỏi danh sách"
            >
              🚩 Bỏ cờ
            </button>
          </div>
          <div className="muted">
            Từ: <b>{item.from}</b> · {new Date(item.receivedDateTime).toLocaleString("vi-VN")}
          </div>
          {(item.to || []).length > 0 && (
            <div className="muted">Đến: {(item.to || []).join(", ")}</div>
          )}
          {(item.cc || []).length > 0 && (
            <div className="muted">CC: {(item.cc || []).join(", ")}</div>
          )}

          {isOpen(item) && (<>
          <hr className="sep" style={{ margin: "12px 0" }} />

          <div className="suggest-split">
            {/* Cột trái: AI chat */}
            <div className="suggest-col">
              <ChatPanel
                item={{
                  ...item,
                  onUseAsDraft: (text) => setDrafts((d) => ({ ...d, [item.messageId]: text })),
                }}
              />
            </div>

            {/* Cột phải: nội dung mail, kiến thức khớp, soạn trả lời */}
            <div className="suggest-col">
              <span className="label" style={{ marginTop: 0 }}>Nội dung mail</span>
              <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 0 }}>{item.bodyPreview}</p>

              <span className="label">Kiến thức khớp ({(item.matches || []).length})</span>
              {(item.matches || []).length === 0 && (
                <p className="muted">Chưa khớp kiến thức — bổ sung tag/summary ở màn hình quản lý kiến thức, hoặc hỏi AI bên trái.</p>
              )}
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

              {item.status === "approved" && (
                <div>
                  <span className="label">
                    Người nhận (To) <span className="muted">— đã điền sẵn người trong luồng, sửa được; reply luôn gửi {item.from}</span>
                  </span>
                  <input
                    type="text"
                    placeholder="vd: a@fpt.com, b@fpt.com — cách nhau bởi dấu phẩy"
                    value={toValue(item)}
                    onChange={(e) => setExtraTo((s) => ({ ...s, [item.messageId]: e.target.value }))}
                  />
                  <span className="label">CC</span>
                  <input
                    type="text"
                    placeholder="vd: sep@fpt.com, team@fpt.com"
                    value={ccValue(item)}
                    onChange={(e) => setCc((s) => ({ ...s, [item.messageId]: e.target.value }))}
                  />

                  {(() => {
                    const miss = missingRecipients(item);
                    if (!miss.to.length && !miss.cc.length) return null;
                    return (
                      <div className="suggest-recipients">
                        💡 <b>Gợi ý theo tag</b> — thiếu người nhận:
                        {miss.to.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <span className="muted">To:</span>{" "}
                            {miss.to.map((e) => <span key={e} className="tag">{e}</span>)}
                            <button className="ghost" style={{ fontSize: 12, padding: "2px 8px" }}
                              onClick={() => addMissing(item, "to", miss.to)}>
                              + Thêm vào To
                            </button>
                          </div>
                        )}
                        {miss.cc.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <span className="muted">CC:</span>{" "}
                            {miss.cc.map((e) => <span key={e} className="tag">{e}</span>)}
                            <button className="ghost" style={{ fontSize: 12, padding: "2px 8px" }}
                              onClick={() => addMissing(item, "cc", miss.cc)}>
                              + Thêm vào CC
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <span className="label">Nội dung trả lời {item.status === "approved" ? "(đã duyệt)" : "(sửa xong hãy Duyệt OK)"}</span>
              <textarea
                value={draftFor(item)}
                onChange={(e) => setDrafts((d) => ({ ...d, [item.messageId]: e.target.value }))}
              />

              <div className="row" style={{ marginTop: 8 }}>
                <button className="ghost" disabled={busy[item.messageId]} onClick={() => saveDraft(item)}>
                  💾 Lưu nháp
                </button>
                {item.status !== "approved" ? (
                  <button className="primary" disabled={busy[item.messageId] || !draftFor(item).trim()}
                    onClick={() => saveDraft(item, "approved")}>
                    ✔ Duyệt OK
                  </button>
                ) : (
                  <>
                    <button className="ghost" disabled={busy[item.messageId]} onClick={() => saveDraft(item, "pending")}>
                      ↩ Bỏ duyệt
                    </button>
                    <button className="primary" disabled={busy[item.messageId]} onClick={() => send(item)}>
                      {busy[item.messageId] ? "Đang gửi..." : "📧 Gửi mail trả lời vào luồng"}
                    </button>
                  </>
                )}
                {item.status !== "approved" && (
                  <span className="muted">Nút gửi chỉ mở sau khi Duyệt OK.</span>
                )}
              </div>
            </div>
          </div>
          </>)}
        </div>
      ))}
    </div>
  );
}
