"use client";
// Màn hình quản lý kiến thức: nhiều file import, đánh tag, AI phân loại, summary/giải pháp
import { useEffect, useMemo, useRef, useState } from "react";

export default function KnowledgePage() {
  const [data, setData] = useState({ threads: [], imports: [] });
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [summary, setSummary] = useState("");
  const [solution, setSolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [msg, setMsg] = useState("");
  const [showImports, setShowImports] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef(null);
  const msgRef = useRef(null);

  async function load() {
    const res = await fetch("/api/threads");
    setData(await res.json());
  }
  useEffect(() => { load(); }, []);

  const threads = useMemo(() => {
    const q = search.toLowerCase();
    return (data.threads || []).filter(
      (t) =>
        !q ||
        t.subject?.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  }, [data, search]);

  const thread = (data.threads || []).find((t) => t.conversationId === selected);

  const allTags = useMemo(
    () => [...new Set((data.threads || []).flatMap((t) => t.tags || []))].sort((a, b) => a.localeCompare(b)),
    [data]
  );

  function select(t) {
    setSelected(t.conversationId);
    setSummary(t.summary || "");
    setSolution(t.solution || "");
    setMsg("");
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setMsg(`Đã lưu file import mới: ${out.file} (${out.count} luồng).`);
      await load();
    } catch (err) {
      setMsg("Lỗi đọc file: " + err.message);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  // Thủ công: thả/chọn nhiều file .msg -> server parse về JSON chuẩn -> lưu import
  async function uploadMsg(e) {
    const files = [...(e.target.files || [])];
    if (files.length === 0) return;
    setMsg(`Đang xử lý ${files.length} file .msg...`);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/import-msg", { method: "POST", body: fd });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setMsg(
        `Đã nạp ${out.messages} mail (.msg) thành ${out.count} luồng → ${out.file}.` +
          (out.errors?.length ? ` Bỏ qua ${out.errors.length} file lỗi.` : "")
      );
      await load();
    } catch (err) {
      setMsg("Lỗi nạp .msg: " + err.message);
    }
    if (msgRef.current) msgRef.current.value = "";
  }

  // Tự động: quét folder Inbox/AI qua Microsoft Graph
  async function autoScan() {
    setFetching(true);
    setMsg("Đang tự động quét thư mục Inbox/AI qua Microsoft Graph...");
    try {
      const res = await fetch("/api/fetch-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "Inbox/AI" }),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      setMsg(`Đã quét folder ${out.folder}: nạp ${out.count} luồng → ${out.file}.`);
      await load();
    } catch (err) {
      setMsg("Lỗi quét tự động: " + err.message);
    }
    setFetching(false);
  }

  async function saveKb(patch) {
    if (!thread) return;
    setSaving(true);
    await fetch("/api/kb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: thread.conversationId, ...patch }),
    });
    await load();
    setSaving(false);
    setMsg("Đã lưu.");
  }

  async function classify(all = false) {
    setClassifying(true);
    setMsg(all ? "AI đang phân loại các luồng chưa có tag..." : "AI đang phân loại luồng này...");
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { conversationId: thread.conversationId }),
    });
    const out = await res.json();
    if (out.error) setMsg("Lỗi: " + out.error);
    else {
      const ok = out.results.filter((r) => r.ok).length;
      const fail = out.results.length - ok;
      setMsg(`AI phân loại xong: ${ok} thành công${fail ? `, ${fail} lỗi` : ""}.`);
      await load();
      if (!all && out.results[0]?.ok) {
        setSummary(out.results[0].summary || "");
        setSolution((s) => s || out.results[0].solution || "");
      }
    }
    setClassifying(false);
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || !thread) return;
    setTagInput("");
    saveKb({ tags: [...new Set([...(thread.tags || []), tag])] });
  }

  return (
    <div>
      <h1>Màn hình quản lý kiến thức</h1>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ingest-grid">
          {/* Nạp tự động */}
          <div>
            <span className="label" style={{ marginTop: 0 }}>⚙️ Tự động</span>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              Quét thư mục <b>Inbox/AI</b> trong hộp thư qua Microsoft Graph.
            </p>
            <button className="primary" disabled={fetching} onClick={autoScan}>
              {fetching ? "Đang quét..." : "🔄 Quét Inbox/AI ngay"}
            </button>
          </div>

          {/* Nạp thủ công */}
          <div>
            <span className="label" style={{ marginTop: 0 }}>📥 Thủ công</span>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              Thả/chọn các file <b>.msg</b> từ Outlook, hệ thống tự chuẩn hóa về JSON.
            </p>
            <div className="row">
              <button className="ghost" onClick={() => msgRef.current?.click()}>
                📂 Chọn file .msg
              </button>
              <input ref={msgRef} type="file" accept=".msg" multiple hidden onChange={uploadMsg} />
              <button className="ghost" onClick={() => fileRef.current?.click()}>
                🧩 Nạp emails.json
              </button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={uploadFile} />
            </div>
          </div>
        </div>

        <hr className="sep" />
        <div className="row">
          <button className="ghost" onClick={() => setShowImports(!showImports)}>
            🗂 {data.imports?.length || 0} file dữ liệu
          </button>
          <button className="ghost" onClick={() => setShowTags(!showTags)}>
            🏷 Quản lý tag (To/CC theo tag)
          </button>
          <button className="ghost" disabled={classifying} onClick={() => classify(true)}>
            🤖 AI phân loại các luồng chưa có tag
          </button>
          <span className="muted">{(data.threads || []).length} luồng (đã gộp, khử trùng lặp)</span>
        </div>
      </div>

      {showTags && <TagManager allTags={allTags} />}
      {msg && <div className="notice">{msg}</div>}
      {showImports && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Các file dữ liệu đã nạp</b> <span className="muted">(mỗi lần nạp/fetch lưu một file riêng trong data/imports)</span>
          {(data.imports || []).length === 0 && <p className="muted">Chưa có file nào.</p>}
          {(data.imports || []).map((im) => (
            <div key={im.file} className="muted" style={{ padding: "3px 0" }}>
              📄 {im.file} — folder <b>{im.folder}</b>, {im.threadCount} luồng
              {im.exportedAt ? `, xuất ${new Date(im.exportedAt).toLocaleString("vi-VN")}` : ""}
            </div>
          ))}
        </div>
      )}

      <div className="layout">
        <div className="card">
          <input
            className="search"
            type="text"
            placeholder="Tìm theo tiêu đề hoặc tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {threads.length === 0 && (
            <p className="muted">Chưa có dữ liệu. Nạp file emails.json hoặc chạy npm run fetch-emails.</p>
          )}
          {threads.map((t) => (
            <div
              key={t.conversationId}
              className={"thread-item" + (t.conversationId === selected ? " active" : "")}
              onClick={() => select(t)}
            >
              <div className="sub">{t.subject || "(không tiêu đề)"}</div>
              <div className="meta">
                {t.messageCount || t.messages?.length || 0} mail ·{" "}
                {t.lastReceived ? new Date(t.lastReceived).toLocaleDateString("vi-VN") : ""}
              </div>
              <div>{(t.tags || []).map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>
            </div>
          ))}
        </div>

        <div className="card">
          {!thread ? (
            <p className="muted">Chọn một luồng email bên trái để đánh tag / AI phân loại / nhập giải pháp.</p>
          ) : (
            <>
              <h3>{thread.subject}</h3>
              <div className="muted">Người tham gia: {(thread.participants || []).join(", ")}</div>

              <div className="row" style={{ marginTop: 10 }}>
                <button className="ghost" disabled={classifying} onClick={() => classify(false)}>
                  {classifying ? "AI đang phân loại..." : "🤖 AI phân loại luồng này"}
                </button>
              </div>

              <span className="label">Tags</span>
              <div>
                {(thread.tags || []).map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                    <button onClick={() => saveKb({ tags: thread.tags.filter((x) => x !== tag) })} title="Xóa tag">✕</button>
                  </span>
                ))}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  type="text"
                  style={{ maxWidth: 260 }}
                  placeholder="Thêm tag mới..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                />
                <button className="primary" onClick={addTag}>Thêm tag</button>
              </div>

              <span className="label">Tóm tắt (summary)</span>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />

              <span className="label">Giải pháp (solution)</span>
              <textarea value={solution} onChange={(e) => setSolution(e.target.value)} />

              <div className="row" style={{ marginTop: 10 }}>
                <button className="primary" disabled={saving} onClick={() => saveKb({ summary, solution })}>
                  {saving ? "Đang lưu..." : "💾 Lưu tóm tắt & giải pháp"}
                </button>
              </div>

              <hr className="sep" />
              <span className="label">Toàn bộ luồng mail ({thread.messages?.length || 0})</span>
              {(thread.messages || []).map((m) => (
                <div className="msg" key={m.id}>
                  <div className="head">
                    <b>{m.from}</b> → {m.to?.join(", ")}
                    {m.cc?.length > 0 && <> · CC: {m.cc.join(", ")}</>}
                    {" · "}{new Date(m.receivedDateTime).toLocaleString("vi-VN")}
                  </div>
                  <pre>{m.bodyText}</pre>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Quản lý cấu hình người nhận (To/CC) mặc định theo tag
function TagManager({ allTags }) {
  const [cfg, setCfg] = useState({});
  const [edits, setEdits] = useState({});
  const [savingTag, setSavingTag] = useState("");
  const [newTag, setNewTag] = useState("");
  const [extraTags, setExtraTags] = useState([]);

  async function load() {
    const res = await fetch("/api/tag-config");
    setCfg(await res.json());
  }
  useEffect(() => { load(); }, []);

  const tags = [...new Set([...(allTags || []), ...Object.keys(cfg), ...extraTags])]
    .sort((a, b) => a.localeCompare(b));

  const valTo = (tag) => (edits[tag]?.to !== undefined ? edits[tag].to : (cfg[tag]?.to || []).join(", "));
  const valCc = (tag) => (edits[tag]?.cc !== undefined ? edits[tag].cc : (cfg[tag]?.cc || []).join(", "));
  const setField = (tag, key, v) =>
    setEdits((e) => ({ ...e, [tag]: { to: valTo(tag), cc: valCc(tag), [key]: v } }));

  async function save(tag) {
    setSavingTag(tag);
    const res = await fetch("/api/tag-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, to: valTo(tag), cc: valCc(tag) }),
    });
    const out = await res.json();
    if (!out.error) {
      setCfg(out.config || {});
      setEdits((e) => { const n = { ...e }; delete n[tag]; return n; });
    }
    setSavingTag("");
  }

  function addTag() {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setExtraTags((x) => [...x, t]);
    setNewTag("");
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <b>🏷 Cấu hình người nhận theo tag</b>{" "}
      <span className="muted">— khi mail gắn cờ khớp tag này, hệ thống gợi ý thêm To/CC tương ứng lúc trả lời.</span>

      <div className="row" style={{ margin: "10px 0" }}>
        <input
          type="text"
          style={{ maxWidth: 260 }}
          placeholder="Thêm tag mới để cấu hình..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTag()}
        />
        <button className="ghost" onClick={addTag}>+ Thêm tag</button>
      </div>

      {tags.length === 0 && <p className="muted">Chưa có tag nào. Đánh tag cho luồng hoặc thêm tag mới ở trên.</p>}

      {tags.map((tag) => {
        const configured = (cfg[tag]?.to?.length || cfg[tag]?.cc?.length);
        const dirty = edits[tag] !== undefined;
        return (
          <div key={tag} className="tagcfg-row">
            <div className="tagcfg-name">
              <span className="tag">{tag}</span>
              {configured ? <span className="muted" style={{ fontSize: 11 }}>đã cấu hình</span> : null}
            </div>
            <input
              type="text"
              placeholder="To: a@fpt.com, b@fpt.com"
              value={valTo(tag)}
              onChange={(e) => setField(tag, "to", e.target.value)}
            />
            <input
              type="text"
              placeholder="CC: sep@fpt.com"
              value={valCc(tag)}
              onChange={(e) => setField(tag, "cc", e.target.value)}
            />
            <button
              className={dirty ? "primary" : "ghost"}
              disabled={savingTag === tag || !dirty}
              onClick={() => save(tag)}
            >
              {savingTag === tag ? "..." : "💾"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
