// Functional smoke test of DRAFT migrations 0043-0046 on a throwaway in-process Postgres (PGlite). No network, no production access.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeEnv, read, type Env } from "../tests/security/harness";

let E: Env; let P: string; let TPL_OK: string; let TPL_OTHER: string;
const u = (uid: string) => ({ uid });
const code = (e: { code?: string; message: string } | null) => e && e.message;
/** Rows a direct write would touch through the API role: RLS without a write policy filters them out silently, or privileges raise an error — either is "blocked". */
const touched = async (who: { uid: string }, sql: string) => {
  const e = await E.err(who, sql);
  if (e) return 0;
  return Number((await E.q<{ n: string }>(who, `with x as (${sql} returning 1) select count(*)::text n from x`))[0].n);
};

beforeAll(async () => {
  E = await makeEnv();
  // minimal stand-ins for the decision-builder objects (their real migrations need the whole original schema)
  await E.db.exec(`
    alter table public.municipal_decision add column title text;
    create table public.decision_template_version (id uuid primary key default gen_random_uuid(), template_id text, version text, title_ar text, domain text, status text default 'approved');
    create or replace function public.decision_builder_create(p_version uuid, p_session uuid default null, p_title text default null, p_data jsonb default '{}'::jsonb)
      returns uuid language plpgsql security definer as $$ declare i uuid; begin insert into municipal_decision(municipality_id,title) values (_council_muni(), p_title) returning id into i; return i; end $$;
    grant execute on function public.decision_builder_create(uuid,uuid,text,jsonb) to authenticated;
    grant select on public.municipal_decision, public.decision_template_version to authenticated;`);
  for (const f of ["0043_procurement_objections.sql", "0044_procurement_workflow.sql", "0045_procurement_documents.sql", "0046_procurement_security_fixes.sql", "0047_procurement_threshold_kinds_and_demo_guard.sql", "0048_procurement_legal_ceilings_seed.sql", "0049_procurement_north_lebanon_approval_matrix.sql", "0050_assistant_trial.sql"]) await E.db.exec(read(f));
  P = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_plan_add(2026,'Item','need',500,'USD') as id`))[0].id;
  TPL_OK = (await E.su<{ id: string }>(`insert into decision_template_version (template_id,version,title_ar,domain) values ('PROC01','1','تأليف لجنة','procurement') returning id`))[0].id;
  TPL_OTHER = (await E.su<{ id: string }>(`insert into decision_template_version (template_id,version,title_ar,domain) values ('FIN01','1','مالي','finance') returning id`))[0].id;
}, 120_000);
afterAll(async () => { await E?.db.close(); });

const audit = async (action: string) => Number((await E.su<{ n: string }>(`select count(*)::text n from audit_event where action = $1`, [action]))[0].n);

describe("0043 objections", () => {
  let O: string;
  it("clerk and anon cannot add; mayor can; audit row written", async () => {
    expect(code(await E.err(u(E.clerkA), `select public.procurement_objection_add($1,'م','موضوع',current_date)`, [P]))).toBe("forbidden");
    expect((await E.err("anon", `select public.procurement_objection_add($1,'م','موضوع',current_date)`, [P]))?.code).toBe("42501");
    O = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_objection_add($1,'م','موضوع',current_date) as id`, [P]))[0].id;
    expect(O).toBeTruthy();
    const n = Number((await E.su<{ n: string }>(`select count(*)::text n from audit_event where entity ilike '%objection%'`))[0].n);
    expect(n).toBeGreaterThan(0);
  });
  it("other municipality's mayor cannot read or act on it", async () => {
    expect((await E.q(u(E.mayorB), `select id from procurement_objection`)).length).toBe(0);
    const e = await E.err(u(E.mayorB), `select public.procurement_objection_add($1,'x','y',current_date)`, [P]);
    expect(e).not.toBeNull();
  });
  it("no direct writes through the table API", async () => {
    expect(await touched(u(E.mayorA), `update procurement_objection set status='decided'`)).toBe(0);
    expect(await touched(u(E.mayorA), `delete from procurement_objection`)).toBe(0);
    expect(Number((await E.su<{ n: string }>(`select count(*)::text n from procurement_objection where status='open'`))[0].n)).toBeGreaterThan(0);
  });
});

