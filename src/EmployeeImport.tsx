import { useEffect, useRef, useState } from "react";
import { Modal } from "./components";
import { accountAction, errorText } from "./api";
import { useStore } from "./store";
import { readEmployees, type EmployeeImportRow } from "./employee-import";

import { createWorkbook } from "./export-workbook";

function newPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return "Aa7!" + Array.from(bytes, b => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[b % 55]).join("");
}
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
  const [mode, setMode] = useState("invite");
  const [credentials, setCredentials] = useState<Record<string, string>[]>([]);
  const [downloaded, setDownloaded] = useState(true);
  const [exporting, setExporting] = useState(false);
  const unsaved = useRef(false);
  async function download() {
    setExporting(true);
    try {
      const buffer = await createWorkbook("بيانات الدخول", credentials);
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a = document.createElement("a"); a.href=url; a.download="بيانات-دخول-الموظفين.xlsx";
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      unsaved.current=false; setDownloaded(true);
    } catch { setError("تعذر تنزيل الملف. أبقِ هذه النافذة مفتوحة وأعد التنزيل."); }
    finally { setExporting(false); }
  }
  const stop = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (busy.current || unsaved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      stop.current = true;
      window.removeEventListener("beforeunload", guard);
    };
  }, []);
  const valid = rows.filter((row) => !row.error && !row.existing);
  async function select(file?: File) {
    if (!file || busy.current || unsaved.current) return;
    setError("");
    setReading(true);
    setRows([]);
    setResults({});
    setCredentials([]);
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
          const password = mode === "password" ? newPassword() : "";
          await accountAction({
            action: "create",
            ...(mode === "password" ? {creation_mode:"password", password} : {}),
            full_name: row.full_name,
            email: row.email,
            job_title: row.job_title,
            role: "employee",
            active: true,
            manage_employees: false,
          });
          count++;
          if (password) {
            setCredentials(prev => [...prev, {"الاسم":row.full_name,"البريد الإلكتروني":row.email,"كلمة المرور":password}]);
            unsaved.current=true; setDownloaded(false);
          }
          setResults((prev) => ({
            ...prev,
            [row.row]: mode === "password" ? "تم إنشاء الحساب بكلمة مرور دون بريد" : "تم إنشاء الحساب وطلب إرسال الدعوة",
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
        if (!busy.current && !reading && !unsaved.current) onClose();
        else if (unsaved.current) setError("نزّل بيانات الدخول قبل إغلاق النافذة.");
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
          disabled={running || reading || !downloaded}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void select(file);
          }}
        />
      </label>
      <label className="field"><span>طريقة إنشاء الحسابات</span>
        <select value={mode} disabled={running || started} onChange={e => {setMode(e.target.value); setConfirmed(false);}}>
          <option value="invite">إرسال دعوات بريدية</option>
          <option value="password">كلمات مرور فريدة دون إرسال بريد</option>
        </select>
      </label>
      {mode === "password" && <p className="help">تُنشأ كلمة مرور عشوائية مستقلة لكل موظف ويُفعّل بريده إداريًا. نزّل ملف الدخول قبل الإغلاق، وشارك كل موظف بياناته فقط. الحسابات الموجودة لا تتغير.</p>}
      {credentials.length > 0 && <button className="button primary" disabled={running || exporting} onClick={() => void download()}>تنزيل Excel لبيانات دخول {credentials.length} موظف</button>}
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
            {mode === "password" ? "راجعت القائمة وأوافق على إنشاء الحسابات وتفعيل البريد بكلمات مرور دون دعوات." : "راجعت القائمة وأوافق على إنشاء الحسابات الصالحة وإرسال دعوات إلى بريدها."}
          </label>
          <div className="actions">
            <button
              className="button primary"
              disabled={!confirmed || !valid.length || running || started}
              onClick={() => void start()}
            >
              {running
                ? "جارٍ الاستيراد…"
                : mode === "password" ? `إنشاء ${valid.length} حساب بكلمات مرور` : `إنشاء ${valid.length} حساب وإرسال الدعوات`}
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
