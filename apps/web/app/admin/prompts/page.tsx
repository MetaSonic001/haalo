import { readFile } from "node:fs/promises";
import path from "node:path";
import { languages } from "@haalo/shared";
import { Chip } from "@/components/ui/chip";

async function persona() {
  try {
    return await readFile(path.resolve(process.cwd(), "../../services/voice/prompts/persona.md"), "utf8");
  } catch {
    return null; // e.g. deployed without the voice service source
  }
}

/** Read-only in v1: prompt versions and the language registry live in git. Editing arrives in v2. */
export default async function PromptsPage() {
  const text = await persona();
  const version = text?.match(/persona_version:\s*([^\s]+)/)?.[1];
  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center gap-3">
          <h1 className="display text-[25px]">Persona prompt</h1>
          {version ? <Chip tone="accent">{version}</Chip> : null}
        </div>
        <p className="mt-1 text-muted">Versioned in services/voice/prompts/persona.md. Each call stores the version it ran with.</p>
        <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-card bg-surface p-5 text-sm">{text ?? "Persona file isn't reachable from this deployment."}</pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Language registry</h2>
        <p className="mt-1 text-muted">Source: packages/shared/languages.json. Providers and voices come from .env.</p>
        <div className="mt-4 overflow-x-auto rounded-card bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Whisper</th>
                <th className="px-4 py-3">Sarvam</th>
                <th className="px-4 py-3">Edge voices (dev)</th>
                <th className="px-4 py-3">Scripted lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {languages.map((l) => (
                <tr key={l.code}>
                  <td className="px-4 py-3">
                    <span className="display text-lg">{l.native_name}</span> <span className="text-muted">{l.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={l.status === "launch" ? "good" : "neutral"}>{l.status}</Chip>
                  </td>
                  <td className="px-4 py-3">{l.stt.whisper}</td>
                  <td className="px-4 py-3">{l.stt.sarvam}</td>
                  <td className="px-4 py-3">{Object.values(l.tts.edge_voices).join(", ") || "none"}</td>
                  <td className="px-4 py-3">
                    <Chip tone={l.review === "ok" ? "good" : "warn"}>{l.review === "ok" ? "reviewed" : "needs native review"}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