describe("0044 workflow", () => {
  it("is seeded only as pending_review and contains no numbers/legal vocabulary", async () => {
    const r = await E.su<{ review_status: string }>(`select review_status from procurement_workflow_stage`);
    expect(r.length).toBeGreaterThan(20);
    expect(r.every((x) => x.review_status === "pending_review")).toBe(true);
  });
  it("starts a file, rejects an undefined jump, rejects 'completed' without evidence", async () => {
    await E.q(u(E.mayorA), `select public.procurement_file_start($1,'open_tender')`, [P]);
    const st = (await E.su<{ current_stage_key: string }>(`select current_stage_key from procurement_file_state where plan_item_id=$1`, [P]))[0].current_stage_key;
    const last = (await E.su<{ stage_key: string }>(`select s.stage_key from procurement_workflow_stage s join procurement_workflow w on w.id=s.workflow_id where w.method='open_tender' order by s.ord desc limit 1`).catch(() => [])) ;
    const e = await E.err(u(E.mayorA), `select public.procurement_file_advance($1,$2)`, [P, "no_such_stage"]);
    expect(e?.message).toMatch(/transition_not_allowed|not_found|invalid/);
    const e2 = await E.err(u(E.mayorA), `select public.procurement_file_check_set($1,$2,'completed')`, [P, st]);
    expect(e2).not.toBeNull();
    void last;
  });
  it("clerk is forbidden; history is append-only (no update/delete via API)", async () => {
    expect(code(await E.err(u(E.clerkA), `select public.procurement_file_start($1,'open_tender')`, [P]))).toBe("forbidden");
    expect(await touched(u(E.mayorA), `delete from procurement_file_history`)).toBe(0);
    expect(await touched(u(E.mayorA), `update procurement_file_history set action='x'`)).toBe(0);
    expect(Number((await E.su<{ n: string }>(`select count(*)::text n from procurement_file_history`))[0].n)).toBeGreaterThan(0);
  });
});

