import { NextResponse } from "next/server";
import {
  getTasks, addTask, updateTask,
  deleteTask, restoreTask, purgeTask, emptyTaskTrash,
  addTaskNote, deleteTaskNote,
} from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// GET /api/tasks -> { items: [...] } (bao gồm cả task trong sọt rác, có field deleted)
export async function GET() {
  return NextResponse.json(getTasks());
}

// POST /api/tasks  { title, note?, status?, messageId?, ... }
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.title || !String(body.title).trim()) {
      return NextResponse.json({ error: "Thiếu tiêu đề công việc" }, { status: 400 });
    }
    const task = addTask(body);
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/tasks
//   { id, status?/title?/note? }   -> cập nhật task
//   { action:"restore", id }        -> khôi phục từ sọt rác
export async function PATCH(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, action, ...patch } = body;
    if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

    if (action === "restore") {
      const ok = restoreTask(id);
      if (!ok) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
      return NextResponse.json({ ok: true, restored: true });
    }

    if (action === "addNote") {
      const note = addTaskNote(id, body.text);
      if (!note) return NextResponse.json({ error: "Ghi chú trống hoặc không tìm thấy task" }, { status: 400 });
      return NextResponse.json({ ok: true, note });
    }

    if (action === "deleteNote") {
      const ok = deleteTaskNote(id, body.noteId);
      if (!ok) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
      return NextResponse.json({ ok: true, deletedNote: body.noteId });
    }

    const task = updateTask(id, patch);
    if (!task) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/tasks?id=...            -> chuyển vào SỌT RÁC (xóa mềm)
// DELETE /api/tasks?id=...&purge=1    -> xóa VĨNH VIỄN khỏi sọt rác
// DELETE /api/tasks?emptyTrash=1      -> dọn sạch toàn bộ sọt rác
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("emptyTrash") === "1") {
      const removed = emptyTaskTrash();
      return NextResponse.json({ ok: true, removed });
    }
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

    const purge = searchParams.get("purge") === "1";
    const ok = purge ? purgeTask(id) : deleteTask(id);
    if (!ok) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    return NextResponse.json({ ok: true, purged: purge });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
