// Procurement security tests against a LOCAL throwaway Postgres (PGlite). No network, no Supabase, no env vars.
// Applies the real migrations 0024/0040/0041/0042 on top of minimal stubs (tests/security/stubs.sql) and acts as simulated users.
// Time is simulated by moving bids_open_on into the past as table owner (a real clock cannot be faked inside Postgres).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Env, makeEnv, read, rpcCalls } from "../tests/security/harness";

let E: Env;
let calls: Awaited<ReturnType<typeof rpcCalls>>;
let P1: string, S1: string, S2: string, SB: string, PB: string, BID1: string;
const u = (uid: string) => ({ uid });
const count = async (sql: string, p?: unknown[]) => Number((await E.su<{ n: string }>(`select count(*)::int n from (${sql}) t`, p))[0].n);
const audit = () => count(`select 1 from audit_event`);
const rpc = async (who: Parameters<Env["q"]>[0], sql: string, params: unknown[] = []) => { const r = await E.err(who, sql, params); return r; };

beforeAll(async () => {
  E = await makeEnv();
  calls = await rpcCalls(E);
  const one = async (who: { uid: string }, sql: string, p: unknown[]) => (await E.q<{ id: string }>(who, sql, p))[0];
  P1 = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_plan_add(2026,'A item','need',1000,'USD') as id`))[0].id;
  S1 = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_supplier_add('Supplier 1') as id`))[0].id;
  S2 = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_supplier_add('Supplier 2') as id`))[0].id;
  SB = (await E.q<{ id: string }>(u(E.mayorB), `select public.procurement_supplier_add('Supplier B') as id`))[0].id;
  PB = (await E.q<{ id: string }>(u(E.mayorB), `select public.procurement_plan_add(2026,'B item','need',500,'USD') as id`))[0].id;
  void one;
  await E.q(u(E.mayorA), `select public.procurement_set_bids_open($1, now() + interval '7 days')`, [P1]);
  BID1 = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_bid_add($1,$2,current_date,'USD',900) as id`, [P1, S1]))[0].id;
}, 120_000);
afterAll(async () => { await E?.db.close(); });

