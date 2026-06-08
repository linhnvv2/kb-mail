// Rule engine: với một mail gắn cờ + kiến thức đã khớp, chọn rule áp dụng đầu tiên.
// Điều kiện gồm 3 nhóm (chỉ xét nhóm đã khai, mảng không rỗng):
//   - tags:            giao với tag của kiến thức đã khớp mail
//   - subjectContains: tiêu đề mail chứa một trong các chuỗi
//   - fromContains:    địa chỉ người gửi chứa một trong các chuỗi
// match "all" => mọi nhóm đã khai phải đạt; "any" => ít nhất một nhóm đạt.

// Tag liên quan tới mail = union matchedTags (fallback tags) của các kiến thức khớp.
// Giống logic relevantTags trong app/suggestions/page.jsx.
function relevantTags(matches) {
  const tags = new Set();
  for (const m of matches || []) {
    const list = m.matchedTags?.length ? m.matchedTags : m.tags || [];
    list.forEach((t) => tags.add(String(t).toLowerCase()));
  }
  return tags;
}

function someIncludes(haystack, needles) {
  const h = (haystack || "").toLowerCase();
  return (needles || []).some((n) => n && h.includes(String(n).toLowerCase()));
}

// Trả về rule khớp đầu tiên (theo thứ tự mảng) đang bật, hoặc null.
export function evaluateRules(message, matches, rulesData) {
  const rules = rulesData?.rules || [];
  const mailTags = relevantTags(matches);

  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    const c = rule.conditions || {};
    const groups = [];

    if (Array.isArray(c.tags) && c.tags.length) {
      groups.push(c.tags.some((t) => mailTags.has(String(t).toLowerCase())));
    }
    if (Array.isArray(c.subjectContains) && c.subjectContains.length) {
      groups.push(someIncludes(message.subject, c.subjectContains));
    }
    if (Array.isArray(c.fromContains) && c.fromContains.length) {
      groups.push(someIncludes(message.from, c.fromContains));
    }

    if (!groups.length) continue; // rule không khai điều kiện nào -> bỏ qua (tránh khớp tất cả)
    const ok = rule.match === "all" ? groups.every(Boolean) : groups.some(Boolean);
    if (ok) return rule;
  }
  return null;
}
