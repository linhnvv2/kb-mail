"use client";
// Bot gia sư nổi (floating) — hỏi đáp về kho kiến thức, hiện ở mọi trang.
// Hỗ trợ: phóng to/thu nhỏ, nhiều hội thoại lưu localStorage, xem lịch sử & xóa.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SUGGESTIONS = [
  "Kho kiến thức đang có những chủ đề/tag nào?",
  "Tóm tắt cách xử lý vấn đề lương presale",
  "Khi hóa đơn không nhảy lương thì xử lý thế nào?",
];

const HELLO = "Chào bạn 👋 Mình là gia sư kho kiến thức. Hỏi mình bất cứ điều gì về các luồng hỗ trợ đã lưu nhé!";
const STORAGE_KEY = "kbmail.bot.conversations";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const titleOf = (c) =>
  c.messages.find((m) => m.role === "user")?.content.slice(0, 40) || "Hội thoại mới";

export default function ChatBot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState("chat"); // 'chat' | 'history'
  const [convos, setConvos] = useState([]); // [{ id, messages:[{role,content,sources?}], updatedAt }]
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const loaded = useRef(false);

  // Nạp lịch sử từ localStorage (client-side)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) {
        setConvos(saved);
        setActiveId(saved[0].id);
      }
    } catch {}
    loaded.current = true;
  }, []);

  // Lưu lại mỗi khi hội thoại đổi
  useEffect(() => {
    if (loaded.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  }, [convos]);

  const active = convos.find((c) => c.id === activeId) || null;
  const messages = active?.messages || [];

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading, open, view]);
  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view, activeId]);

  function ensureActive() {
    if (active) return active.id;
    const id = newId();
    setConvos((cs) => [{ id, messages: [], updatedAt: Date.now() }, ...cs]);
    setActiveId(id);
    return id;
  }

  function newConversation() {
    const id = newId();
    setConvos((cs) => [{ id, messages: [], updatedAt: Date.now() }, ...cs]);
    setActiveId(id);
    setView("chat");
  }

  function deleteConversation(id) {
    setConvos((cs) => {
      const next = cs.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id || null);
      return next;
    });
  }

  function clearAll() {
    if (!confirm("Xóa toàn bộ lịch sử hội thoại với bot?")) return;
    setConvos([]);
    setActiveId(null);
    setView("chat");
  }

  function pushMessage(id, m) {
    setConvos((cs) =>
      cs.map((c) => (c.id === id ? { ...c, messages: [...c.messages, m], updatedAt: Date.now() } : c))
    );
  }

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput("");
    const id = ensureActive();
    const history = (convos.find((c) => c.id === id)?.messages || []).map(({ role, content }) => ({ role, content }));
    pushMessage(id, { role: "user", content: question });
    setLoading(true);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chatHistory: history }),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      pushMessage(id, { role: "assistant", content: out.answer, sources: out.sources });
    } catch (err) {
      pushMessage(id, { role: "assistant", content: "⚠️ " + err.message });
    }
    setLoading(false);
  }

  if (pathname === "/login") return null;

  return (
    <>
      <button
        className="bot-fab"
        onClick={() => setOpen((o) => !o)}
        title="Gia sư kho kiến thức"
        aria-label="Mở trợ lý kho kiến thức"
      >
        {open ? "✕" : "🎓"}
      </button>

      {open && (
        <div className={"bot-panel" + (expanded ? " expanded" : "")}>
          <div className="bot-head">
            <span>🎓 Gia sư kho kiến thức</span>
            <div className="bot-head-actions">
              <button onClick={newConversation} title="Hội thoại mới" aria-label="Hội thoại mới">✚</button>
              <button
                onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
                title="Lịch sử hội thoại"
                aria-label="Lịch sử hội thoại"
                className={view === "history" ? "on" : ""}
              >🕘</button>
              <button onClick={() => setExpanded((e) => !e)} title={expanded ? "Thu nhỏ" : "Phóng to"} aria-label="Phóng to / thu nhỏ">
                {expanded ? "🗗" : "🗖"}
              </button>
              <button onClick={() => setOpen(false)} title="Đóng" aria-label="Đóng">✕</button>
            </div>
          </div>

          {view === "history" ? (
            <div className="bot-body">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <b style={{ fontSize: 13 }}>Lịch sử hội thoại ({convos.length})</b>
                {convos.length > 0 && (
                  <button className="ghost" style={{ color: "#c0392b" }} onClick={clearAll}>🗑 Xóa tất cả</button>
                )}
              </div>
              {convos.length === 0 && <p className="muted">Chưa có hội thoại nào.</p>}
              {convos.map((c) => (
                <div key={c.id} className={"bot-histitem" + (c.id === activeId ? " active" : "")}>
                  <button className="bot-histopen" onClick={() => { setActiveId(c.id); setView("chat"); }}>
                    <div className="bot-histtitle">{titleOf(c)}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {c.messages.length} tin · {new Date(c.updatedAt).toLocaleString("vi-VN")}
                    </div>
                  </button>
                  <button className="bot-histdel" title="Xóa hội thoại này" onClick={() => deleteConversation(c.id)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bot-body" ref={bodyRef}>
              <div className="bot-msg assistant"><div className="bot-bubble">{HELLO}</div></div>
              {messages.map((m, i) => (
                <div key={i} className={"bot-msg " + m.role}>
                  <div className="bot-bubble">{m.content}</div>
                  {m.sources?.length > 0 && (
                    <div className="bot-sources">
                      Nguồn: {m.sources.map((s, j) => (
                        <span key={j} className="tag" title={`điểm khớp ${s.score}`}>{s.subject}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="bot-msg assistant"><div className="bot-bubble bot-typing">Đang soạn câu trả lời…</div></div>}
              {messages.length === 0 && !loading && (
                <div className="bot-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="ghost" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "chat" && (
            <div className="bot-input">
              <input
                ref={inputRef}
                type="text"
                placeholder="Hỏi về kho kiến thức..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={loading}
              />
              <button className="primary" onClick={() => send()} disabled={loading || !input.trim()}>Gửi</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