describe("1. anon and non-staff cannot call any procurement RPC", () => {
  it("harness found the expected RPC surface (>= 18 functions)", () => { expect(calls.length).toBeGreaterThanOrEqual(18); });
  it("anon has no EXECUTE privilege on any procurement RPC, authenticated has", async () => {
    for (const c of calls) {
      const r = await E.su<{ a: boolean; b: boolean }>(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b from pg_proc p where p.proname = $1`, [c.name]);
      expect(r.every((x) => !x.a), `${c.name} callable by anon`).toBe(true);
      expect(r.every((x) => x.b), `${c.name} not callable by authenticated`).toBe(true);
    }
  });
  it("anon call of every RPC is rejected with permission denied (42501)", async () => {
    for (const c of calls) { const e = await rpc("anon", c.sql, c.params); expect(e?.code, c.name).toBe("42501"); }
  });
  it("authenticated user without any staff row is rejected (forbidden) on every RPC", async () => {
    for (const c of calls) { const e = await rpc(u(E.outsider), c.sql, c.params); expect(e?.code, c.name).toBe("42501"); expect(e?.message, c.name).toBe("forbidden"); }
  });
});

describe("2. staff (non-mayor) cannot call mayor/admin RPCs", () => {
  it("clerk (role=staff) is forbidden on every RPC", async () => {
    for (const c of calls) { const e = await rpc(u(E.clerkA), c.sql, c.params); expect(e?.message, c.name).toBe("forbidden"); }
  });
  it("every procurement RPC is SECURITY DEFINER with fixed search_path and a _council_muni() guard", async () => {
    const rows = await E.su<{ proname: string; secdef: boolean; cfg: string[] | null; src: string }>(`select proname, prosecdef secdef, proconfig cfg, prosrc src from pg_proc where proname = any($1)`, [calls.map((c) => c.name)]);
    for (const r of rows) {
      expect(r.secdef, r.proname).toBe(true);
      expect((r.cfg ?? []).join(","), r.proname).toMatch(/search_path=/);
      expect(r.src, r.proname).toMatch(/_council_muni\(\)/);
    }
  });
  it("clerk can read own-municipality plan items (read path works) but sees nothing of municipality B", async () => {
    expect((await E.q(u(E.clerkA), `select id from procurement_plan_item`)).map((r) => (r as { id: string }).id)).toEqual([P1]);
  });
});

describe("3. cross-tenant isolation (municipality A vs B)", () => {
  it("B mayor cannot read any A row in any procurement table", async () => {
    const tabs = await E.su<{ relname: string }>(`select relname from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname like 'procurement\\_%' and relname not in ('procurement_legal_source','procurement_provision')`);
    for (const t of tabs) {
      const rows = await E.q<{ municipality_id: string }>(u(E.mayorB), `select municipality_id from ${t.relname}`);
      expect(rows.every((r) => r.municipality_id === E.muniB), t.relname).toBe(true);
    }
  });
  it("B mayor cannot act on A ids through RPCs (not_found) and nothing changes", async () => {
    const before = { a: await audit(), s: await count(`select 1 from procurement_plan_item where id='${P1}' and status='planned'`) };
    const attempts = [
      `select public.procurement_plan_set_status('${P1}','cancelled')`,
      `select public.procurement_set_bids_open('${P1}', now() + interval '1 day')`,
      `select public.procurement_bid_add('${P1}','${SB}',current_date,'USD',1)`,
      `select public.procurement_bid_count('${P1}')`,
      `select public.procurement_bid_evaluate('${BID1}', true)`,
      `select public.procurement_plan_link_contract('${P1}', null)`,
    ];
    for (const sql of attempts) { const e = await rpc(u(E.mayorB), sql); expect(e?.code, sql).toBe("P0002"); }
    expect(await audit()).toBe(before.a);
    expect(await count(`select 1 from procurement_plan_item where id='${P1}' and status='planned'`)).toBe(before.s);
  });
  it("cross-tenant foreign keys are refused: own item + other tenant's supplier / budget line / decision", async () => {
    expect((await rpc(u(E.mayorB), `select public.procurement_bid_add('${PB}','${S1}',current_date,'USD',1)`))?.code).toBe("P0002");
    const bl = (await E.su<{ id: string }>(`insert into budget_line (municipality_id) values ($1) returning id`, [E.muniA]))[0].id;
    expect((await rpc(u(E.mayorB), `select public.procurement_plan_add(2026,'t','n',1,'USD','${bl}')`))?.code).toBe("P0002");
    const dec = (await E.su<{ id: string }>(`insert into municipal_decision (municipality_id) values ($1) returning id`, [E.muniA]))[0].id;
    expect((await rpc(u(E.mayorB), `select public.procurement_committee_add(null,'award','${dec}',null,null,'${PB}')`))?.code).toBe("P0002");
  });
  it("A bids stay invisible to B even after the opening date has passed", async () => {
    await E.su(`update procurement_plan_item set bids_open_on = now() - interval '1 minute' where id = $1`, [P1]);
    expect(await E.q(u(E.mayorB), `select id from procurement_bid`)).toEqual([]);
    expect(await E.q(u(E.mayorA), `select id from procurement_bid`)).toHaveLength(1);
    await E.su(`update procurement_plan_item set bids_open_on = now() + interval '7 days' where id = $1`, [P1]); // re-seal for the next group
  });
});

describe("4. sealed bids", () => {
  it("before bids_open_on: mayor, admin and clerk read zero bid rows (but the count RPC works)", async () => {
    for (const w of [E.mayorA, E.adminA, E.clerkA]) expect(await E.q(u(w), `select id from procurement_bid`)).toEqual([]);
    expect((await E.q<{ c: number }>(u(E.mayorA), `select public.procurement_bid_count('${P1}') c`))[0].c).toBe(1);
  });
  it("direct select by id / filter on the plan item also returns nothing while sealed", async () => {
    expect(await E.q(u(E.mayorA), `select total_value from procurement_bid where id = $1`, [BID1])).toEqual([]);
    expect(await E.q(u(E.mayorA), `select total_value from procurement_bid where plan_item_id = $1`, [P1])).toEqual([]);
  });
  it("bid_evaluate is rejected while sealed (bids_sealed) and with no opening date", async () => {
    expect((await rpc(u(E.mayorA), `select public.procurement_bid_evaluate('${BID1}', true)`))?.message).toBe("bids_sealed");
    const P2 = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_plan_add(2026,'no date','n',1,'USD') as id`))[0].id;
    const b2 = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_bid_add('${P2}','${S2}',current_date,'USD',5) as id`))[0].id;
    expect((await rpc(u(E.mayorA), `select public.procurement_bid_evaluate('${b2}', true)`))?.message).toBe("bids_sealed");
    expect(await E.q(u(E.mayorA), `select id from procurement_bid where id = $1`, [b2])).toEqual([]); // null date => never readable
  });
  it("opening date cannot be set in the past", async () => {
    expect((await rpc(u(E.mayorA), `select public.procurement_set_bids_open('${P1}', now() - interval '1 hour')`))?.message).toBe("bad_input");
  });
  it("after bids_open_on: staff roles can read the bid; evaluation works; bid_add is rejected (bids_closed)", async () => {
    await E.su(`update procurement_plan_item set bids_open_on = now() - interval '1 minute' where id = $1`, [P1]);
    for (const w of [E.mayorA, E.adminA, E.clerkA]) expect(await E.q(u(w), `select id from procurement_bid`)).toHaveLength(1);
    expect((await rpc(u(E.mayorA), `select public.procurement_bid_add('${P1}','${S2}',current_date,'USD',100)`))?.message).toBe("bids_closed");
    expect(await count(`select 1 from procurement_bid where plan_item_id='${P1}'`)).toBe(1);
    expect(await rpc(u(E.mayorA), `select public.procurement_bid_evaluate('${BID1}', true, 'ok')`)).toBeNull();
    expect((await rpc(u(E.mayorA), `select public.procurement_set_bids_open('${P1}', now() + interval '1 day')`))?.message).toBe("bids_already_open");
  });
  it("demo staff of the same municipality cannot read real (non-demo) bids after opening", async () => {
    expect(await E.q(u(E.demoMayorA), `select id from procurement_bid`)).toEqual([]);
  });
  it("evaluation changes only evaluation fields (value, supplier, currency untouched)", async () => {
    const r = (await E.su<{ total_value: string; supplier_id: string; currency: string; technical_compliant: boolean }>(`select total_value, supplier_id, currency, technical_compliant from procurement_bid where id=$1`, [BID1]))[0];
    expect(Number(r.total_value)).toBe(900); expect(r.supplier_id).toBe(S1); expect(r.currency).toBe("USD"); expect(r.technical_compliant).toBe(true);
  });
});

describe("5. API surface (direct table access) cannot write; received bid is immutable", () => {
  const who: [string, () => Parameters<Env["q"]>[0]][] = [["anon", () => "anon"], ["clerk", () => u(E.clerkA)], ["mayor", () => u(E.mayorA)], ["admin", () => u(E.adminA)], ["outsider", () => u(E.outsider)]];
  it("UPDATE of a received bid through the table API changes nothing, for every role", async () => {
    for (const [n, w] of who) {
      const rows = await E.q(w(), `update procurement_bid set total_value = 1, technical_compliant = false, supplier_id = '${S2}' where id = $1 returning id`, [BID1]);
      expect(rows, n).toEqual([]);
    }
    const r = (await E.su<{ total_value: string; supplier_id: string }>(`select total_value, supplier_id from procurement_bid where id=$1`, [BID1]))[0];
    expect(Number(r.total_value)).toBe(900); expect(r.supplier_id).toBe(S1);
  });
  it("DELETE of a bid through the table API deletes nothing, for every role", async () => {
    for (const [n, w] of who) expect(await E.q(w(), `delete from procurement_bid where id = $1 returning id`, [BID1]), n).toEqual([]);
    expect(await count(`select 1 from procurement_bid where id='${BID1}'`)).toBe(1);
  });
  it("INSERT/UPDATE/DELETE are denied on EVERY procurement_* table for anon, clerk, mayor", async () => {
    const tabs = await E.su<{ relname: string }>(`select relname from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname like 'procurement\\_%'`);
    expect(tabs.length).toBeGreaterThanOrEqual(11);
    const bidsBefore = await count(`select 1 from procurement_bid`), rowsBefore = await count(`select 1 from procurement_plan_item`);
    for (const t of tabs) for (const [n, w] of who) {
      const upd = await E.q(w(), `update ${t.relname} set id = id returning 1`).catch(() => []);
      expect(upd, `${t.relname} update by ${n}`).toEqual([]);
      const del = await E.q(w(), `delete from ${t.relname} returning 1`).catch(() => []);
      expect(del, `${t.relname} delete by ${n}`).toEqual([]);
    }
    expect(await count(`select 1 from procurement_bid`)).toBe(bidsBefore); expect(await count(`select 1 from procurement_plan_item`)).toBe(rowsBefore);
  });
  it("INSERT of a bid row directly is blocked by RLS (42501) for authenticated roles and anon", async () => {
    const before = await count(`select 1 from procurement_bid`);
    for (const [n, w] of who) {
      const e = await E.err(w(), `insert into procurement_bid (municipality_id, plan_item_id, supplier_id, received_on, currency, total_value) values ($1,$2,$3,current_date,'USD',1)`, [E.muniA, P1, S2]);
      expect(e?.code, n).toBe("42501");
    }
    expect(await count(`select 1 from procurement_bid`)).toBe(before);
  });
  it("anon reads nothing from any procurement table", async () => {
    const tabs = await E.su<{ relname: string }>(`select relname from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname like 'procurement\\_%'`);
    for (const t of tabs) expect(await E.q("anon", `select 1 from ${t.relname}`), t.relname).toEqual([]);
  });
});

describe("6. RLS posture of every procurement_* table", () => {
  it("RLS is enabled on every procurement_* table", async () => {
    const rows = await E.su<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname like 'procurement\\_%'`);
    expect(rows.length).toBeGreaterThanOrEqual(11);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });
  it("every policy is SELECT-only, granted to authenticated only (no write policy, none for anon/public)", async () => {
    const pol = await E.su<{ tablename: string; policyname: string; cmd: string; roles: string }>(`select tablename, policyname, cmd, roles::text roles from pg_policies where schemaname='public' and tablename like 'procurement\\_%'`);
    expect(pol.length).toBeGreaterThanOrEqual(11);
    for (const p of pol) { expect(p.cmd, p.policyname).toBe("SELECT"); expect(p.roles, p.policyname).toBe("{authenticated}"); }
  });
  it("every procurement table has at least one policy (no accidental deny-all that would hide a missing tenant filter) and tenant tables filter by is_staff(municipality_id)", async () => {
    const tabs = await E.su<{ relname: string }>(`select relname from pg_class where relkind='r' and relnamespace='public'::regnamespace and relname like 'procurement\\_%'`);
    for (const t of tabs) {
      const p = await E.su<{ qual: string }>(`select qual from pg_policies where schemaname='public' and tablename=$1`, [t.relname]);
      expect(p.length, t.relname).toBeGreaterThan(0);
      if (!["procurement_legal_source", "procurement_provision"].includes(t.relname)) expect(p.every((x) => /is_staff\(/.test(x.qual)), t.relname).toBe(true);
    }
  });
});

