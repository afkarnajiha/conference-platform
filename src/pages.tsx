import { useState } from "react";
import { EmployeeImport } from "./EmployeeImport";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpLeft,
  ScanLine,
  Plus,
  Building2,
  Users,
  CheckCheck,
  BriefcaseBusiness,
  CalendarDays,
  MapPin,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { useStore } from "./store";
import { accountAction, rpc } from "./api";
import {
  Heading,
  Empty,
  Badge,
  DataTable,
  Modal,
  Field,
  Form,
  Submit,
} from "./components";
import {
  conferenceDays,
  dayKey,
  exhibitionStatus,
  roleNames,
  saDate,
  type Row,
  type Role,
} from "./domain";
export function useConferenceData() {
  const s = useStore();
  const exhibitions = s.data.exhibitions.filter(
      (e) => e.conference_id === s.conferenceId,
    ),
    ids = new Set(exhibitions.map((e) => e.id)),
    visits = s.data.visits.filter((v) => ids.has(v.exhibition_id)),
    visitIds = new Set(visits.map((v) => v.id)),
    opportunities = s.data.commercial_opportunities.filter((o) =>
      visitIds.has(o.visit_id),
    ),
    assignments = s.data.conference_assignments.filter(
      (a) => a.conference_id === s.conferenceId,
    );
  const name = (id: string) =>
    s.data.profiles.find((p) => p.id === id)?.full_name || "حساب سابق";
  return { ...s, exhibitions, visits, opportunities, assignments, name };
}
export function NeedConference() {
  const s = useStore();
  return (
    <Empty
      title="لم تتم إضافة مؤتمر"
      text="ابدأ بإعداد المؤتمر ليتمكن الفريق من تنظيم المشاركة وتسجيل الزيارات."
    >
      {s.profile?.role === "admin" && (
        <Link className="button primary" to="/settings">
          <Plus size={18} />
          إضافة مؤتمر
        </Link>
      )}
    </Empty>
  );
}
export function Dashboard() {
  const s = useConferenceData();
  if (!s.conference) return <NeedConference />;
  const employee = s.profile?.role === "employee",
    myVisits = s.visits.filter((v) => v.employee_id === s.profile?.id),
    completed = s.exhibitions.filter(
      (e) =>
        exhibitionStatus(e, s.visits, s.data.visit_reservations) ===
        "تمت الزيارة",
    ).length,
    pending = s.exhibitions.filter(
      (e) =>
        exhibitionStatus(e, s.visits, s.data.visit_reservations) ===
        "لم تتم الزيارة",
    ).length,
    ratio = s.exhibitions.length
      ? Math.round((completed / s.exhibitions.length) * 100)
      : 0;
  const myDates = s.assignments.filter((a) => a.employee_id === s.profile?.id);
  return (
    <>
      <Heading
        eyebrow={saDate(new Date().toISOString(), true)}
        title={`مرحبًا، ${s.profile?.full_name.split(" ")[0]}`}
        description="كل مشاركة منظّمة تصنع فرصًا أفضل. إليك ملخص المؤتمر اليوم."
      >
        <Link className="button primary" to="/scan">
          <ScanLine size={19} />
          مسح رمز المعرض
        </Link>
      </Heading>
      <section className="conference-banner">
        <div>
          <span className="eyebrow">المؤتمر الحالي</span>
          <h2>{s.conference.name}</h2>
          <div className="meta">
            <span>
              <MapPin size={15} />
              {s.conference.location || "لم يحدد الموقع"}
            </span>
            <span>
              <CalendarDays size={15} />
              {saDate(s.conference.starts_on, true)} —{" "}
              {saDate(s.conference.ends_on, true)}
            </span>
          </div>
        </div>
        <Link to="/schedule" className="button light">
          جدول المشاركة
          <ArrowUpLeft size={17} />
        </Link>
      </section>
      <div className="stats-grid">
        {(employee
          ? [
              [Building2, "زياراتي المكتملة", myVisits.length],
              [CheckCheck, "المعارض غير المزارة", pending],
              [Users, "أيام مشاركتي", myDates.length],
              [
                BriefcaseBusiness,
                "فرصي التجارية",
                s.opportunities.filter((o) =>
                  myVisits.some((v) => v.id === o.visit_id),
                ).length,
              ],
            ]
          : [
              [Building2, "إجمالي المعارض", s.exhibitions.length],
              [CheckCheck, "الزيارات المكتملة", s.visits.length],
              [
                Users,
                "الموظفون المشاركون",
                new Set(s.assignments.map((a) => a.employee_id)).size,
              ],
              [BriefcaseBusiness, "الفرص التجارية", s.opportunities.length],
            ]
        ).map(([I, t, n], i) => {
          const Icon = I as typeof Building2;
          return (
            <div className="stat-card" key={i}>
              <div>
                <span>{String(t)}</span>
                <Icon size={20} />
              </div>
              <strong>{Number(n).toLocaleString("ar-SA")}</strong>
              <small>
                {i === 0 ? "ضمن المؤتمر المحدد" : "من سجلات الشركة"}
              </small>
            </div>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="panel progress-panel">
          <div className="section-head">
            <h2>تغطية المعارض</h2>
            <Badge>تحديث تلقائي</Badge>
          </div>
          <div className="progress-content">
            <div
              className="progress-ring"
              style={{
                background: `conic-gradient(var(--gold) ${ratio}%, var(--line) 0)`,
              }}
            >
              <div>
                <strong>{ratio}٪</strong>
                <span>نسبة الإنجاز</span>
              </div>
            </div>
            <div className="progress-legend">
              <p>
                <i className="gold" />
                تمت زيارتها <b>{completed}</b>
              </p>
              <p>
                <i />
                لم تتم زيارتها <b>{pending}</b>
              </p>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>{employee ? "أيام مشاركتك" : "تفاصيل المشاركة"}</h2>
            <CalendarDays size={20} />
          </div>
          {employee ? (
            myDates.length ? (
              <div className="day-pills">
                {myDates.map((a) => (
                  <span key={a.id}>{saDate(a.participation_date, true)}</span>
                ))}
              </div>
            ) : (
              <Empty
                title="لم تحدد أيام المشاركة"
                text="سيظهر توزيعك هنا بعد إضافته بواسطة المشرف."
              />
            )
          ) : (
            <div className="summary-list">
              <p>
                إجمالي أعضاء الفريق <b>{s.data.profiles.length}</b>
              </p>
              <p>
                الحسابات النشطة{" "}
                <b>{s.data.profiles.filter((p) => p.active).length}</b>
              </p>
              <p>
                الجهات ذات الأولوية المرتفعة{" "}
                <b>
                  {
                    new Set(
                      s.visits
                        .filter((v) => v.priority === "مرتفعة")
                        .map((v) => v.exhibition_id),
                    ).size
                  }
                </b>
              </p>
              <p>
                فرص تحتاج متابعة{" "}
                <b>
                  {
                    s.opportunities.filter(
                      (o) => !["مكتملة", "مغلقة"].includes(o.follow_up_status),
                    ).length
                  }
                </b>
              </p>
            </div>
          )}
        </section>
      </div>
      {!employee && (
        <div className="charts-grid">
          <BarChart
            title="الزيارات حسب اليوم"
            values={count(s.visits, (v) => dayKey(v.visited_at))}
          />
          <BarChart
            title="الزيارات حسب الموظف"
            values={count(s.visits, (v) => s.name(v.employee_id))}
          />
          <BarChart
            title="توزيع تقييمات الجهات"
            values={[1, 2, 3, 4, 5].map((n) => [
              `${n} نجوم`,
              s.visits.filter((v) => v.rating === n).length,
            ])}
          />
          <BarChart
            title="الفرص حسب الأولوية"
            values={["مرتفعة", "متوسطة", "منخفضة"].map((p) => [
              p,
              s.opportunities.filter((o) => o.importance === p).length,
            ])}
          />
        </div>
      )}
      <div className="section-head below">
        <h2>{employee ? "آخر زياراتك" : "أحدث الزيارات"}</h2>
        <Link className="text-button" to="/visits">
          عرض جميع الزيارات
          <ArrowUpLeft size={16} />
        </Link>
      </div>
      <VisitTable
        rows={(employee ? myVisits : s.visits)
          .slice()
          .sort((a, b) => Date.parse(b.visited_at) - Date.parse(a.visited_at))
          .slice(0, 8)}
      />
    </>
  );
}
function count(rows: Row[], fn: (r: Row) => string): [string, number][] {
  const result: Record<string, number> = {};
  rows.forEach((r) => {
    const key = fn(r);
    result[key] = (result[key] || 0) + 1;
  });
  return Object.entries(result);
}
function BarChart({
  title,
  values,
}: {
  title: string;
  values: [string, number][];
}) {
  const max = Math.max(1, ...values.map((v) => v[1]));
  return (
    <section className="panel chart">
      <h2>{title}</h2>
      {!values.length ? (
        <p className="muted">لا توجد زيارات مسجلة بعد.</p>
      ) : (
        values.map(([label, n]) => (
          <div className="bar-row" key={label}>
            <span>{label}</span>
            <div>
              <i style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <b>{n}</b>
          </div>
        ))
      )}
    </section>
  );
}
export function VisitTable({
  rows,
  filters,
}: {
  rows: Row[];
  filters?: React.ReactNode;
}) {
  const s = useConferenceData();
  return (
    <DataTable
      rows={rows.map((v) => ({
        ...v,
        exhibition:
          s.exhibitions.find((e) => e.id === v.exhibition_id)?.name || "",
        employee: s.name(v.employee_id),
      }))}
      searchKeys={["exhibition", "employee", "contact_name"]}
      filters={filters}
      columns={[
        {
          key: "exhibition",
          label: "المعرض / الجهة",
          render: (r) => (
            <Link className="table-link" to={"/visit/" + r.id}>
              {r.exhibition}
            </Link>
          ),
        },
        { key: "employee", label: "الموظف" },
        {
          key: "visited_at",
          label: "تاريخ الزيارة",
          render: (r) => saDate(r.visited_at),
        },
        {
          key: "rating",
          label: "التقييم",
          render: (r) => (
            <span className="rating">
              {"★".repeat(r.rating)}
              {"☆".repeat(5 - r.rating)}
            </span>
          ),
        },
        {
          key: "priority",
          label: "أولوية المتابعة",
          render: (r) => <Badge>{r.priority}</Badge>,
        },
        {
          key: "id",
          label: "التفاصيل",
          render: (r) => (
            <Link className="text-button" to={"/visit/" + r.id}>
              عرض
              <ArrowUpLeft size={15} />
            </Link>
          ),
        },
      ]}
    />
  );
}
export function Exhibitions() {
  const s = useConferenceData(),
    navigate = useNavigate(),
    [status, setStatus] = useState(""),
    [employee, setEmployee] = useState(""),
    [day, setDay] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [reset, setReset] = useState<Row | null>(null),
    [reason, setReason] = useState(""),
    [additional, setAdditional] = useState(false);
  if (!s.conference) return <NeedConference />;
  const staff = s.profile?.role !== "employee";
  const rows = s.exhibitions
    .map((e) => {
      const visit = s.visits
        .filter((v) => v.exhibition_id === e.id)
        .sort((a, b) => Date.parse(b.visited_at) - Date.parse(a.visited_at))[0];
      return {
        ...e,
        status: exhibitionStatus(e, s.visits, s.data.visit_reservations),
        qr: s.data.exhibition_qr_codes
          .filter((q) => q.exhibition_id === e.id)
          .map((q) => q.content)
          .join("، "),
        employee: visit ? s.name(visit.employee_id) : "—",
        employee_id: visit?.employee_id,
        visited_at: visit?.visited_at,
      };
    })
    .filter(
      (e) =>
        (!status || e.status === status) &&
        (!employee || e.employee_id === employee) &&
        (!day || (e.visited_at && dayKey(e.visited_at) === day)),
    );
  return (
    <>
      <Heading
        title="المعارض المشاركة"
        description="رؤية مشتركة لحالة كل معرض، دون تكرار الزيارات."
      >
        <Link className="button primary" to="/scan">
          <Plus size={18} />
          إضافة معرض أو مسح رمز
        </Link>
      </Heading>
      <DataTable
        rows={rows}
        searchKeys={["name", "organization", "qr"]}
        filters={
          <>
            <select
              aria-label="تصفية الحالة"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">جميع الحالات</option>
              {["لم تتم الزيارة", "تمت الزيارة"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="تصفية الموظف"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
            >
              <option value="">جميع الموظفين</option>
              {s.data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <input
              aria-label="تاريخ الزيارة"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </>
        }
        columns={[
          {
            key: "name",
            label: "المعرض",
            render: (r) => (
              <div>
                <strong>{r.name}</strong>
                <small className="cell-sub">{r.organization}</small>
              </div>
            ),
          },
          {
            key: "qr",
            label: "محتوى الرمز",
            render: (r) => (
              <span className="truncate" dir="auto" title={r.qr}>
                {r.qr}
              </span>
            ),
          },
          {
            key: "status",
            label: "الحالة",
            render: (r) => <Badge>{r.status}</Badge>,
          },
          { key: "employee", label: "آخر زيارة بواسطة" },
          {
            key: "visited_at",
            label: "تاريخ آخر زيارة",
            render: (r) => (r.visited_at ? saDate(r.visited_at) : "—"),
          },
          {
            key: "actions",
            label: "الإجراءات",
            render: (r) => (
              <div className="actions">
                <button
                  className="text-button"
                  onClick={() => navigate("/record/" + r.id)}
                >
                  فتح
                </button>
                {staff && (
                  <button
                    className="icon-button"
                    title="تعديل المعرض"
                    aria-label="تعديل المعرض"
                    onClick={() => setEdit({ ...r })}
                  >
                    <Pencil size={16} />
                  </button>
                )}
                {s.profile?.role === "admin" && (
                  <button
                    className="icon-button"
                    title="إعادة التعيين"
                    aria-label="إعادة التعيين"
                    onClick={() => {
                      setReset(r);
                      setReason("");
                      setAdditional(false);
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      {edit && (
        <Modal title="تعديل بيانات المعرض" onClose={() => setEdit(null)}>
          <Form
            onSave={async () => {
              if (
                await s.run(() =>
                  rpc("edit_exhibition", {
                    p_id: edit.id,
                    p_name: edit.name,
                    p_organization: edit.organization,
                    p_reviewed: true,
                  }),
                )
              )
                setEdit(null);
            }}
          >
            {(busy) => (
              <>
                <Field label="اسم المعرض" required>
                  <input
                    required
                    minLength={2}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </Field>
                <Field label="اسم الجهة" required>
                  <input
                    required
                    minLength={2}
                    value={edit.organization}
                    onChange={(e) =>
                      setEdit({ ...edit, organization: e.target.value })
                    }
                  />
                </Field>

                <Submit busy={busy} />
              </>
            )}
          </Form>
        </Modal>
      )}
      {reset && (
        <Modal title="السماح بزيارة إضافية" onClose={() => setReset(null)}>
          <p>تبقى جميع الزيارات السابقة محفوظة عند السماح بزيارة إضافية.</p>
          <Form
            onSave={async () => {
              if (
                await s.run(() =>
                  rpc("reset_exhibition", {
                    p_exhibition: reset.id,
                    p_additional: additional,
                    p_reason: reason,
                  }),
                )
              )
                setReset(null);
            }}
          >
            {(busy) => (
              <>
                <Field label="سبب الإجراء" required>
                  <textarea
                    required
                    minLength={5}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={additional}
                    onChange={(e) => setAdditional(e.target.checked)}
                  />
                  السماح صراحةً بزيارة إضافية إذا سبق إكمال الزيارة
                </label>
                <Submit busy={busy}>تأكيد إعادة التعيين</Submit>
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}

export function Team() {
  const [importOpen, setImportOpen] = useState(false);
  const s = useConferenceData(),
    [edit, setEdit] = useState<Row | null>(null),
    [action, setAction] = useState<{ person: Row; type: string } | null>(null);
  const manage = s.profile?.role === "admin" || s.profile?.manage_employees,
    admin = s.profile?.role === "admin";
  const blank = {
    id: "",
    full_name: "",
    email: "",
    role: "employee",
    active: true,
    manage_employees: false,
    job_title: "",
  };
  return (
    <>
      <Heading
        title="فريق العمل"
        description="حسابات واضحة الصلاحيات، ومشاركة ميدانية منظّمة."
      >
        {manage && (
          <button className="button" onClick={() => setImportOpen(true)}>
            استيراد Excel
          </button>
        )}
        {manage && (
          <button
            className="button primary"
            onClick={() => setEdit({ ...blank })}
          >
            <Plus size={18} />
            إضافة حساب
          </button>
        )}
      </Heading>
      {manage && importOpen && (
        <EmployeeImport onClose={() => setImportOpen(false)} />
      )}
      <DataTable
        rows={s.data.profiles.map((p) => ({
          ...p,
          job_title:
            s.data.employees.find((e) => e.id === p.id)?.job_title || "",
          visit_count: s.visits.filter((v) => v.employee_id === p.id).length,
        }))}
        searchKeys={["full_name", "email", "job_title"]}
        columns={[
          {
            key: "full_name",
            label: "الموظف",
            render: (r) => (
              <div>
                <strong>{r.full_name}</strong>
                <small className="cell-sub">{r.email}</small>
              </div>
            ),
          },
          {
            key: "role",
            label: "الصلاحية",
            render: (r) => roleNames[r.role as Role],
          },
          { key: "job_title", label: "المسمى الوظيفي" },
          {
            key: "active",
            label: "الحساب",
            render: (r) => <Badge>{r.active ? "نشط" : "معطل"}</Badge>,
          },
          {
            key: "dates",
            label: "أيام المشاركة",
            render: (r) =>
              s.assignments
                .filter((a) => a.employee_id === r.id)
                .map((a) => saDate(a.participation_date, true))
                .join("، ") || "لم يوزع",
          },
          { key: "visit_count", label: "الزيارات" },
          {
            key: "created_at",
            label: "تاريخ الإنشاء",
            render: (r) => saDate(r.created_at, true),
          },
          {
            key: "actions",
            label: "الإجراءات",
            render: (r) =>
              manage && (admin || r.role === "employee") ? (
                <div className="actions">
                  <button
                    className="text-button"
                    onClick={() => setEdit({ ...r })}
                  >
                    تعديل
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setAction({ person: r, type: "reset" })}
                  >
                    استعادة
                  </button>
                  {r.id !== s.profile?.id && (
                    <button
                      className="text-button"
                      onClick={() => setAction({ person: r, type: "delete" })}
                    >
                      حذف
                    </button>
                  )}
                </div>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {edit && (
        <Modal
          title={edit.id ? "تعديل الحساب" : "إنشاء حساب موظف"}
          onClose={() => setEdit(null)}
        >
          <Form
            onSave={async () => {
              const payload = {
                ...edit,
                action: edit.id ? "update" : "create",
              };
              if (
                await s.run(
                  () => accountAction(payload),
                  edit.id
                    ? "تم تحديث الحساب"
                    : "تم إنشاء الحساب وإرسال دعوة لتعيين كلمة المرور",
                )
              )
                setEdit(null);
            }}
          >
            {(busy) => (
              <>
                <div className="form-grid">
                  <Field label="الاسم الكامل" required>
                    <input
                      required
                      minLength={2}
                      maxLength={150}
                      value={edit.full_name}
                      onChange={(e) =>
                        setEdit({ ...edit, full_name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="البريد الإلكتروني" required>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={edit.email}
                      disabled={Boolean(edit.id)}
                      onChange={(e) =>
                        setEdit({ ...edit, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="المسمى الوظيفي">
                    <input
                      value={edit.job_title}
                      onChange={(e) =>
                        setEdit({ ...edit, job_title: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="الصلاحية">
                    <select
                      value={edit.role}
                      onChange={(e) =>
                        setEdit({ ...edit, role: e.target.value })
                      }
                    >
                      {(admin
                        ? ["employee", "supervisor", "admin"]
                        : ["employee"]
                      ).map((r) => (
                        <option key={r} value={r}>
                          {roleNames[r as Role]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={edit.active}
                    onChange={(e) =>
                      setEdit({ ...edit, active: e.target.checked })
                    }
                  />
                  الحساب نشط
                </label>
                {admin && edit.role === "supervisor" && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={edit.manage_employees}
                      onChange={(e) =>
                        setEdit({ ...edit, manage_employees: e.target.checked })
                      }
                    />
                    السماح بإدارة حسابات الموظفين
                  </label>
                )}
                <p className="muted">
                  توزيع أيام المشاركة متاح من صفحة جدول المشاركة.
                </p>
                <Submit busy={busy} />
              </>
            )}
          </Form>
        </Modal>
      )}
      {action && (
        <Modal
          title={
            action.type === "reset" ? "إعادة تعيين كلمة المرور" : "حذف الحساب"
          }
          onClose={() => setAction(null)}
        >
          <p>
            {action.type === "reset"
              ? `سيُرسل رابط آمن إلى ${action.person.email}.`
              : "يمكن حذف الحساب الذي لا يملك سجلات مرتبطة فقط. للحفاظ على التاريخ، عطّل الحساب الذي سبق استخدامه."}
          </p>
          <Form
            onSave={async () => {
              if (
                await s.run(
                  () =>
                    accountAction({
                      action: action.type,
                      id: action.person.id,
                    }),
                  "تم تنفيذ العملية",
                )
              )
                setAction(null);
            }}
          >
            {(busy) => <Submit busy={busy}>تأكيد</Submit>}
          </Form>
        </Modal>
      )}
    </>
  );
}

export function Schedule() {
  const s = useConferenceData(),
    [person, setPerson] = useState<Row | null>(null),
    [dates, setDates] = useState<string[]>([]);
  if (!s.conference) return <NeedConference />;
  const days = conferenceDays(s.conference.starts_on, s.conference.ends_on),
    staff = s.profile?.role !== "employee";
  return (
    <>
      <Heading
        title="جدول المشاركة"
        description="توزيع الفريق على أيام المؤتمر من الأحد إلى الأربعاء."
      />
      <div className="schedule-grid">
        {days.map((day) => {
          const assigned = s.assignments.filter(
            (a) => a.participation_date === day,
          );
          return (
            <section key={day} className="panel day-card">
              <span className="eyebrow">
                {new Intl.DateTimeFormat("ar-SA", {
                  weekday: "long",
                  timeZone: "Asia/Riyadh",
                }).format(new Date(day + "T12:00:00Z"))}
              </span>
              <h2>{saDate(day, true)}</h2>
              <span className="muted">{assigned.length} مشارك</span>
              <div className="participants">
                {assigned.length ? (
                  assigned.map((a) => (
                    <div key={a.id}>
                      <span className="avatar">
                        {s.name(a.employee_id).slice(0, 1)}
                      </span>
                      {s.name(a.employee_id)}
                      {a.employee_id === s.profile?.id && <Badge>أنت</Badge>}
                    </div>
                  ))
                ) : (
                  <p className="muted">لم يتم توزيع موظفين لهذا اليوم.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!days.length && (
        <Empty
          title="لا توجد أيام مشاركة متاحة"
          text="حدد فترة مؤتمر تتضمن أيامًا من الأحد إلى الأربعاء."
        />
      )}
      {staff && (
        <>
          <div className="section-head below">
            <h2>تعديل توزيع الموظفين</h2>
          </div>
          <DataTable
            rows={s.data.profiles.filter((p) => p.active)}
            searchKeys={["full_name", "email"]}
            columns={[
              { key: "full_name", label: "الموظف" },
              {
                key: "days",
                label: "الأيام المحددة",
                render: (r) =>
                  s.assignments
                    .filter((a) => a.employee_id === r.id)
                    .map((a) => saDate(a.participation_date, true))
                    .join("، ") || "لم يوزع",
              },
              {
                key: "actions",
                label: "الإجراء",
                render: (r) => (
                  <button
                    className="text-button"
                    onClick={() => {
                      setPerson(r);
                      setDates(
                        s.assignments
                          .filter((a) => a.employee_id === r.id)
                          .map((a) => a.participation_date),
                      );
                    }}
                  >
                    تعديل الأيام
                    <Pencil size={15} />
                  </button>
                ),
              },
            ]}
          />
        </>
      )}
      {person && (
        <Modal
          title={"أيام مشاركة " + person.full_name}
          onClose={() => setPerson(null)}
        >
          <Form
            onSave={async () => {
              if (
                await s.run(() =>
                  rpc("assign_employee", {
                    p_conference: s.conferenceId,
                    p_employee: person.id,
                    p_dates: dates,
                  }),
                )
              )
                setPerson(null);
            }}
          >
            {(busy) => (
              <>
                <div className="day-options">
                  {days.map((day) => (
                    <label className="check" key={day}>
                      <input
                        type="checkbox"
                        checked={dates.includes(day)}
                        onChange={(e) =>
                          setDates(
                            e.target.checked
                              ? [...dates, day]
                              : dates.filter((d) => d !== day),
                          )
                        }
                      />
                      {saDate(day, true)}
                    </label>
                  ))}
                </div>
                <Submit busy={busy} />
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const s = useStore(),
    [edit, setEdit] = useState<Row | null>(null);
  return (
    <>
      <Heading
        title="إعدادات المؤتمر"
        description="بيانات المؤتمر وفترة المشاركة وسجل الإجراءات الإدارية."
      >
        <button
          className="button primary"
          onClick={() =>
            setEdit({
              id: "",
              name: "",
              location: "",
              starts_on: "",
              ends_on: "",
            })
          }
        >
          <Plus size={18} />
          مؤتمر جديد
        </button>
      </Heading>
      <DataTable
        rows={s.data.conferences}
        searchKeys={["name", "location"]}
        columns={[
          { key: "name", label: "المؤتمر" },
          { key: "location", label: "الموقع" },
          {
            key: "starts_on",
            label: "البداية",
            render: (r) => saDate(r.starts_on, true),
          },
          {
            key: "ends_on",
            label: "النهاية",
            render: (r) => saDate(r.ends_on, true),
          },
          {
            key: "actions",
            label: "الإجراء",
            render: (r) => (
              <button className="text-button" onClick={() => setEdit({ ...r })}>
                تعديل
                <Pencil size={16} />
              </button>
            ),
          },
        ]}
      />
      <div className="section-head below">
        <h2>سجل العمليات الإدارية</h2>
      </div>
      <DataTable
        rows={s.data.activity_logs
          .slice()
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .map((l) => ({
            ...l,
            actor:
              s.data.profiles.find((p) => p.id === l.actor_id)?.full_name ||
              "النظام",
          }))}
        searchKeys={["action", "actor"]}
        columns={[
          { key: "action", label: "العملية" },
          { key: "actor", label: "بواسطة" },
          {
            key: "created_at",
            label: "التوقيت",
            render: (r) => saDate(r.created_at),
          },
          {
            key: "details",
            label: "السبب",
            render: (r) => r.details?.reason || "—",
          },
        ]}
      />
      {edit && (
        <Modal
          title={edit.id ? "تعديل المؤتمر" : "إضافة مؤتمر"}
          onClose={() => setEdit(null)}
        >
          <Form
            onSave={async () => {
              if (
                await s.run(async () => {
                  const id = await rpc("save_conference", {
                    p_id: edit.id || null,
                    p_name: edit.name,
                    p_location: edit.location,
                    p_start: edit.starts_on,
                    p_end: edit.ends_on,
                  });
                  s.setConferenceId(id);
                })
              )
                setEdit(null);
            }}
          >
            {(busy) => (
              <>
                <Field label="اسم المؤتمر" required>
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </Field>
                <Field label="موقع المؤتمر">
                  <input
                    maxLength={300}
                    value={edit.location}
                    onChange={(e) =>
                      setEdit({ ...edit, location: e.target.value })
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label="تاريخ البداية" required>
                    <input
                      type="date"
                      required
                      value={edit.starts_on}
                      onChange={(e) =>
                        setEdit({ ...edit, starts_on: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="تاريخ النهاية" required>
                    <input
                      type="date"
                      min={edit.starts_on}
                      required
                      value={edit.ends_on}
                      onChange={(e) =>
                        setEdit({ ...edit, ends_on: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Submit busy={busy} />
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Opportunities() {
  const s = useConferenceData(),
    [priority, setPriority] = useState(""),
    [status, setStatus] = useState("");
  if (!s.conference) return <NeedConference />;
  return (
    <>
      <Heading
        title="الفرص التجارية"
        description="حوّل الزيارات الميدانية إلى علاقات وفرص قابلة للمتابعة."
      />
      <DataTable
        rows={s.opportunities
          .map((o) => {
            const v = s.visits.find((v) => v.id === o.visit_id);
            return {
              ...o,
              exhibition: s.exhibitions.find((e) => e.id === v?.exhibition_id)
                ?.name,
              employee: v ? s.name(v.employee_id) : "",
            } as Row;
          })
          .filter(
            (o) =>
              (!priority || o.importance === priority) &&
              (!status || o.follow_up_status === status),
          )}
        searchKeys={["description", "exhibition", "employee"]}
        filters={
          <>
            <select
              aria-label="أهمية الفرصة"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">كل الأولويات</option>
              {["مرتفعة", "متوسطة", "منخفضة"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select
              aria-label="حالة المتابعة"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">كل الحالات</option>
              {["جديدة", "قيد المتابعة", "مكتملة", "مغلقة"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </>
        }
        columns={[
          {
            key: "exhibition",
            label: "الجهة",
            render: (r) => (
              <Link className="table-link" to={"/visit/" + r.visit_id}>
                {r.exhibition}
              </Link>
            ),
          },
          { key: "description", label: "وصف الفرصة" },
          {
            key: "importance",
            label: "الأهمية",
            render: (r) => <Badge>{r.importance}</Badge>,
          },
          { key: "employee", label: "الموظف" },
          {
            key: "follow_up_status",
            label: "المتابعة",
            render: (r) => (
              <select
                aria-label="تحديث حالة الفرصة"
                value={r.follow_up_status}
                onChange={(e) =>
                  void s.run(() =>
                    rpc("follow_up", { p_id: r.id, p_status: e.target.value }),
                  )
                }
              >
                {["جديدة", "قيد المتابعة", "مكتملة", "مغلقة"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            ),
          },
        ]}
      />
    </>
  );
}
