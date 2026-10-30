import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { allowedParent } from "@/lib/guard";
import { forwardPhoto } from "@/lib/proof-forward";

/** A family member uploads a photo on a parent's behalf (for example a medicine box or a BP reading the parent sent them). */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ ok: false, message: "Please sign in." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const parentId = String(form?.get("parent_id") ?? "");
  if (!(await allowedParent(parentId))) return NextResponse.json({ ok: false, message: "We couldn't find that parent." }, { status: 404 });
  const { status, body } = await forwardPhoto((form?.get("photo") as File | null) ?? null, parentId, viewer.id);
  return NextResponse.json(body, { status });
}