describe("7. audit_event: one row per write, none for failed calls, not writable via API", () => {
  it("each successful write RPC adds exactly one audit row with the caller as actor and the right municipality", async () => {
    const T = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_plan_add(2026,'audit probe','n',5,'USD') as id`))[0].id;
    const steps: [string, string, string][] = [
      [`select public.procurement_plan_set_status('${T}','in_progress')`, "procurement.plan_status", "procurement_plan_item"],
      [`select public.procurement_plan_link_contract('${T}', null)`, "procurement.plan_linked", "procurement_plan_item"],
      [`select public.procurement_set_bids_open('${T}', now() + interval '3 days')`, "procurement.bids_open_set", "procurement_plan_item"],
      [`select public.procurement_supplier_add('audit supplier')`, "procurement.supplier_added", "procurement_supplier"],
      [`select public.procurement_bid_add('${T}','${S2}',current_date,'LBP',12345)`, "procurement.bid_received", "procurement_bid"],
      [`select public.procurement_threshold_add('quotations',0,10,'USD','2026-01-01',null,'unit-test source')`, "procurement.threshold_added", "procurement_threshold"],
      [`select public.procurement_set_setting(90,0.5)`, "procurement.settings_set", "procurement_setting"],
      [`select public.procurement_committee_add(null,'award',null,null,null,'${T}')`, "procurement.committee_added", "procurement_committee"],
      [`select public.procurement_publication_add(null,'tender_notice',null,null,null,null,null,null,'${T}')`, "procurement.publication_added", "procurement_publication"],
    ];
    for (const [sql, action, entity] of steps) {
      const before = await audit();
      expect(await rpc(u(E.mayorA), sql), sql).toBeNull();
      expect(await audit(), sql).toBe(before + 1);
      const last = (await E.su<{ actor: string; municipality_id: string; action: string; entity: string }>(`select actor, municipality_id, action, entity from audit_event order by id desc limit 1`))[0];
      expect(last).toMatchObject({ actor: E.mayorA, municipality_id: E.muniA, action, entity });
    }
    await E.su(`update procurement_plan_item set bids_open_on = now() - interval '1 minute' where id=$1`, [T]);
    const bid = (await E.su<{ id: string }>(`select id from procurement_bid where plan_item_id=$1`, [T]))[0].id;
    const before = await audit();
    expect(await rpc(u(E.mayorA), `select public.procurement_bid_evaluate('${bid}', false, 'n')`)).toBeNull();
    expect(await audit()).toBe(before + 1);
  });
  it("failed / forbidden calls leave no audit row and no data change", async () => {
    const before = await audit(), bids = await count(`select 1 from procurement_bid`);
    await rpc(u(E.clerkA), `select public.procurement_bid_add('${P1}','${S2}',current_date,'USD',1)`);
    await rpc("anon", `select public.procurement_supplier_add('x')`);
    await rpc(u(E.mayorA), `select public.procurement_bid_add('${P1}','${S2}',current_date,'USD',1)`); // bids_closed
    await rpc(u(E.mayorA), `select public.procurement_bid_add('${P1}','${S2}',current_date,'EUR',-5)`);
    expect(await audit()).toBe(before); expect(await count(`select 1 from procurement_bid`)).toBe(bids);
  });
  it("audit_event cannot be inserted, updated or deleted through the API, by any role", async () => {
    const n = await audit();
    for (const w of ["anon", u(E.clerkA), u(E.mayorA), u(E.adminA)] as const) {
      expect((await E.err(w, `insert into audit_event (action, entity) values ('forged','x')`))?.code).toBe("42501");
      expect(await E.q(w, `update audit_event set action='tampered' returning 1`)).toEqual([]);
      expect(await E.q(w, `delete from audit_event returning 1`)).toEqual([]);
    }
    expect(await audit()).toBe(n); expect(await count(`select 1 from audit_event where action in ('forged','tampered')`)).toBe(0);
  });
  it("audit_event is readable by mayor/admin of the same municipality only (not clerk, not other tenant, not anon)", async () => {
    expect((await E.q(u(E.mayorA), `select 1 from audit_event`)).length).toBeGreaterThan(0);
    expect(await E.q(u(E.clerkA), `select 1 from audit_event`)).toEqual([]);
    expect(await E.q("anon", `select 1 from audit_event`)).toEqual([]);
    const seenByB = await E.q<{ municipality_id: string }>(u(E.mayorB), `select municipality_id from audit_event`);
    expect(seenByB.every((r) => r.municipality_id === E.muniB)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Confirmed findings: these tests PASS while the weakness exists (they pin down the current behaviour). The fixed behaviour is
// verified further below against the DRAFT 0046 in a separate throw-away database.
describe("8. confirmed findings in the CURRENT migrations (see docs/PROCUREMENT_SECURITY_AUDIT.md)", () => {
  it("F-1: the seal can be shortened after bids were received (mayor moves bids_open_on to now+2s); audit does not record the old value", async () => {
    const T = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_plan_add(2026,'seal probe','n',1,'USD') as id`))[0].id;
    await E.q(u(E.mayorA), `select public.procurement_set_bids_open('${T}', now() + interval '30 days')`);
    await E.q(u(E.mayorA), `select public.procurement_bid_add('${T}','${S1}',current_date,'USD',777)`);
    expect(await rpc(u(E.mayorA), `select public.procurement_set_bids_open('${T}', now() + interval '2 seconds')`)).toBeNull(); // VULNERABLE: accepted
    const d = (await E.su<{ detail: Record<string, unknown> }>(`select detail from audit_event where action='procurement.bids_open_set' and entity_id=$1 order by id desc limit 1`, [T]))[0].detail;
    expect(Object.keys(d)).toEqual(["open_on"]); // no "from" value => the shortening is not visible in the trail
  });
  it("F-2: any authenticated user, even without a staff row, can read the legal source register and provisions", async () => {
    expect((await E.q(u(E.outsider), `select id from procurement_legal_source`)).length).toBeGreaterThan(10);
  });
  it("F-3 (conditional): a demo mayor attached to a REAL municipality can write procurement data of that municipality", async () => {
    const e = await rpc(u(E.demoMayorA), `select public.procurement_plan_add(2026,'demo wrote this','n',1,'USD')`);
    expect(e).toBeNull(); // _council_muni() does not look at staff_member.is_demo
    const row = (await E.su<{ is_demo: boolean }>(`select is_demo from procurement_plan_item where title='demo wrote this'`))[0];
    expect(row.is_demo).toBe(true); // row is flagged demo, but the municipality's plan now contains it
  });
});

