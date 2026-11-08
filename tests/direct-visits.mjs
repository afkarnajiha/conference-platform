import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
let passed = 0;
const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  supervisor: "00000000-0000-0000-0000-000000000002",
  employee: "00000000-0000-0000-0000-000000000003",
  other: "00000000-0000-0000-0000-000000000004",
  disabled: "00000000-0000-0000-0000-000000000005",
};
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function user(id, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function scalar(sql, params = []) {
  const r = await db.query(sql, params);
  return Object.values(r.rows[0])[0];
}
async function reject(fn, pattern) {
  await assert.rejects(fn, pattern);
}
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,service_role;grant select,insert,delete on storage.objects to authenticated;`);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202611070001_platform.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202611070002_accounts.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
for (const [role, id] of Object.entries(ids)) {
  await db.query("insert into auth.users values($1)", [id]);
  await db.query(
    "insert into public.profiles(id,full_name,email,role,active,manage_employees) values($1,$2,$3,$4,$5,$6)",
    [
      id,
      `مستخدم ${role}`,
      `${role}@test.invalid`,
      role === "admin"
        ? "admin"
        : role === "supervisor"
          ? "supervisor"
          : "employee",
      role !== "disabled",
      role === "supervisor",
    ],
  );
}
await user(ids.admin);
const conf = await scalar(
  "select public.save_conference(null,'مؤتمر اختبار','الرياض','2026-11-08','2026-11-11')",
);
const ex = await scalar(
  "select public.register_exhibition($1,'معرض اختبار','شركة اختبار','https://example.invalid/exhibit')",
  [conf],
);

await db.exec("reset role");
await db.exec(
  await readFile(
    new URL("../supabase/upgrade-direct-visits.sql", import.meta.url),
    "utf8",
  ),
);
await user(ids.employee);
const fresh = await scalar(
  "select public.register_exhibition($1,'معرض مباشر','جهة مباشرة','QR-DIRECT')",
  [conf],
);
await check("New employee exhibition has no approval gate", async () =>
  assert.equal(
    await scalar("select needs_review from public.exhibitions where id=$1", [
      fresh,
    ]),
    false,
  ),
);
await check("Legacy reservations disabled", async () =>
  reject(
    () => db.query("select public.reserve_exhibition($1)", [fresh]),
    /permission denied/,
  ),
);
const data = {
  contact_name: "مسؤول الجهة",
  phone: "0501234567",
  business_activity: "خدمات تقنية",
  rating: 4,
  interest: "مرتفع",
  priority: "مرتفعة",
  opportunity: "فرصة جديدة",
  importance: "مرتفعة",
};
const path = ids.employee + "/" + fresh + "/1/file.pdf";
await check("Upload allowed without reservation", async () => {
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('visit-files',$1,$2)",
    [path, { size: 100, mimetype: "application/pdf" }],
  );
});
await check("Other user cannot upload into employee path", async () => {
  await user(ids.other);
  await reject(
    () =>
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('visit-files',$1,'{}')",
        [path],
      ),
    /row-level security/,
  );
});
let saved;
await check("Save all data and attachment without token or timer", async () => {
  await user(ids.employee);
  saved = await scalar("select public.save_visit_direct($1,1,$2,$3)", [
    fresh,
    data,
    [{ path, name: "ملف.pdf", mime_type: "application/pdf", size: 100 }],
  ]);
  assert.equal(
    await scalar("select employee_id from public.visits where id=$1", [saved]),
    ids.employee,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.visit_attachments where visit_id=$1",
      [saved],
    ),
    1,
  );
});
await check("Second writer cannot duplicate completed visit", async () => {
  await user(ids.other);
  await reject(
    () => db.query("select public.save_visit_direct($1,1,$2)", [fresh, data]),
    /ALREADY_VISITED/,
  );
});
await check("No reservation records created", async () =>
  assert.equal(
    await scalar("select count(*)::int from public.visit_reservations"),
    0,
  ),
);
await check("Existing data survives upgrade rerun", async () => {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL("../supabase/upgrade-direct-visits.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    await scalar("select count(*)::int from public.visits where id=$1", [
      saved,
    ]),
    1,
  );
});
await check("Disabled account cannot save", async () => {
  await user(ids.disabled);
  await reject(
    () => db.query("select public.save_visit_direct($1,1,$2)", [fresh, data]),
    /FORBIDDEN/,
  );
});
await check(
  "Admin additional round still protects against stale forms",
  async () => {
    await user(ids.admin);
    await db.query(
      "select public.reset_exhibition($1,true,'زيارة إضافية مطلوبة')",
      [fresh],
    );
    await user(ids.employee);
    await reject(
      () => db.query("select public.save_visit_direct($1,1,$2)", [fresh, data]),
      /ROUND_CHANGED/,
    );
    await db.query("select public.save_visit_direct($1,2,$2)", [fresh, data]);
    assert.equal(
      await scalar(
        "select count(*)::int from public.visits where exhibition_id=$1",
        [fresh],
      ),
      2,
    );
  },
);
await db.close();
console.log(passed + " direct-visit SQL checks passed");
