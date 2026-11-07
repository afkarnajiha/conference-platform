import { useState } from "react";
import { createWorkbook } from "./export-workbook";
import { Download, Printer, FileSpreadsheet } from "lucide-react";
import { Heading, Field, DataTable } from "./components";
import { NeedConference, useConferenceData } from "./pages";
import { csvText, dayKey, exhibitionStatus, safeCell, saDate } from "./domain";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function Reports() {
  const s = useConferenceData(),
    [type, setType] = useState("visits"),
    [employee, setEmployee] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [priority, setPriority] = useState(""),
    [busy, setBusy] = useState(false);
  if (!s.conference) return <NeedConference />;
  const visits = s.visits.filter(
    (v) =>
      (!employee || v.employee_id === employee) &&
      (!from || dayKey(v.visited_at) >= from) &&
      (!to || dayKey(v.visited_at) <= to) &&
      (!priority || v.priority === priority),
  );
  const ids = new Set(visits.map((v) => v.id));
  const opportunities = s.opportunities.filter((o) => ids.has(o.visit_id));
  const exhibitions = s.exhibitions.filter(
    (e) =>
      (!employee && !from && !to && !priority) ||
      visits.some((v) => v.exhibition_id === e.id),
  );
  const high = visits.filter((v) => v.priority === "مرتفعة");
  const completed = new Set(visits.map((v) => v.exhibition_id)).size,
    ratio = s.exhibitions.length
      ? Math.round((completed / s.exhibitions.length) * 100)
      : 0;
  const visitRows = (type === "high" ? high : visits).map((v) => ({
    المعرض: s.exhibitions.find((e) => e.id === v.exhibition_id)?.name || "",
    الجهة:
      s.exhibitions.find((e) => e.id === v.exhibition_id)?.organization || "",
    الموظف: s.name(v.employee_id),
    "تاريخ الزيارة": saDate(v.visited_at),
    المسؤول: v.contact_name,
    "المسمى الوظيفي": v.job_title,
    "رقم التواصل": v.phone,
    "البريد الإلكتروني": v.email,
    النشاط: v.business_activity,
    الخدمات: v.services,
    المنتجات: v.products,
    التعاون: v.collaboration,
    التقييم: v.rating,
    الاهتمام: v.interest,
    "أولوية المتابعة": v.priority,
    الفرصة: s.opportunities.find((o) => o.visit_id === v.id)?.description || "",
    الملاحظات: v.notes,
  }));
  const exhibitionRows = exhibitions.map((e) => ({
    "اسم المعرض": e.name,
    الجهة: e.organization,
    "رمز QR الأصلي": s.data.exhibition_qr_codes
      .filter((q) => q.exhibition_id === e.id)
      .map((q) => q.content)
      .join(" | "),
    الحالة: exhibitionStatus(e, s.visits, s.data.visit_reservations),
    "عدد الزيارات": s.visits.filter((v) => v.exhibition_id === e.id).length,
  }));
  const opportunityRows = opportunities.map((o) => {
    const v = s.visits.find((v) => v.id === o.visit_id)!;
    return {
      الجهة:
        s.exhibitions.find((e) => e.id === v.exhibition_id)?.organization || "",
      الموظف: s.name(v.employee_id),
      الفرصة: o.description,
      الأهمية: o.importance,
      المتابعة: o.follow_up_status,
      "اسم المسؤول": v.contact_name,
      "رقم التواصل": v.phone,
      "البريد الإلكتروني": v.email,
    };
  });
  const summaryRows = [
    { المؤشر: "المؤتمر", القيمة: s.conference.name },
    {
      المؤشر: "فترة المؤتمر",
      القيمة: `${s.conference.starts_on} — ${s.conference.ends_on}`,
    },
    {
      المؤشر: "عدد الموظفين المشاركين",
      القيمة: new Set(s.assignments.map((a) => a.employee_id)).size,
    },
    { المؤشر: "إجمالي المعارض", القيمة: s.exhibitions.length },
    { المؤشر: "إجمالي الزيارات ضمن التصفية", القيمة: visits.length },
    { المؤشر: "نسبة المعارض التي لها زيارة ضمن التصفية", القيمة: ratio + "٪" },
    {
      المؤشر: "الفرص ذات الأهمية المرتفعة",
      القيمة:
        opportunities
          .filter((o) => o.importance === "مرتفعة")
          .map((o) => o.description)
          .join("؛ ") || "لا توجد",
    },
    {
      المؤشر: "جهات تحتاج متابعة مرتفعة",
      القيمة:
        [
          ...new Set(
            high.map(
              (v) =>
                s.exhibitions.find((e) => e.id === v.exhibition_id)
                  ?.organization,
            ),
          ),
        ].join("، ") || "لا توجد",
    },
  ];
  const rows: Record<string, unknown>[] =
    type === "exhibitions"
      ? exhibitionRows
      : type === "opportunities"
        ? opportunityRows
        : type === "summary"
          ? summaryRows
          : visitRows;
  const title = (
    {
      visits: "تقرير الزيارات",
      high: "الجهات ذات الأولوية المرتفعة",
      exhibitions: "بيانات المعارض",
      opportunities: "الفرص التجارية",
      summary: "التقرير النهائي للمؤتمر",
    } as Record<string, string>
  )[type];
  const exportFile = async (format: "csv" | "xlsx") => {
    setBusy(true);
    await s.run(async () => {
      if (format === "csv")
        download(
          new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
          title + ".csv",
        );
      else {
        const bytes = await createWorkbook(title, rows);
        download(
          new Blob([bytes as BlobPart], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          title + ".xlsx",
        );
      }
    }, "تم إنشاء ملف التقرير");
    setBusy(false);
  };
  return (
    <>
      <div className="no-print">
        <Heading
          title="التقارير والتصدير"
          description="تقارير عربية من بيانات الشركة، مع تصفية قبل التصدير."
        />
        <section className="panel report-filters">
          <div className="form-grid">
            <Field label="نوع التقرير">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="visits">جميع الزيارات</option>
                <option value="exhibitions">بيانات المعارض</option>
                <option value="opportunities">الفرص التجارية</option>
                <option value="high">الجهات ذات الأولوية المرتفعة</option>
                <option value="summary">التقرير النهائي للمؤتمر</option>
              </select>
            </Field>
            <Field label="الموظف">
              <select
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
            </Field>
            <Field label="من تاريخ">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="إلى تاريخ">
              <input
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="أولوية المتابعة">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="">جميع الأولويات</option>
                {["مرتفعة", "متوسطة", "منخفضة"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="actions">
            <button
              className="button primary"
              disabled={busy || !rows.length}
              onClick={() => void exportFile("xlsx")}
            >
              <FileSpreadsheet size={18} />
              تصدير Excel
            </button>
            <button
              className="button"
              disabled={busy || !rows.length}
              onClick={() => void exportFile("csv")}
            >
              <Download size={18} />
              تصدير CSV
            </button>
            <button
              className="button"
              disabled={!rows.length}
              onClick={() => window.print()}
            >
              <Printer size={18} />
              طباعة / حفظ PDF
            </button>
            <button
              className="button ghost"
              onClick={() => {
                setEmployee("");
                setFrom("");
                setTo("");
                setPriority("");
              }}
            >
              مسح التصفية
            </button>
          </div>
          <p className="help">
            لحفظ PDF، اختر «حفظ بتنسيق PDF» في نافذة الطباعة. يُطبع التقرير
            كاملًا بالعربية، وليس صفحة الجدول الحالية فقط.
          </p>
        </section>
        <div className="section-head below">
          <h2>معاينة التقرير</h2>
          <span className="muted">{rows.length} سجل مطابق</span>
        </div>
        <DataTable
          rows={rows.map((r, i) => ({ ...r, id: String(i) }))}
          searchKeys={rows.length ? Object.keys(rows[0]) : []}
          columns={
            rows.length
              ? Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
              : []
          }
        />
      </div>
      <section className="print-report">
        <header>
          <h1>الأفكار الناجحة التجارية</h1>
          <h2>{title}</h2>
          <p>
            {s.conference.name} · {saDate(new Date().toISOString())}
          </p>
          <p>
            الموظف: {employee ? s.name(employee) : "الجميع"} · الفترة:{" "}
            {from || "البداية"} — {to || "النهاية"} · الأولوية:{" "}
            {priority || "الكل"}
          </p>
        </header>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                {Object.keys(rows[0]).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {Object.values(r).map((v, j) => (
                    <td key={j}>{String(v ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>لا توجد بيانات مطابقة.</p>
        )}
      </section>
    </>
  );
}
