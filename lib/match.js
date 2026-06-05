// So khớp mail mới (flagged) với kho kiến thức đã đánh tag/summary
const STOPWORDS = new Set([
  "the","and","for","with","from","this","that","have","been","will","your",
  "của","và","cho","với","từ","này","đã","sẽ","các","những","được","trong",
  "anh","chị","em","bạn","xin","chào","cảm","ơn","vui","lòng","theo","về",
  "re:","fw:","fwd:",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function scoreThread(message, thread) {
  const msgTokens = new Set(tokenize(message.subject + " " + message.bodyText));
  let score = 0;
  const matchedTags = [];

  for (const tag of thread.tags || []) {
    const tagTokens = tokenize(tag);
    const hit = tagTokens.length > 0 && tagTokens.every((t) => msgTokens.has(t));
    if (hit) {
      score += 5;
      matchedTags.push(tag);
    }
  }

  const kbTokens = tokenize(
    (thread.subject || "") + " " + (thread.summary || "")
  );
  const overlap = kbTokens.filter((t) => msgTokens.has(t));
  score += new Set(overlap).size;

  return { score, matchedTags };
}

export function matchKnowledge(message, threads, topN = 3) {
  return threads
    .map((t) => {
      const { score, matchedTags } = scoreThread(message, t);
      return {
        conversationId: t.conversationId,
        subject: t.subject,
        tags: t.tags || [],
        matchedTags,
        summary: t.summary || "",
        solution: t.solution || "",
        score,
      };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
