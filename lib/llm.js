// LLM qua API tương thích OpenAI: LM Studio (mặc định), Ollama, OpenAI, OpenRouter, ...
// Cấu hình .env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL

export async function chatLLM(messages, { temperature = 0.3 } = {}) {
  const base = (process.env.LLM_BASE_URL || "http://localhost:1234/v1").replace(/\/$/, "");
  const body = {
    model: process.env.LLM_MODEL || "local-model",
    messages,
    stream: false, // proxy mặc định stream SSE; tắt để nhận JSON res.json() đọc được
  };
  // Một số model (vd Claude 4.x qua proxy) không nhận `temperature`.
  // Chỉ gửi khi đặt LLM_TEMPERATURE trong .env, mặc định bỏ qua.
  if (process.env.LLM_TEMPERATURE !== undefined && process.env.LLM_TEMPERATURE !== "") {
    body.temperature = Number(process.env.LLM_TEMPERATURE);
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY || "lm-studio"}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

// Yêu cầu LLM trả về JSON, có fallback bóc tách từ text
export async function chatLLMJson(messages) {
  const content = await chatLLM(messages, { temperature: 0.1 });
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    throw new Error("LLM không trả về JSON hợp lệ: " + content.slice(0, 200));
  }
}

function threadContext(t, maxBody = 500) {
  const msgs = (t.messages || [])
    .map((m) => `- ${m.from} → ${(m.to || []).join(", ")}: ${m.bodyText?.slice(0, maxBody)}`)
    .join("\n");
  return `Tiêu đề: ${t.subject}\nTags: ${(t.tags || []).join(", ")}\nTóm tắt: ${t.summary || "(chưa có)"}\nGiải pháp: ${t.solution || "(chưa có)"}\nCác mail:\n${msgs}`;
}

// Phân loại tự động một luồng: trả về { tags, summary, solution }
export async function classifyThread(thread, existingTags = []) {
  return chatLLMJson([
    {
      role: "system",
      content:
        "Bạn là trợ lý phân loại email hỗ trợ kỹ thuật. Trả về DUY NHẤT một JSON object " +
        '{"tags": ["..."], "summary": "...", "solution": "..."} bằng tiếng Việt. ' +
        "tags: 2-4 tag ngắn gọn (ưu tiên dùng lại tag có sẵn nếu phù hợp); " +
        "summary: tóm tắt vấn đề 1-2 câu; solution: giải pháp đã trao đổi trong luồng (nếu chưa có thì đề xuất).",
    },
    {
      role: "user",
      content: `Tag có sẵn trong hệ thống: ${existingTags.join(", ") || "(chưa có)"}\n\n${threadContext(thread)}`,
    },
  ]);
}

// Chat hỏi đáp dựa trên các lần hỗ trợ trước + mail đang xử lý
export async function supportChat({ question, chatHistory = [], incoming, matchedThreads = [] }) {
  const kbContext = matchedThreads
    .map((t, i) => `--- Kiến thức ${i + 1} (điểm khớp ${t.score ?? "?"}) ---\n${threadContext(t, 300)}`)
    .join("\n\n");
  const messages = [
    {
      role: "system",
      content:
        "Bạn là trợ lý hỗ trợ kỹ thuật nội bộ. Dựa vào các lần hỗ trợ trước (kiến thức bên dưới) để tư vấn cách trả lời email mới. " +
        "Trả lời ngắn gọn, tiếng Việt. Khi được yêu cầu soạn mail trả lời, viết nội dung sẵn sàng để gửi (không kèm giải thích).\n\n" +
        (incoming
          ? `EMAIL ĐANG XỬ LÝ:\nTừ: ${incoming.from}\nTiêu đề: ${incoming.subject}\nNội dung: ${incoming.bodyPreview || incoming.bodyText || ""}\n\n`
          : "") +
        (kbContext ? `KIẾN THỨC TỪ CÁC LẦN HỖ TRỢ TRƯỚC:\n${kbContext}` : "Chưa có kiến thức khớp."),
    },
    ...chatHistory,
    { role: "user", content: question },
  ];
  return chatLLM(messages);
}

// Gia sư hỗ trợ: hỏi đáp tổng quát về kho kiến thức (không gắn với một mail cụ thể)
export async function tutorChat({ question, chatHistory = [], kbThreads = [] }) {
  const kbContext = kbThreads
    .map((t, i) => `--- Kiến thức ${i + 1}${t.score != null ? ` (điểm khớp ${t.score})` : ""} ---\n${threadContext(t, 400)}`)
    .join("\n\n");
  const messages = [
    {
      role: "system",
      content:
        "Bạn là GIA SƯ hỗ trợ nội bộ cho hệ thống quản lý kiến thức email. Nhiệm vụ: giải thích, hướng dẫn và tra cứu giúp người dùng " +
        "dựa trên KIẾN THỨC bên dưới (các luồng mail đã được đánh tag/tóm tắt/giải pháp). " +
        "Trả lời ngắn gọn, rõ ràng, tiếng Việt, dùng gạch đầu dòng khi phù hợp. " +
        "Nếu kiến thức chưa đủ để trả lời, hãy nói thẳng là chưa có trong kho và gợi ý người dùng nạp thêm mail hoặc đánh tag — TUYỆT ĐỐI không bịa.\n\n" +
        (kbContext ? `KIẾN THỨC LIÊN QUAN:\n${kbContext}` : "Hiện chưa tìm thấy kiến thức khớp với câu hỏi này."),
    },
    ...chatHistory,
    { role: "user", content: question },
  ];
  return chatLLM(messages);
}
