"use client";

import { useState, useTransition } from "react";
import { CheckCheck, HelpCircle, Send, Trash2, Heart } from "lucide-react";
import type { FamilyMessage } from "@haalo/db";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/app/toast";
import { deleteMessage, sendMessage } from "@/app/app/care-actions";
import { fmtDay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MessageCenter({ parent, messages }: { parent: { id: string; name: string; honorific: string }; messages: FamilyMessage[] }) {
  const [kind, setKind] = useState<"note" | "question">("note");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const who = parent.honorific || parent.name;
  const mine = messages.filter((m) => m.parent_id === parent.id);

  const send = () =>
    start(async () => {
      const r = await sendMessage(parent.id, { kind, body });
      if (r.ok) {
        toast(`Saved. Sneha will say it to ${who} on the next call.`);
        setBody("");
      } else toast(r.error.message, "danger");
    });

  return (
    <div className="space-y-8">
      <form
        className="rounded-card bg-surface p-5 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div role="radiogroup" aria-label="Type of message" className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["note", "Pass on a message", Heart],
              ["question", "Ask them something", HelpCircle],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 font-medium", kind === k ? "border-text bg-text text-bg" : "border-border bg-bg")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium" htmlFor="msg">
          {kind === "note" ? `What should Sneha tell ${who}?` : `What should Sneha ask ${who}?`}
        </label>
        <textarea
          id="msg"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={400}
          className="mt-1.5 w-full rounded-input border border-border bg-bg px-4 py-3 text-base outline-none focus:border-text"
          placeholder={kind === "note" ? "Aarav scored 92 in his maths test! He will call on Sunday." : "Did the plumber come to fix the kitchen tap?"}
        />
        <p className="mt-1 text-sm text-muted">
          Write it in any language. Sneha says it warmly in {who}&apos;s own language, during the next call, and tells you what they replied.
        </p>
        <Button type="submit" className="mt-4" disabled={pending || body.trim().length < 2}>
          <Send className="size-4" /> Send to Sneha
        </Button>
      </form>

      <section aria-labelledby="msgs-h">
        <h2 id="msgs-h" className="mb-3 text-xl font-semibold">Messages for {who}</h2>
        {mine.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">Nothing yet. Notes and questions you write are delivered on the next call.</p> : null}
        <ul className="space-y-3">
          {mine.map((m) => (
            <li key={m.id} className="rounded-card bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Chip tone={m.status === "queued" ? "warn" : "good"}>
                  {m.status === "queued" ? "Waiting for the next call" : m.status === "answered" ? "Answered" : "Delivered"}
                </Chip>
                <span className="font-medium">{m.from_name}</span>
                <span className="text-muted">{m.kind === "question" ? "asked" : "sent a note"} · {fmtDay(m.created_at)}, {fmtTime(m.created_at)}</span>
                {m.status === "queued" ? (
                  <Button variant="ghost" size="sm" className="ml-auto" aria-label="Delete message" onClick={() => start(async () => void (await deleteMessage(m.id)))}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-[17px]">{m.body}</p>
              {m.reply_text ? (
                <p className="mt-3 flex gap-2 rounded-row bg-bg px-4 py-3">
                  <CheckCheck className="mt-0.5 size-5 shrink-0 text-good" />
                  <span><span className="font-medium">{who} said:</span> {m.reply_text}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
