import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { loadWaitlist } from "@/lib/admin-data";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new NextResponse("Forbidden", { status: 403 });
  const { rows } = await loadWaitlist();
  const csv = ["email,city,parent_language,source,created_at", ...rows.map((r) => [r.email, r.city, r.parent_language, r.source, r.created_at].map(esc).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="haalo-waitlist.csv"' } });
}
