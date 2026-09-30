import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { liveMode } from "@/lib/supabase/config";

/** One-tap export of everything Haalo holds about one parent. Runs under the viewer's RLS, so only family data is reachable. */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Unauthorized", { status: 401 });
  const parentId = new URL(req.url).searchParams.get("parent");
  if (!parentId) return new NextResponse("Missing parent", { status: 400 });

  let payload: Record<string, unknown> = { demo: true, note: "Connect Supabase to export real data." };
  if (liveMode) {
    const sb = await createServerSupabase();
    const { data: parent } = await sb.from("parents").select("*").eq("id", parentId).maybeSingle();
    if (!parent) return new NextResponse("Not found", { status: 404 });
    const { data: calls } = await sb.from("calls").select("*").eq("parent_id", parentId);
    const ids = (calls ?? []).map((c) => c.id as string);
    const [meds, ctx, mem, flags, turns, sums] = await Promise.all([
      sb.from("medicines").select("*").eq("parent_id", parentId),
      sb.from("parent_context").select("*").eq("parent_id", parentId),
      sb.from("memories").select("*").eq("parent_id", parentId),
      sb.from("flags").select("*").eq("parent_id", parentId),
      ids.length ? sb.from("call_turns").select("*").in("call_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("call_summaries").select("*").in("call_id", ids) : Promise.resolve({ data: [] }),
    ]);
    payload = {
      exported_at: new Date().toISOString(),
      parent,
      parent_context: ctx.data,
      medicines: meds.data,
      memories: mem.data,
      flags: flags.data,
      calls,
      call_summaries: sums.data,
      call_turns: turns.data,
    };
  }
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="haalo-export-${parentId}.json"`,
    },
  });
}
