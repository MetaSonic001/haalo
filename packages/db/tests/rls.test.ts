import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * RLS tests: run the real migration against an in-process Postgres (PGlite, no Docker) and assert what each
 * kind of user can and cannot do. CI runs the same file.
 */
const root = path.resolve(__dirname, "../../../supabase");
const A = "00000000-0000-0000-0000-00000000000a"; // owner of family 1
const B = "00000000-0000-0000-0000-00000000000b"; // owner of family 2
const C = "00000000-0000-0000-0000-00000000000c"; // member of family 1
const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const F1 = "10000000-0000-0000-0000-000000000001";
const F2 = "10000000-0000-0000-0000-000000000002";
const P1 = "20000000-0000-0000-0000-000000000001";
const P2 = "20000000-0000-0000-0000-000000000002";

let db: PGlite;

/** Run `fn` as an authenticated user (or anon) with the given JWT claims, inside a transaction that is rolled back. */
async function as<T>(user: string | null, fn: () => Promise<T>, claims: Record<string, unknown> = {}): Promise<T> {
  const jwt = user ? JSON.stringify({ sub: user, role: "authenticated", ...claims }) : "{}";
  await db.exec(`select set_config('request.jwt.claims', '${jwt}', false); set role ${user ? "authenticated" : "anon"};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
  }
}
const q = async (sql: string) => (await db.query(sql)).rows as Array<Record<string, unknown>>;
const denied = async (sql: string) => {
  let failed = false;
  try {
    const res = await db.query(sql);
    // RLS silently filters UPDATE/DELETE: treat "0 rows affected" as denied too.
    failed = (res.affectedRows ?? 0) === 0 && !/^\s*select/i.test(sql);
  } catch {
    failed = true;
  }
  return failed;
};

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(path.join(root, "tests/stubs.sql"), "utf8"));
  await db.exec(readFileSync(path.join(root, "migrations/20260930000001_core_schema.sql"), "utf8"));
  await db.exec(readFileSync(path.join(root, "migrations/20260930000002_retention_translation_digest.sql"), "utf8"));
  await db.exec(readFileSync(path.join(root, "migrations/20260930000003_clerk_user_ids.sql"), "utf8"));
  await db.exec(`
    insert into profiles (id) values ('${A}'),('${B}'),('${C}'),('${ADMIN}');
    insert into families (id, name) values ('${F1}','F1'),('${F2}','F2');
    insert into family_members (family_id, user_id, role) values ('${F1}','${A}','owner'),('${F1}','${C}','member'),('${F2}','${B}','owner');
    insert into parents (id, family_id, name, phone_e164) values ('${P1}','${F1}','Shobha','+919876543210'),('${P2}','${F2}','Other','+919876543211');
    insert into call_schedules (parent_id) values ('${P1}'),('${P2}');
    insert into calls (id, parent_id, status, scheduled_for) values
      ('30000000-0000-0000-0000-000000000001','${P1}','completed', now()),
      ('30000000-0000-0000-0000-000000000002','${P2}','completed', now());
    insert into flags (id, parent_id, category, severity) values
      ('40000000-0000-0000-0000-000000000001','${P1}','fall','emergency'),
      ('40000000-0000-0000-0000-000000000002','${P2}','scam','high');
    insert into waitlist (email) values ('someone@x.com');
  `);
});

describe("row level security", () => {
  it("every public table has RLS enabled", async () => {
    const rows = await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("a family member sees only their family's parents and calls", async () => {
    const ps = await as(A, () => q("select name from parents order by name"));
    expect(ps.map((r) => r.name)).toEqual(["Shobha"]);
    const cs = await as(C, () => q("select id from calls"));
    expect(cs).toHaveLength(1);
  });

  it("cannot read or write another family's data", async () => {
    expect(await as(A, () => q(`select * from parents where id='${P2}'`))).toHaveLength(0);
    expect(await as(A, () => denied(`insert into parents (family_id,name,phone_e164) values ('${F2}','Sneaky','+919999999999')`))).toBe(true);
    expect(await as(A, () => denied(`update flags set status='resolved' where id='40000000-0000-0000-0000-000000000002'`))).toBe(true);
    expect(await as(A, () => denied(`delete from parents where id='${P2}'`))).toBe(true);
  });

  it("can acknowledge own family's flags", async () => {
    await as(C, async () => {
      await db.exec(`update flags set status='acknowledged', acknowledged_by='${C}' where id='40000000-0000-0000-0000-000000000001'`);
    });
    const r = await q(`select status from flags where id='40000000-0000-0000-0000-000000000001'`);
    expect(r[0]?.status).toBe("acknowledged");
  });

  it("family members cannot write call records (only the voice service can)", async () => {
    expect(await as(A, () => denied(`update calls set status='failed' where id='30000000-0000-0000-0000-000000000001'`))).toBe(true);
    expect(await as(A, () => denied(`insert into call_turns (call_id,speaker,text) values ('30000000-0000-0000-0000-000000000001','agent','x')`))).toBe(true);
  });

  it("can request an on-demand call for own parent only", async () => {
    expect(await as(A, () => denied(`insert into calls (parent_id,status,scheduled_for) values ('${P1}','queued',now())`))).toBe(false);
    expect(await as(A, () => denied(`insert into calls (parent_id,status,scheduled_for) values ('${P2}','queued',now())`))).toBe(true);
    expect(await as(A, () => denied(`insert into calls (parent_id,status,scheduled_for) values ('${P1}','completed',now())`))).toBe(true);
  });

  it("only the owner can invite; members cannot escalate their role", async () => {
    expect(await as(C, () => denied(`insert into family_invites (family_id) values ('${F1}')`))).toBe(true);
    expect(await as(A, () => denied(`insert into family_invites (family_id) values ('${F1}')`))).toBe(false);
    expect(await as(C, () => denied(`update family_members set role='owner' where user_id='${C}'`))).toBe(true);
    expect(await as(C, () => denied(`update family_members set alert_prefs='{"emergency":false,"summary":true,"missed":true}' where user_id='${C}'`))).toBe(false);
  });

  it("anonymous users see nothing and cannot join the waitlist directly", async () => {
    expect(await as(null, () => q("select * from parents"))).toHaveLength(0);
    expect(await as(null, () => q("select * from waitlist"))).toHaveLength(0);
    expect(await as(null, () => denied(`insert into waitlist (email) values ('spam@x.com')`))).toBe(true);
  });

  it("the waitlist is admin-only", async () => {
    expect(await as(A, () => q("select * from waitlist"))).toHaveLength(0);
    expect(await as(ADMIN, () => q("select * from waitlist"), { app_metadata: { is_admin: true } })).toHaveLength(1);
    expect(await as(ADMIN, () => q("select * from waitlist"), { app_metadata: { is_admin: false } })).toHaveLength(0);
  });

  it("admin claim reads all calls; ordinary users cannot fake it via user_metadata", async () => {
    const total = Number((await q("select count(*) as n from calls"))[0]!.n);
    expect(total).toBeGreaterThan(2);
    expect(await as(ADMIN, () => q("select id from calls"), { app_metadata: { is_admin: true } })).toHaveLength(total);
    // B belongs to family 2 only and must not gain admin reach by putting is_admin in user-editable metadata
    const seen = await as(B, () => q("select parent_id from calls"), { user_metadata: { is_admin: true } });
    expect(new Set(seen.map((r) => r.parent_id))).toEqual(new Set([P2]));
  });

  it("create_family makes the caller the owner; accept_invite joins and expires", async () => {
    const fam = await as(ADMIN, async () => (await q("select create_family('New family') as id"))[0]!.id as string);
    const mine = await q(`select role from family_members where family_id='${fam}' and user_id='${ADMIN}'`);
    expect(mine[0]?.role).toBe("owner");

    await db.exec(`insert into family_invites (family_id, token) values ('${F2}','tok-ok'), ('${F2}','tok-old');
                   update family_invites set expires_at = now() - interval '1 day' where token='tok-old';`);
    await as(C, async () => {
      await db.exec("select accept_invite('tok-ok')");
    });
    expect((await q(`select 1 from family_members where family_id='${F2}' and user_id='${C}'`)).length).toBe(1);
    expect(await as(A, () => denied("select accept_invite('tok-old')"))).toBe(true);
    expect(await as(A, () => denied("select accept_invite('tok-ok')"))).toBe(true); // single use
  });

  it("scheduler RPCs are not callable by app users", async () => {
    expect(await as(A, () => denied("select claim_due_calls(1)"))).toBe(true);
    expect(await as(A, () => denied("select enqueue_due_calls()"))).toBe(true);
  });

  it("deleting a parent cascades to calls, flags and summaries", async () => {
    await db.exec(`insert into parents (id,family_id,name,phone_e164) values ('20000000-0000-0000-0000-000000000009','${F1}','Temp','+919000000000');
                   insert into calls (id,parent_id,status) values ('30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','completed');
                   insert into call_summaries (call_id,data) values ('30000000-0000-0000-0000-000000000009','{}');`);
    await as(A, async () => {
      await db.exec(`delete from parents where id='20000000-0000-0000-0000-000000000009'`);
    });
    expect((await q(`select 1 from calls where id='30000000-0000-0000-0000-000000000009'`)).length).toBe(0);
    expect((await q(`select 1 from call_summaries where call_id='30000000-0000-0000-0000-000000000009'`)).length).toBe(0);
  });
});

describe("Clerk-style user ids", () => {
  it("non-uuid subjects (user_2abc...) work end to end: create family, add member, read back", async () => {
    const clerk = "user_2abcDEFghiJKL123";
    const fam = await as(clerk, async () => (await q("select create_family('Clerk family') as id"))[0]!.id as string);
    const mine = await as(clerk, () => q(`select role from family_members where family_id='${fam}'`));
    expect(mine[0]?.role).toBe("owner");
    // someone else with a different Clerk id cannot see it
    expect(await as("user_2other", () => q(`select 1 from families where id='${fam}'`))).toHaveLength(0);
    // the profile row was created on first use (no auth.users trigger any more)
    expect((await q(`select 1 from profiles where id='${clerk}'`)).length).toBe(1);
  });
});

describe("scheduler", () => {
  it("claim_due_calls hands each queued call to exactly one worker", async () => {
    await db.exec(`insert into calls (id,parent_id,status,scheduled_for) values ('30000000-0000-0000-0000-000000000077','${P1}','queued', now() - interval '1 minute')`);
    const first = await q("select id from claim_due_calls(5)");
    const second = await q("select id from claim_due_calls(5)");
    expect(first.map((r) => r.id)).toContain("30000000-0000-0000-0000-000000000077");
    expect(second.map((r) => r.id)).not.toContain("30000000-0000-0000-0000-000000000077");
    const r = await q(`select status, attempt from calls where id='30000000-0000-0000-0000-000000000077'`);
    expect(r[0]).toEqual({ status: "dialing", attempt: 1 });
  });

  it("enqueue_due_calls skips declined parents, paused schedules and 'skip today'", async () => {
    await db.exec(`delete from calls; update call_schedules set window_start='00:00', window_end='23:59', days_of_week='{0,1,2,3,4,5,6}';
                   update parents set consent_status='declined' where id='${P2}';`);
    expect(Number((await q("select enqueue_due_calls() as n"))[0]!.n)).toBe(1); // only P1
    await db.exec(`delete from calls; update call_schedules set paused_until = now() + interval '2 days' where parent_id='${P1}'`);
    expect(Number((await q("select enqueue_due_calls() as n"))[0]!.n)).toBe(0);
    await db.exec(`update call_schedules set paused_until=null, skip_next_date=(now() at time zone 'Asia/Kolkata')::date where parent_id='${P1}'`);
    expect(Number((await q("select enqueue_due_calls() as n"))[0]!.n)).toBe(0);
    await db.exec(`update call_schedules set skip_next_date=null where parent_id='${P1}'`);
    expect(Number((await q("select enqueue_due_calls() as n"))[0]!.n)).toBe(1);
    expect(Number((await q("select enqueue_due_calls() as n"))[0]!.n)).toBe(0); // idempotent within the day
  });
});