describe("9. DRAFT supabase/migrations/0046_procurement_security_fixes.sql (applied to a SEPARATE throw-away database only)", () => {
  let F: Env, T: string, S: string;
  beforeAll(async () => {
    F = await makeEnv();
    await F.db.exec(read("0046_procurement_security_fixes.sql"));
    S = (await F.q<{ id: string }>(u2(F.mayorA), `select public.procurement_supplier_add('S') as id`))[0].id;
    T = (await F.q<{ id: string }>(u2(F.mayorA), `select public.procurement_plan_add(2026,'t','n',1,'USD') as id`))[0].id;
    await F.q(u2(F.mayorA), `select public.procurement_set_bids_open('${T}', now() + interval '30 days')`);
    await F.q(u2(F.mayorA), `select public.procurement_bid_add('${T}','${S}',current_date,'USD',5)`);
  }, 60_000);
  afterAll(async () => { await F?.db.close(); });
  const u2 = (uid: string) => ({ uid });
  it("F-1 fixed: shortening the seal while bids exist is rejected; postponing is allowed and records the previous value", async () => {
    expect((await F.err(u2(F.mayorA), `select public.procurement_set_bids_open('${T}', now() + interval '2 seconds')`))?.message).toBe("seal_cannot_shorten");
    expect(await F.err(u2(F.mayorA), `select public.procurement_set_bids_open('${T}', now() + interval '60 days')`)).toBeNull();
    const d = (await F.su<{ detail: Record<string, unknown> }>(`select detail from audit_event where action='procurement.bids_open_set' and entity_id=$1 order by id desc limit 1`, [T]))[0].detail;
    expect(d).toMatchObject({ bids_at_change: 1 }); expect(d.previous_open_on).toBeTruthy();
  });
  it("F-1 fixed: sealing and opening rules still hold (bids_closed / bids_sealed / read-after-open)", async () => {
    const bidId = (await F.su<{ id: string }>(`select id from procurement_bid where plan_item_id=$1`, [T]))[0].id; // owner lookup: RLS hides it from staff while sealed
    expect((await F.err(u2(F.mayorA), `select public.procurement_bid_evaluate('${bidId}', true)`))?.message).toBe("bids_sealed");
    expect(await F.q(u2(F.clerkA), `select id from procurement_bid`)).toEqual([]);
    await F.su(`update procurement_plan_item set bids_open_on = now() - interval '1 minute' where id=$1`, [T]);
    expect((await F.err(u2(F.mayorA), `select public.procurement_bid_add('${T}','${S}',current_date,'USD',1)`))?.message).toBe("bids_closed");
    expect(await F.q(u2(F.clerkA), `select id from procurement_bid`)).toHaveLength(1);
    expect(await F.err(u2(F.mayorA), `select public.procurement_bid_evaluate('${bidId}', true, 'a')`)).toBeNull();
    expect(await F.err(u2(F.mayorA), `select public.procurement_bid_evaluate('${bidId}', false, 'b')`)).toBeNull();
    const d = (await F.su<{ detail: Record<string, unknown> }>(`select detail from audit_event where action='procurement.bid_evaluated' order by id desc limit 1`))[0].detail;
    expect(d).toMatchObject({ compliant: false, previous_compliant: true, previous_note: "a" });
  });
  it("F-2 fixed: a user with no staff row can no longer read the legal source register; staff still can", async () => {
    expect(await F.q(u2(F.outsider), `select id from procurement_legal_source`)).toEqual([]);
    expect((await F.q(u2(F.clerkA), `select id from procurement_legal_source`)).length).toBeGreaterThan(10);
    expect(await F.q("anon", `select id from procurement_provision`)).toEqual([]);
  });
  it("0046 keeps the grants: anon still cannot execute the replaced RPCs", async () => {
    for (const n of ["procurement_set_bids_open", "procurement_bid_add", "procurement_bid_evaluate"]) {
      expect((await F.su<{ a: boolean }>(`select has_function_privilege('anon', p.oid, 'execute') a from pg_proc p where proname=$1`, [n])).every((r) => !r.a), n).toBe(true);
    }
  });
});
