import { useEffect, useRef, useState } from "react";
import { Modal } from "./components";
import { accountAction, errorText } from "./api";
import { useStore } from "./store";
import { readEmployees, type EmployeeImportRow } from "./employee-import";

export function EmployeeImport({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [rows, setRows] = useState<EmployeeImportRow[]>([]);
  const [sheet, setSheet] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState<Record<number, string>>({});
  const stop = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (busy.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      stop.current = true;
      window.removeEventListener("beforeunload", guard);
    };
  }, []);
  const valid = rows.filter((row) => !row.error && !row.existing);
  async function select(file?: File) {
    if (!file || busy.current) return;
    setError("");
    setReading(true);
    setRows([]);
    setResults({});
    setStarted(false);
    setConfirmed(false);
    try {
      const parsed = await readEmployees(
        file,
        s.data.profiles.map((p) => p.email),
      );
      setRows(parsed.rows);
      setSheet(parsed.sheet);
    } catch (e) {
      setError(
        e instanceof Error && /[\u0600-\u06ff]/.test(e.message)
          ? e.message
          : "تعذر قراءة ملف Excel. تحقق من سلامة الملف وصيغته.",
      );
    } finally {
      setReading(false);
    }
  }
  async function start() {
    if (busy.current || !confirmed || !valid.length || started) return;
    busy.current = true;
    stop.current = false;
    setRunning(true);
    setStarted(true);
    setError("");
    let count = 0;
    try {
      for (const row of valid) {
        if (stop.current) break;
        setResults((prev) => ({ ...prev, [row.row]: "جارٍ إنشاء الحساب…" }));
        try {
          await accountAction({
            action: "create",
            full_name: row.full_name,
            email: row.email,
            job_title: row.job_title,
            role: "employee",
            active: true,
            manage_employees: false,
          });
          count++;
          setResults((prev) => ({
            ...prev,
            [row.row]: "تم إنشاء الحساب وطلب إرسال الدعوة",
          }));
        } catch (e) {
          setResults((prev) => ({ ...prev, [row.row]: errorText(e) }));
          setError(
            "توقف الاستيراد عند أول خطأ. الحسابات الناجحة باقية. حدّث الفريق وتحقق من الحساب المتعثر قبل إعادة اختيار الملف، خصوصًا عند انقطاع الاتصال. قد تتطلب الدعوات ضبط SMTP وحدود الإرسال.",
          );
          break;
        }
      }
    } finally {
      busy.current = false;
      setRunning(false);
      await s.refresh();
      if (count) s.setNotice(`تم إنشاء ${count} حساب ضمن هذه الدفعة`);
    }
  }
  return (
    <Modal
      title="استيراد الموظفين من Excel"
      onClose={() => {
        if (!busy.current && !reading) onClose();
      }}
    >
      <p className="help">
        اختر ملف XLSX. تُقرأ ورقة «بيانات الموظفين» إن وجدت، وإلا الورقة الأولى.
        تُرسل الأسماء والبريد والمسمى الوظيفي فقط، ويكون دور جميع الحسابات
        «موظف».
      </p>
      <label className="field">
        <span>ملف الموظفين</span>
        <input
          type="file"
          accept=".xlsx"
          disabled={running || reading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void select(file);
          }}
        />
      </label>
      {reading && <p role="status">جارٍ قراءة الملف وفحص البيانات…</p>}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <p className="help">
            الورقة: {sheet} · صالح للإضافة: {valid.length} · موجود مسبقًا:{" "}
            {rows.filter((r) => r.existing).length} · يحتاج تصحيحًا:{" "}
            {rows.filter((r) => r.error).length}
          </p>
          <div className="table-scroll" style={{ maxHeight: 360 }}>
            <table>
              <thead>
                <tr>
                  <th>الصف</th>
                  <th>الاسم</th>
                  <th>البريد</th>
                  <th>المسمى</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.full_name}</td>
                    <td dir="ltr">{row.email}</td>
                    <td>{row.job_title || "غير مذكور"}</td>
                    <td>
                      {results[row.row] ||
                        row.error ||
                        (row.existing ? "موجود — سيُتخطى" : "جاهز للإضافة")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={running || started}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            راجعت القائمة وأوافق على إنشاء الحسابات الصالحة وإرسال دعوات إلى
            بريدها.
          </label>
          <div className="actions">
            <button
              className="button primary"
              disabled={!confirmed || !valid.length || running || started}
              onClick={() => void start()}
            >
              {running
                ? "جارٍ الاستيراد…"
                : `إنشاء ${valid.length} حساب وإرسال الدعوات`}
            </button>
            {running && (
              <button
                className="button"
                onClick={() => {
                  stop.current = true;
                }}
              >
                إيقاف بعد الحساب الحالي
              </button>
            )}
          </div>
          <p className="help">
            تُتخطى الحسابات الموجودة ولا تتغير صلاحياتها. لا تعِد المحاولة أثناء
            تشغيل دفعة أخرى. بعد التوقف، راجع النتائج ثم أعد اختيار الملف لتحديث
            فحص التكرار.
          </p>
        </>
      )}
    </Modal>
  );
}
