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
await check("RLS enabled on every application table", async () => {
  const rows = await db.query(
    "select relname from pg_class join pg_namespace n on relnamespace=n.oid where n.nspname='public' and relkind='r' and not relrowsecurity",
  );
  assert.equal(rows.rows.length, 0);
});
await check("Anonymous cannot read private data", async () => {
  await user("", "anon");
  await reject(
    () => db.query("select * from public.visits"),
    /permission denied/,
  );
});
await check("Anonymous cannot invoke reservation function", async () => {
  await reject(
    () => db.query("select public.reserve_exhibition($1)", [ex]),
    /permission denied/,
  );
});
await check("Employee cannot create a conference", async () => {
  await user(ids.employee);
  await reject(
    () =>
      db.query(
        "select public.save_conference(null,'غير مسموح','','2026-11-08','2026-11-11')",
      ),
    /FORBIDDEN/,
  );
});
await check(
  "Employees cannot mutate roles directly or invoke service-only account RPC",
  async () => {
    await reject(
      () =>
        db.query("update public.profiles set role='admin' where id=$1", [
          ids.employee,
        ]),
      /permission denied/,
    );
    await reject(
      () =>
        db.query("select public.manage_profile($1,'update',$1)", [
          ids.employee,
        ]),
      /permission denied/,
    );
  },
);
let reservation;
await check("First employee obtains a server-issued reservation", async () => {
  reservation = await scalar("select public.reserve_exhibition($1)", [ex]);
  assert.equal(reservation.status, "accepted");
  assert.ok(reservation.token);
});
await check(
  "Same employee reopens the same reservation without extending expiry",
  async () => {
    const reopened = await scalar("select public.reserve_exhibition($1)", [ex]);
    assert.equal(reopened.token, reservation.token);
    assert.equal(reopened.expires_at, reservation.expires_at);
  },
);
await check(
  "Second employee is rejected while reservation is active",
  async () => {
    await user(ids.other);
    const r = await scalar("select public.reserve_exhibition($1)", [ex]);
    assert.equal(r.status, "reserved");
    assert.equal(r.employee, "مستخدم employee");
  },
);
const payload = {
  contact_name: "مسؤول اختبار",
  phone: "+966501234567",
  email: "test@example.invalid",
  business_activity: "حلول تقنية",
  rating: 5,
  interest: "مرتفع",
  priority: "مرتفعة",
  opportunity: "فرصة توريد حلول تقنية",
  importance: "مرتفعة",
};
await check(
  "Second employee cannot save using stolen reservation token",
  async () => {
    await reject(
      () =>
        db.query("select public.save_visit($1,$2,$3)", [
          ex,
          reservation.token,
          payload,
        ]),
      /RESERVATION_EXPIRED/,
    );
  },
);
await check("Second employee cannot release another reservation", async () => {
  await db.query("select public.release_reservation($1,$2)", [
    ex,
    reservation.token,
  ]);
  assert.equal(
    await scalar(
      "select count(*)::int from public.visit_reservations where exhibition_id=$1",
      [ex],
    ),
    1,
  );
});
await check("Employee cannot reset a reservation", async () => {
  await reject(
    () =>
      db.query("select public.reset_exhibition($1,false,'سبب اختبار')", [ex]),
    /FORBIDDEN/,
  );
});
await check(
  "Storage blocks uploading outside the owner reservation",
  async () => {
    await reject(
      () =>
        db.query(
          "insert into storage.objects(bucket_id,name,metadata) values('visit-files',$1,'{}')",
          [`${ids.employee}/${ex}/${reservation.token}/x.pdf`],
        ),
      /row-level security/,
    );
  },
);
let visit;
await check(
  "Owner saves atomically with immutable server identity and timestamp",
  async () => {
    await user(ids.employee);
    visit = await scalar("select public.save_visit($1,$2,$3)", [
      ex,
      reservation.token,
      { ...payload, employee_id: ids.other, visited_at: "2000-01-01" },
    ]);
    const r = (
      await db.query("select * from public.visits where id=$1", [visit])
    ).rows[0];
    assert.equal(r.employee_id, ids.employee);
    assert.notEqual(String(r.visited_at).slice(0, 4), "2000");
    assert.equal(
      await scalar(
        "select count(*)::int from public.visit_reservations where exhibition_id=$1",
        [ex],
      ),
      0,
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.commercial_opportunities where visit_id=$1",
        [visit],
      ),
      1,
    );
  },
);
await check(
  "Duplicate visit reports existing employee and visit timestamp",
  async () => {
    await user(ids.other);
    const r = await scalar("select public.reserve_exhibition($1)", [ex]);
    assert.equal(r.status, "completed");
    assert.equal(r.visit_id, visit);
    assert.ok(r.visited_at);
  },
);
await check(
  "Unique constraint prevents duplicate rounds even for server inserts",
  async () => {
    await db.exec("reset role");
    await reject(
      () =>
        db.query(
          "insert into public.visits(exhibition_id,employee_id,visit_round,contact_name,phone,business_activity,rating,interest,priority) values($1,$2,1,'مسؤول','0501234567','تقنية',3,'متوسط','متوسطة')",
          [ex, ids.other],
        ),
      /unique/,
    );
  },
);
await check("Employee cannot edit another employee visit", async () => {
  await user(ids.other);
  await reject(
    () => db.query("select public.update_visit($1,$2)", [visit, payload]),
    /FORBIDDEN/,
  );
});
await check(
  "Visit owner can edit while identity remains immutable",
  async () => {
    await user(ids.employee);
    await db.query("select public.update_visit($1,$2)", [
      visit,
      { ...payload, notes: "تم تحديث البيانات", employee_id: ids.other },
    ]);
    assert.equal(
      await scalar("select employee_id from public.visits where id=$1", [
        visit,
      ]),
      ids.employee,
    );
  },
);
await check("Supervisor can review visits", async () => {
  await user(ids.supervisor);
  await db.query("select public.update_visit($1,$2)", [
    visit,
    { ...payload, notes: "مراجعة المشرف" },
  ]);
  assert.equal(
    await scalar("select notes from public.visits where id=$1", [visit]),
    "مراجعة المشرف",
  );
});
await check("Supervisor cannot reset completed exhibitions", async () => {
  await reject(
    () =>
      db.query("select public.reset_exhibition($1,true,'زيارة إضافية')", [ex]),
    /FORBIDDEN/,
  );
});
await check(
  "Admin allows an additional round while preserving history",
  async () => {
    await user(ids.admin);
    await db.query(
      "select public.reset_exhibition($1,true,'طلب زيارة إضافية')",
      [ex],
    );
    assert.equal(
      await scalar("select visit_round from public.exhibitions where id=$1", [
        ex,
      ]),
      2,
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.visits where exhibition_id=$1",
        [ex],
      ),
      1,
    );
  },
);
let newReservation;
await check(
  "Expired reservations can be acquired by another employee",
  async () => {
    await user(ids.employee);
    newReservation = await scalar("select public.reserve_exhibition($1)", [ex]);
    await db.exec("reset role");
    await db.query(
      "update public.visit_reservations set expires_at=now()-interval '1 second' where exhibition_id=$1",
      [ex],
    );
    await user(ids.other);
    const r = await scalar("select public.reserve_exhibition($1)", [ex]);
    assert.equal(r.status, "accepted");
    assert.notEqual(r.token, newReservation.token);
  },
);
await check(
  "Expired owner cannot save stale draft after reassignment",
  async () => {
    await user(ids.employee);
    await reject(
      () =>
        db.query("select public.save_visit($1,$2,$3)", [
          ex,
          newReservation.token,
          payload,
        ]),
      /RESERVATION_EXPIRED/,
    );
  },
);
let reviewEx;
await check("Employee-created exhibition requires review", async () => {
  reviewEx = await scalar(
    "select public.register_exhibition($1,'معرض جديد','جهة جديدة','QR-TEXT')",
    [conf],
  );
  const r = await scalar("select public.reserve_exhibition($1)", [reviewEx]);
  assert.equal(r.status, "review");
});
await check(
  "Employee cannot silently link a new code to an existing exhibition",
  async () => {
    await reject(
      () =>
        db.query("select public.register_exhibition($1,'','','ALIAS',$2)", [
          conf,
          ex,
        ]),
      /LINK_REQUIRES_REVIEW/,
    );
  },
);
await check("QR uniqueness is scoped to the conference", async () => {
  await reject(
    () =>
      db.query(
        "select public.register_exhibition($1,'معرض آخر','جهة أخرى','QR-TEXT')",
        [conf],
      ),
    /unique/,
  );
});
await check(
  "Supervisor reviews and links original organizer codes",
  async () => {
    await user(ids.supervisor);
    await db.query(
      "select public.edit_exhibition($1,'معرض جديد','جهة جديدة',true)",
      [reviewEx],
    );
    await db.query("select public.register_exhibition($1,'','','ALIAS',$2)", [
      conf,
      reviewEx,
    ]);
    assert.equal(
      await scalar(
        "select count(*)::int from public.exhibition_qr_codes where exhibition_id=$1",
        [reviewEx],
      ),
      2,
    );
  },
);
await check(
  "Assignments enforce actual conference range and Sunday–Wednesday",
  async () => {
    await reject(
      () =>
        db.query(
          "select public.assign_employee($1,$2,array['2026-11-12']::date[])",
          [conf, ids.employee],
        ),
      /INVALID_DAY/,
    );
    await db.query(
      "select public.assign_employee($1,$2,array['2026-11-08','2026-11-09']::date[])",
      [conf, ids.employee],
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.conference_assignments where employee_id=$1",
        [ids.employee],
      ),
      2,
    );
  },
);
await check(
  "Disabled account reads no company data and cannot reserve",
  async () => {
    await user(ids.disabled);
    assert.equal(await scalar("select count(*)::int from public.visits"), 0);
    await reject(
      () => db.query("select public.reserve_exhibition($1)", [reviewEx]),
      /FORBIDDEN/,
    );
  },
);
await check(
  "Server account RPC also denies supervisor escalation",
  async () => {
    await user(ids.supervisor, "service_role");
    await reject(
      () =>
        db.query(
          "select public.manage_profile($1,'update',$2,'موظف','','admin',true,false,'')",
          [ids.supervisor, ids.employee],
        ),
      /FORBIDDEN/,
    );
  },
);
await check("Last active admin cannot be disabled", async () => {
  await user(ids.admin, "service_role");
  await reject(
    () =>
      db.query(
        "select public.manage_profile($1,'update',$1,'المدير','','admin',false,false,'')",
        [ids.admin],
      ),
    /LAST_ADMIN/,
  );
});
await check("Audit records capture sensitive operations", async () => {
  await user(ids.admin);
  assert.ok(
    (await scalar("select count(*)::int from public.activity_logs")) >= 10,
  );
});
let filePath, attachedVisit, fileReservation;
await check(
  "Live reservation owner can upload to their own token path",
  async () => {
    await user(ids.employee);
    fileReservation = await scalar("select public.reserve_exhibition($1)", [
      reviewEx,
    ]);
    filePath = `${ids.employee}/${reviewEx}/${fileReservation.token}/fixture.pdf`;
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('visit-files',$1,$2)",
      [filePath, { size: 100, mimetype: "application/pdf" }],
    );
    assert.equal(
      await scalar("select count(*)::int from storage.objects where name=$1", [
        filePath,
      ]),
      1,
    );
  },
);
await check(
  "Another employee cannot read an unfinished attachment",
  async () => {
    await user(ids.other);
    assert.equal(
      await scalar("select count(*)::int from storage.objects where name=$1", [
        filePath,
      ]),
      0,
    );
  },
);
await check(
  "Forged attachment metadata rolls back the whole visit",
  async () => {
    await user(ids.employee);
    await reject(
      () =>
        db.query("select public.save_visit($1,$2,$3,$4)", [
          reviewEx,
          fileReservation.token,
          payload,
          [
            {
              path: filePath,
              name: "ملف.pdf",
              mime_type: "application/pdf",
              size: 99,
            },
          ],
        ]),
      /INVALID_FILES/,
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.visits where exhibition_id=$1",
        [reviewEx],
      ),
      0,
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.visit_reservations where exhibition_id=$1",
        [reviewEx],
      ),
      1,
    );
  },
);
await check(
  "Valid uploaded file is attached in the visit transaction",
  async () => {
    attachedVisit = await scalar("select public.save_visit($1,$2,$3,$4)", [
      reviewEx,
      fileReservation.token,
      payload,
      [
        {
          path: filePath,
          name: "ملف.pdf",
          mime_type: "application/pdf",
          size: 100,
        },
      ],
    ]);
    assert.equal(
      await scalar(
        "select count(*)::int from public.visit_attachments where visit_id=$1",
        [attachedVisit],
      ),
      1,
    );
  },
);
await check(
  "Team member may read files belonging to a completed visit",
  async () => {
    await user(ids.other);
    assert.equal(
      await scalar("select count(*)::int from storage.objects where name=$1", [
        filePath,
      ]),
      1,
    );
  },
);
await check("Even the uploader cannot remove an attached file", async () => {
  await user(ids.employee);
  await db.query("delete from storage.objects where name=$1", [filePath]);
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name=$1", [
      filePath,
    ]),
    1,
  );
});
await check("Disabled user cannot read storage objects", async () => {
  await user(ids.disabled);
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name=$1", [
      filePath,
    ]),
    0,
  );
});
await db.close();
console.log(
  `\n${passed} database checks passed. PGlite serializes statements; this does NOT prove multi-connection concurrency or hosted Supabase behavior.`,
);
