import { NextResponse } from "next/server";
import { fail, ok } from "@haalo/shared";
import { getViewer } from "@/lib/auth";
import { liveMode } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Translate a call's transcript to English, once, and cache it on the turns.
 * Access is checked with the viewer's own RLS (they can only read turns of their family's calls); the write uses the service role.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json(fail("unauthorized", "Please sign in again."), { status: 401 });

  if (!liveMode) {
    return NextResponse.json(ok({ translations: {}, note: "Demo mode: connect Supabase and Groq to translate real calls." }));
  }
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL_SUMMARY;
  if (!key || !model) return NextResponse.json(fail("unavailable", "Translation isn't set up yet."), { status: 503 });

  const sb = await createServerSupabase();
  const { data: turns } = await sb.from("call_turns").select("id, text, corrected_text, translated_text").eq("call_id", id).order("id");
  if (!turns?.length) return NextResponse.json(fail("not_found", "We couldn't find that conversation."), { status: 404 });

  const todo = turns.filter((t) => !t.translated_text);
  const result: Record<number, string> = Object.fromEntries(turns.filter((t) => t.translated_text).map((t) => [t.id as number, t.translated_text as string]));

  if (todo.length) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Translate each phone-call line into natural, plain English. Keep names and meaning; do not add or remove information. Return ONLY JSON: {"translations":[{"id":<id>,"text":"<english>"}]}',
          },
          { role: "user", content: JSON.stringify(todo.map((t) => ({ id: t.id, text: t.corrected_text ?? t.text }))) },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json(fail("upstream", "Translation is busy right now. Please try again in a moment."), { status: 502 });
    const parsed = JSON.parse((await res.json()).choices[0].message.content) as { translations: Array<{ id: number; text: string }> };
    const admin = adminClient();
    for (const t of parsed.translations ?? []) {
      result[t.id] = t.text;
      await admin?.from("call_turns").update({ translated_text: t.text }).eq("id", t.id);
    }
  }
  return NextResponse.json(ok({ translations: result }));
}