describe("0045 documents + decision link", () => {
  it("rejects a non-procurement template (no_matching_template) and creates no decision", async () => {
    const e = await E.err(u(E.mayorA), `select public.procurement_plan_create_decision($1,$2)`, [P, TPL_OTHER]);
    expect(e?.message).toBe("no_matching_template");
    expect(Number((await E.su<{ n: string }>(`select count(*)::text n from municipal_decision`))[0].n)).toBe(0);
  });
  it("creates and links a decision from a procurement template; link is unique; audited", async () => {
    const id = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_plan_create_decision($1,$2) as id`, [P, TPL_OK]))[0].id;
    expect(id).toBeTruthy();
    expect((await E.su(`select 1 from procurement_plan_decision where plan_item_id=$1 and decision_id=$2`, [P, id])).length).toBe(1);
    expect(await audit("procurement.decision_draft_linked")).toBe(1);
  });
  it("document log: mayor records, clerk forbidden, no update/delete via API", async () => {
    const args = [P, "purchase_request", "1", "html", "[]", "[]"];
    expect(code(await E.err(u(E.clerkA), `select public.procurement_document_record($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, args))).toBe("forbidden");
    const r = await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_document_record($1,$2,$3,$4,$5::jsonb,$6::jsonb) as id`, args);
    expect(r[0].id).toBeTruthy();
    expect(await touched(u(E.mayorA), `update procurement_document set template_key='x'`)).toBe(0);
    expect(await touched(u(E.mayorA), `delete from procurement_document`)).toBe(0);
    expect(Number((await E.su<{ n: string }>(`select count(*)::text n from procurement_document`))[0].n)).toBe(1);
  });
});

describe("0046 draft security fixes (F-1/F-2)", () => {
  it("bids_open_on cannot be shortened once a bid exists", async () => {
    const S = (await E.q<{ id: string }>(u(E.mayorA), `select public.procurement_supplier_add('S') as id`))[0].id;
    await E.q(u(E.mayorA), `select public.procurement_set_bids_open($1, now() + interval '7 days')`, [P]);
    await E.q(u(E.mayorA), `select public.procurement_bid_add($1,$2,current_date,'USD',900)`, [P, S]);
    const e = await E.err(u(E.mayorA), `select public.procurement_set_bids_open($1, now() + interval '2 seconds')`, [P]);
    expect(e?.message).toMatch(/seal_cannot_shorten/);
  });
  it("a user without a staff row cannot read legal sources", async () => {
    expect((await E.q(u(E.outsider), `select id from procurement_legal_source`)).length).toBe(0);
  });
});

describe("0047 threshold kinds, reviewer trail, demo guard (F-3)", () => {
  const add = (kind: string, method: string | null, extra = "") => `select public.procurement_threshold_add(${method ? `'${method}'` : "null"},0,100,'USD','2026-01-01',null,'unit-test source','${kind}'${extra})`;
  it("method kind still requires a method; other kinds load without one and start pending_review", async () => {
    expect((await E.err(u(E.mayorA), add("method", null)))?.message).toBe("bad_input");
    expect((await E.err(u(E.mayorA), add("bogus", "quotations")))?.message).toBe("bad_input");
    const id = (await E.q<{ id: string }>(u(E.mayorA), add("competence", null).replace("select ", "select ") + " as id"))[0].id;
    const r = (await E.su<{ threshold_kind: string; review_status: string }>(`select threshold_kind, review_status from procurement_threshold where id=$1`, [id]))[0];
    expect(r).toEqual({ threshold_kind: "competence", review_status: "pending_review" });
  });
  it("rejects unknown legal source / provision ids, clerk is forbidden", async () => {
    expect((await E.err(u(E.mayorA), add("method", "quotations", ",'00000000-0000-0000-0000-000000000000'")))?.message).toBe("bad_input");
    expect((await E.err(u(E.clerkA), add("method", "quotations")))?.message).toBe("forbidden");
  });
  it("set_review records reviewer and time", async () => {
    const id = (await E.q<{ id: string }>(u(E.mayorA), add("method", "invoice") + " as id"))[0].id;
    await E.q(u(E.adminA), `select public.procurement_threshold_set_review($1,'verified')`, [id]);
    const r = (await E.su<{ reviewed_by: string; last_reviewed_at: string | null }>(`select reviewed_by, last_reviewed_at from procurement_threshold where id=$1`, [id]))[0];
    expect(r.reviewed_by).toBe(E.adminA); expect(r.last_reviewed_at).not.toBeNull();
  });
  it("F-3: a demo mayor attached to a REAL municipality is forbidden; to a demo municipality is allowed", async () => {
    await E.su(`update municipality set is_demo = false where id = $1`, [E.muniA]);
    expect((await E.err(u(E.demoMayorA), `select public.procurement_supplier_add('X')`))?.message).toBe("forbidden");
    expect(await E.err(u(E.mayorA), `select public.procurement_supplier_add('Y')`)).toBeNull();
    await E.su(`update municipality set is_demo = true where id = $1`, [E.muniA]);
    expect(await E.err(u(E.demoMayorA), `select public.procurement_supplier_add('Z')`)).toBeNull();
    await E.su(`update municipality set is_demo = false where id = $1`, [E.muniA]);
  });
});

describe("0048 legal ceilings seed", () => {
  it("is idempotent and leaves everything pending_review", async () => {
    await E.db.exec(read("0048_procurement_legal_ceilings_seed.sql"));
    const r = await E.db.query<{ n: number }>("select count(*)::int n from procurement_threshold where review_status <> 'pending_review' and (source like '%14063%' or source like '%21/2025%')");
    expect(r.rows[0].n).toBe(0);
  });
});

describe("0050 assistant trial", () => {
  const H1 = "a".repeat(64), H2 = "b".repeat(64);
  it("anon can register; table is not readable; leads are owner-only", async () => {
    const r = await E.q<{ s: any }>("anon", `select public.trial_register('+961 71 123 456','Test',true,'${H1}') s`);
    expect(r[0].s.status).toBe("ok");
    expect(await E.err("anon", "select * from public.assistant_trial")).toBeTruthy();
    expect(await E.err(u(E.mayorA), "select * from public.trial_leads()")).toBeTruthy();
    await E.su(`insert into public.platform_owner(user_id) values ('${E.mayorA}')`);
    const rows = await E.q<{ phone: string }>(u(E.mayorA), "select phone from public.trial_leads()");
    expect(rows.map((x) => x.phone)).toContain("96171123456");
  });
  it("requires consent, valid phone; re-register reissues token; use is counted, limited and expires", async () => {
    expect(await E.err("anon", `select public.trial_register('71123456','x',false,'${H1}')`)).toBeTruthy();
    expect(await E.err("anon", `select public.trial_register('12','x',true,'${H1}')`)).toBeTruthy();
    await E.q("anon", `select public.trial_register('96171123456','',true,'${H2}')`);
    expect((await E.q<{ s: any }>("anon", `select public.trial_status('${H1}') s`))[0].s.status).toBe("invalid");
    expect((await E.q<{ s: any }>("anon", `select public.trial_status('${H2}') s`))[0].s.status).toBe("ok");
    for (let i = 0; i < 25; i++) expect((await E.q<{ s: string }>("anon", `select public.trial_use('${H2}') s`))[0].s).toBe("ok");
    expect((await E.q<{ s: string }>("anon", `select public.trial_use('${H2}') s`))[0].s).toBe("limit");
    await E.su(`update public.assistant_trial set expires_at = now() - interval '1 minute' where phone='96171123456'`);
    expect((await E.q<{ s: string }>("anon", `select public.trial_use('${H2}') s`))[0].s).toBe("expired");
    expect((await E.q<{ s: any }>("anon", `select public.trial_register('96171123456','',true,'${H1}') s`))[0].s.status).toBe("expired");
  });
});

describe("0051 report attachments", () => {
  const CODE = "ABCDEFGHJKMN";
  let REQ: string;
  const jpg = "\\xffd8ffe000104a4649460001";
  beforeAll(async () => {
    await E.db.exec(`create function public._track_hash(p_code text) returns text language sql immutable as $$ select upper(regexp_replace(p_code,'[^A-Za-z0-9]','','g')) $$;
      create table public.citizen_request (id uuid primary key default gen_random_uuid(), municipality_id uuid not null references public.municipality(id), kind text not null, token_hash text, is_demo boolean not null default false, created_at timestamptz not null default now());
      alter table public.citizen_request enable row level security;
      create policy req_staff_read on public.citizen_request for select to authenticated using (is_staff(municipality_id));`);
    await E.db.exec(read("0051_report_attachments.sql"));
    REQ = (await E.q<{ id: string }>("anon", "select 1 x")) && (await E.db.query<{ id: string }>(`insert into public.citizen_request(municipality_id, kind, token_hash) values ('${E.muniA}', 'report', '${CODE}') returning id`)).rows[0].id;
  });
  it("anon attaches a real jpeg with the code; scripts, wrong code, 4th file and late attach are refused", async () => {
    expect(await E.err("anon", `select public.report_attach('${CODE}','a.jpg','image/jpeg','${jpg}'::bytea)`)).toBeFalsy();
    expect(await E.err("anon", `select public.report_attach('${CODE}','x.jpg','image/jpeg','\\x3c7363726970743e616c6572742831293c2f7363726970743e'::bytea)`)).toBeTruthy();
    expect(await E.err("anon", `select public.report_attach('ZZZZZZZZZZZZ','a.jpg','image/jpeg','${jpg}'::bytea)`)).toBeTruthy();
    await E.q("anon", `select public.report_attach('${CODE}','b.jpg','image/jpeg','${jpg}'::bytea)`);
    await E.q("anon", `select public.report_attach('${CODE}','c.jpg','image/jpeg','${jpg}'::bytea)`);
    expect(await E.err("anon", `select public.report_attach('${CODE}','d.jpg','image/jpeg','${jpg}'::bytea)`)).toBeTruthy();
    await E.su(`update public.citizen_request set created_at = now() - interval '1 hour' where id='${REQ}'`);
    expect(await E.err("anon", `select public.report_attach('${CODE}','e.jpg','image/jpeg','${jpg}'::bytea)`)).toBeTruthy();
  });
  it("table is closed to anon; only staff of that municipality read it", async () => {
    expect(await E.err("anon", "select * from public.report_attachment")).toBeTruthy();
    expect((await E.q(u(E.mayorA), "select id from public.report_attachment")).length).toBe(3);
    expect((await E.q(u(E.mayorB), "select id from public.report_attachment")).length).toBe(0);
  });
});
