import { loadWaitlist } from "@/lib/admin-data";
import { Button } from "@/components/ui/button";
import { fmtDay } from "@/lib/format";

export default async function WaitlistPage() {
  const { rows, demo } = await loadWaitlist();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-[25px]">Waitlist ({rows.length})</h1>
        <Button asChild variant="secondary">
          <a href="/api/admin/waitlist" download>
            Export CSV
          </a>
        </Button>
      </div>
      {demo ? <p className="mt-3 rounded-row bg-warn-bg px-4 py-3 text-warn">Demo data.</p> : null}
      <div className="mt-6 overflow-x-auto rounded-card bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              {["Email", "City", "Parent language", "Source", "Joined"].map((h) => (
                <th key={h} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.email}</td>
                <td className="px-4 py-3">{r.city ?? ""}</td>
                <td className="px-4 py-3">{r.parent_language ?? ""}</td>
                <td className="px-4 py-3">{r.source ?? ""}</td>
                <td className="px-4 py-3">{fmtDay(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
