// Tách chuỗi email (phân cách bởi , ; khoảng trắng, xuống dòng) -> mảng email hợp lệ, khử trùng
export function parseEmails(input) {
  if (Array.isArray(input)) input = input.join(",");
  return [
    ...new Set(
      (input || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    ),
  ];
}
