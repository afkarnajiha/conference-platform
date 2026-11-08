import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Camera,
  ScanLine,
  Upload,
  Trash2,
  FileText,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { client, errorText, rpc } from "./api";
import { captureAttachments } from "./attachment-selection";
import { useStore } from "./store";
import { NeedConference, useConferenceData, VisitTable } from "./pages";
import {
  Heading,
  Field,
  Form,
  Submit,
  Empty,
  Loading,
  Badge,
} from "./components";
import {
  dayKey,
  emptyVisit,
  mimeExtensions,
  normalizeQr,
  saDate,
  validateFile,
  visitSchema,
  type VisitInput,
  type Row,
} from "./domain";
export function ScanPage() {
  const s = useConferenceData(),
    navigate = useNavigate(),
    [raw, setRaw] = useState(""),
    [unknown, setUnknown] = useState(false),
    [name, setName] = useState(""),
    [organization, setOrganization] = useState(""),
    [existing, setExisting] = useState(""),
    [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState("");
  const scanner = useRef<Html5Qrcode | null>(null),
    handling = useRef(false);
  const stop = async () => {
    const scan = scanner.current;
    if (scan) {
      scanner.current = null;
      try {
        if (scan.isScanning) await scan.stop();
        scan.clear();
      } catch {}
    }
    setCamera(false);
  };
  useEffect(
    () => () => {
      const scan = scanner.current;
      scanner.current = null;
      if (scan?.isScanning)
        void scan
          .stop()
          .then(() => scan.clear())
          .catch(() => {});
    },
    [],
  );
  async function lookup(value: string) {
    if (handling.current) return;
    handling.current = true;
    setBusy(true);
    setLocalError("");
    try {
      const qr = normalizeQr(value);
      if (!qr || new TextEncoder().encode(qr).length > 2000)
        throw new Error("أدخل محتوى QR صالحًا لا يتجاوز 2000 بايت.");
      setRaw(qr);
      await stop();
      const { data, error } = await client()
        .from("exhibition_qr_codes")
        .select("*")
        .eq("conference_id", s.conferenceId)
        .eq("content", qr)
        .maybeSingle();
      if (error) throw error;
      if (data) navigate("/record/" + data.exhibition_id);
      else setUnknown(true);
    } catch (e) {
      setLocalError(errorText(e));
    } finally {
      handling.current = false;
      setBusy(false);
    }
  }
  async function start() {
    setLocalError("");
    if (!window.isSecureContext) {
      setLocalError("الكاميرا تحتاج اتصال HTTPS أو تشغيلًا محليًا آمنًا.");
      return;
    }
    setCamera(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scan = new Html5Qrcode("qr-reader");
      scanner.current = scan;
      await scan.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (value) => void lookup(value),
        () => {},
      );
    } catch {
      await stop();
      setLocalError(
        "تعذر فتح الكاميرا. اسمح بالوصول إليها من إعدادات المتصفح، أو أدخل محتوى الرمز يدويًا.",
      );
    }
  }
  if (!s.conference) return <NeedConference />;
  return (
    <>
      <Heading
        title="مسح رمز المعرض"
        description="استخدم الرمز الأصلي للمنظم. فتح الرابط وحده لا يسجل زيارة."
      />
      <div className="scan-layout">
        <section className="panel scanner-panel">
          <div className={"scanner-window " + (camera ? "active" : "")}>
            <div id="qr-reader" />
            {!camera && (
              <div className="scanner-placeholder">
                <div className="scan-frame">
                  <ScanLine size={74} strokeWidth={1} />
                </div>
                <h2>وجّه الكاميرا نحو رمز QR</h2>
                <p>روابط المواقع والملفات والنصوص ومعرّفات المعارض</p>
              </div>
            )}
          </div>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => void (camera ? stop() : start())}
          >
            <Camera size={18} />
            {camera ? "إيقاف الكاميرا" : "فتح كاميرا الجوال"}
          </button>
          <div className="divider-label">أو أدخل محتوى الرمز</div>
          <Form onSave={() => lookup(raw)}>
            {(saving) => (
              <>
                <Field label="الرابط أو النص الأصلي" required>
                  <textarea
                    dir="auto"
                    required
                    maxLength={2000}
                    value={raw}
                    onChange={(e) => {
                      setRaw(e.target.value);
                      setUnknown(false);
                    }}
                    placeholder="ألصق محتوى QR كما هو…"
                  />
                </Field>
                <Submit busy={saving || busy}>التحقق من المعرض</Submit>
              </>
            )}
          </Form>
          {localError && (
            <div className="alert" role="alert">
              {localError}
            </div>
          )}
        </section>
        <section className="panel">
          <span className="eyebrow">زيارة بلا تكرار</span>
          <h2>{unknown ? "هذا الرمز غير مسجل بعد" : "كيف تعمل الزيارة؟"}</h2>
          {unknown ? (
            <>
              <p>
                أدخل اسم المعرض والجهة، أو اربط الرمز بمعرض موجود، ثم أكمل
                بيانات الزيارة مباشرة.
              </p>
              <Form
                onSave={async () => {
                  if (
                    await s.run(async () => {
                      const id = await rpc("register_exhibition", {
                        p_conference: s.conferenceId,
                        p_name: name,
                        p_organization: organization,
                        p_qr: normalizeQr(raw),
                        p_existing: existing || null,
                      });
                      navigate("/record/" + id);
                    }, "تم تسجيل الرمز")
                  )
                    setUnknown(false);
                }}
              >
                {(saving) => (
                  <>
                    <Field label="ربط بمعرض موجود (اختياري)">
                      <select
                        value={existing}
                        onChange={(e) => setExisting(e.target.value)}
                      >
                        <option value="">إنشاء معرض جديد</option>
                        {s.exhibitions.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} — {e.organization}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {!existing && (
                      <>
                        <Field label="اسم المعرض" required>
                          <input
                            required
                            minLength={2}
                            maxLength={200}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </Field>
                        <Field label="اسم الجهة أو الشركة" required>
                          <input
                            required
                            minLength={2}
                            maxLength={200}
                            value={organization}
                            onChange={(e) => setOrganization(e.target.value)}
                          />
                        </Field>
                      </>
                    )}

                    <Submit busy={saving}>
                      {existing ? "ربط الرمز بالمعرض" : "إنشاء سجل المعرض"}
                    </Submit>
                  </>
                )}
              </Form>
            </>
          ) : (
            <ol className="steps">
              <li>
                <b>مسح الرمز الأصلي</b>
                <span>نتحقق من سجل المعرض على مستوى الشركة.</span>
              </li>
              <li>
                <b>تعبئة بيانات الزيارة</b>
                <span>
                  أكمل بيانات المسؤول والفرص والمرفقات دون مهلة زمنية.
                </span>
              </li>
              <li>
                <b>توثيق الفرصة وحفظ الزيارة</b>
                <span>تظهر الزيارة مباشرة لجميع أعضاء الفريق.</span>
              </li>
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

export function VisitPage() {
  const { id } = useParams(),
    s = useConferenceData(),
    navigate = useNavigate();
  const exhibition = s.data.exhibitions.find((e) => e.id === id);
  if (!exhibition)
    return s.loading ? (
      <Loading />
    ) : (
      <Empty title="المعرض غير متاح" text="حدّث البيانات ثم حاول مرة أخرى.">
        <button className="button" onClick={() => void s.refresh()}>
          تحديث البيانات
        </button>
      </Empty>
    );
  const completed = s.data.visits.find(
    (v) => v.exhibition_id === id && v.visit_round === exhibition.visit_round,
  );
  if (completed)
    return (
      <section className="panel">
        <h1>تمت زيارة هذا المعرض مسبقًا</h1>
        <p>اسم الموظف: {s.name(completed.employee_id)}</p>
        <p>تاريخ الزيارة: {saDate(completed.visited_at)}</p>
        <Link className="button primary" to={"/visit/" + completed.id}>
          تفاصيل الزيارة
        </Link>
      </section>
    );
  return (
    <>
      <Heading
        title="تسجيل زيارة جديدة"
        description={exhibition.name + " · " + exhibition.organization}
      />
      <VisitForm
        key={id}
        exhibition={exhibition}
        onSaved={(id) => navigate("/visit/" + id)}
      />
    </>
  );
}

const fields: {
  key: keyof VisitInput;
  label: string;
  type?: string;
  required?: boolean;
  section: string;
}[] = [
  {
    key: "contact_name",
    label: "اسم الشخص المسؤول",
    required: true,
    section: "معلومات التواصل",
  },
  { key: "job_title", label: "المسمى الوظيفي", section: "معلومات التواصل" },
  {
    key: "phone",
    label: "رقم التواصل",
    type: "tel",
    required: true,
    section: "معلومات التواصل",
  },
  {
    key: "email",
    label: "البريد الإلكتروني",
    type: "email",
    section: "معلومات التواصل",
  },
  {
    key: "business_activity",
    label: "طبيعة نشاط الجهة",
    required: true,
    type: "textarea",
    section: "طبيعة العمل",
  },
  {
    key: "services",
    label: "الخدمات المقدمة",
    type: "textarea",
    section: "طبيعة العمل",
  },
  {
    key: "products",
    label: "المنتجات أو الحلول المتوفرة",
    type: "textarea",
    section: "طبيعة العمل",
  },
  {
    key: "opportunity",
    label: "وصف الفرصة التجارية المحتملة",
    type: "textarea",
    section: "الفرص التجارية",
  },
  {
    key: "collaboration",
    label: "إمكانية التعاون مع الشركة",
    type: "textarea",
    section: "الفرص التجارية",
  },
  {
    key: "notes",
    label: "ملاحظات إضافية",
    type: "textarea",
    section: "التقييم والمتابعة",
  },
];
type LocalFile = { file: File; url: string };
function VisitForm({
  exhibition,
  visit,
  onSaved,
}: {
  exhibition?: Row;
  visit?: Row;
  onSaved: (id: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const s = useStore(),
    opp = s.data.commercial_opportunities.find((o) => o.visit_id === visit?.id),
    [value, setValue] = useState<VisitInput>(() =>
      visit
        ? {
            ...emptyVisit,
            ...visit,
            opportunity: opp?.description || "",
            importance: opp?.importance || "متوسطة",
          }
        : emptyVisit,
    ),
    [files, setFiles] = useState<LocalFile[]>([]),
    [err, setErr] = useState(""),
    [progress, setProgress] = useState("");
  const [round] = useState(exhibition?.visit_round);
  const fileRef = useRef<LocalFile[]>([]);
  useEffect(() => {
    fileRef.current = files;
  }, [files]);
  useEffect(
    () => () => fileRef.current.forEach((f) => URL.revokeObjectURL(f.url)),
    [],
  );
  const dirty = useRef(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  const update = (key: keyof VisitInput, v: string | number) => {
    dirty.current = true;
    setValue((x) => ({ ...x, [key]: v }));
  };
  async function selectFiles(selected: FileList | null) {
    if (!selected) return;
    setErr("");
    setSelecting(true);
    try {
      const captured = await captureAttachments(selected, files.length);
      setFiles((prev) => [
        ...prev,
        ...captured.map((file) => ({
          file,
          url: URL.createObjectURL(file),
        })),
      ]);
      dirty.current = true;
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setSelecting(false);
    }
  }
  async function save() {
    setErr("");
    const checked = visitSchema.safeParse(value);
    if (!checked.success) {
      setErr(checked.error.issues[0].message);
      return;
    }
    const uploaded: {
      path: string;
      name: string;
      mime_type: string;
      size: number;
    }[] = [];
    try {
      if (visit) {
        await rpc("update_visit", { p_visit: visit.id, p_data: checked.data });
        dirty.current = false;
        await s.refresh();
        s.setNotice("تم تحديث بيانات الزيارة");
        onSaved(visit.id);
        return;
      }
      if (!exhibition || !round) throw new Error("المعرض غير متاح. أعد فتحه.");
      for (const [i, item] of files.entries()) {
        setProgress(`جارٍ رفع المرفق ${i + 1} من ${files.length}…`);
        const path = `${s.profile!.id}/${exhibition.id}/${round}/${crypto.randomUUID()}.${mimeExtensions[item.file.type]}`;
        const { error } = await client()
          .storage.from("visit-files")
          .upload(path, item.file, {
            contentType: item.file.type,
            upsert: false,
          });
        if (error)
          throw new Error("فشل رفع ملف. تحقق من الاتصال ثم حاول مجددًا.");
        uploaded.push({
          path,
          name: item.file.name,
          mime_type: item.file.type,
          size: item.file.size,
        });
      }
      setProgress("جارٍ حفظ الزيارة…");
      const id = await rpc<string>("save_visit_direct", {
        p_exhibition: exhibition.id,
        p_round: round,
        p_data: checked.data,
        p_files: uploaded,
      });
      dirty.current = false;
      await s.refresh();
      s.setNotice("تم حفظ الزيارة بنجاح وتحديث حالة المعرض");
      onSaved(id);
    } catch (e) {
      if (uploaded.length)
        await client()
          .storage.from("visit-files")
          .remove(uploaded.map((f) => f.path));
      setErr(errorText(e));
    } finally {
      setProgress("");
    }
  }
  return (
    <Form onSave={save} className="visit-form">
      {(busy) => (
        <fieldset disabled={busy || selecting}>
          <section className="panel">
            <div className="section-head">
              <h2>معلومات المعرض</h2>
              <Badge>{visit ? "زيارة مكتملة" : "زيارة جديدة"}</Badge>
            </div>
            <div className="form-grid">
              <Field label="اسم المعرض">
                <input value={exhibition?.name || ""} readOnly />
              </Field>
              <Field label="اسم الجهة">
                <input value={exhibition?.organization || ""} readOnly />
              </Field>
              <Field label="محتوى QR الأصلي">
                <textarea
                  dir="auto"
                  readOnly
                  value={s.data.exhibition_qr_codes
                    .filter((q) => q.exhibition_id === exhibition?.id)
                    .map((q) => q.content)
                    .join("\n")}
                />
              </Field>
              <Field label="بيانات الزيارة">
                <input
                  readOnly
                  value={`${visit ? s.data.profiles.find((p) => p.id === visit.employee_id)?.full_name : s.profile?.full_name} · ${visit ? saDate(visit.visited_at) : "يسجل التوقيت تلقائيًا عند الحفظ"}`}
                />
              </Field>
            </div>
          </section>
          {[
            "معلومات التواصل",
            "طبيعة العمل",
            "الفرص التجارية",
            "التقييم والمتابعة",
          ].map((section, index) => (
            <section key={section} className="panel">
              <div className="section-head">
                <h2>
                  <span className="section-number">{index + 1}</span>
                  {section}
                </h2>
                <small className="muted">الحقول بعلامة * مطلوبة</small>
              </div>
              <div className="form-grid">
                {fields
                  .filter((f) => f.section === section)
                  .map((f) => (
                    <Field key={f.key} label={f.label} required={f.required}>
                      {f.type === "textarea" ? (
                        <textarea
                          maxLength={4000}
                          required={f.required}
                          value={value[f.key]}
                          onChange={(e) => update(f.key, e.target.value)}
                        />
                      ) : (
                        <input
                          maxLength={f.key === "phone" ? 20 : 200}
                          dir={
                            f.type === "tel" || f.type === "email"
                              ? "ltr"
                              : undefined
                          }
                          type={f.type || "text"}
                          required={f.required}
                          value={value[f.key]}
                          onChange={(e) => update(f.key, e.target.value)}
                        />
                      )}
                    </Field>
                  ))}
                {section === "الفرص التجارية" && (
                  <Field label="مدى أهمية الفرصة">
                    <select
                      value={value.importance}
                      onChange={(e) => update("importance", e.target.value)}
                    >
                      {["مرتفعة", "متوسطة", "منخفضة"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {section === "التقييم والمتابعة" && (
                  <>
                    <Field label="تقييم الجهة" required>
                      <div
                        className="stars"
                        role="group"
                        aria-label="تقييم الجهة"
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            type="button"
                            aria-label={`${n} نجوم`}
                            aria-pressed={value.rating === n}
                            className={n <= value.rating ? "selected" : ""}
                            key={n}
                            onClick={() => update("rating", n)}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="مستوى الاهتمام">
                      <select
                        value={value.interest}
                        onChange={(e) => update("interest", e.target.value)}
                      >
                        {["مرتفع", "متوسط", "منخفض"].map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="أولوية المتابعة">
                      <select
                        value={value.priority}
                        onChange={(e) => update("priority", e.target.value)}
                      >
                        {["مرتفعة", "متوسطة", "منخفضة"].map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </section>
          ))}
          {!visit && (
            <section className="panel">
              <h2>المرفقات</h2>
              <p className="muted">
                صور JPG وPNG وWebP وملفات PDF · حتى 10 ملفات، 10 ميجابايت لكل
                ملف.
              </p>
              <label className="upload-zone">
                <Upload />
                <strong>اختيار صور أو ملفات</strong>
                <span>يمكن مراجعة الملفات وإزالتها قبل الحفظ</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    void selectFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="file-grid">
                {files.map((f, i) => (
                  <div className="file-card" key={f.url}>
                    {f.file.type.startsWith("image/") ? (
                      <img src={f.url} alt={f.file.name} />
                    ) : (
                      <FileText size={36} />
                    )}
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.file.name}
                    </a>
                    <small>
                      {(f.file.size / 1024 / 1024).toFixed(2)} ميجابايت
                    </small>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        URL.revokeObjectURL(f.url);
                        setFiles(files.filter((_, j) => j !== i));
                      }}
                    >
                      <Trash2 size={15} />
                      إزالة
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {err && (
            <div className="alert" role="alert">
              {err}
            </div>
          )}
          {progress && <p role="status">{progress}</p>}
          <div className="form-footer">
            <p>
              <CheckCircle2 size={17} />
              اسم الموظف والتوقيت محميّان بواسطة الخادم.
            </p>
            <Submit busy={busy}>
              {visit ? "حفظ التعديلات" : "حفظ الزيارة وإكمالها"}
            </Submit>
          </div>
        </fieldset>
      )}
    </Form>
  );
}
export function VisitsPage() {
  const s = useConferenceData(),
    [mine, setMine] = useState(s.profile?.role === "employee"),
    [employee, setEmployee] = useState(""),
    [day, setDay] = useState("");
  if (!s.conference) return <NeedConference />;
  return (
    <>
      <Heading
        title="سجل الزيارات"
        description="توثيق زيارات الشركة وبيانات الجهات التي التقى بها الفريق."
      />
      <VisitTable
        rows={s.visits.filter(
          (v) =>
            (!mine || v.employee_id === s.profile?.id) &&
            (!employee || v.employee_id === employee) &&
            (!day || dayKey(v.visited_at) === day),
        )}
        filters={
          <>
            <label className="check compact">
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => setMine(e.target.checked)}
              />
              زياراتي فقط
            </label>
            <select
              aria-label="الموظف"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
            >
              <option value="">كل الموظفين</option>
              {s.data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <input
              aria-label="يوم الزيارة"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </>
        }
      />
    </>
  );
}
export function VisitDetails() {
  const { id } = useParams(),
    s = useConferenceData(),
    [edit, setEdit] = useState(false);
  const visit = s.data.visits.find((v) => v.id === id);
  if (!visit)
    return s.loading ? (
      <Loading />
    ) : (
      <Empty
        title="الزيارة غير متاحة"
        text="تحقق من رابط الزيارة أو حدّث البيانات."
      />
    );
  const ex = s.data.exhibitions.find((e) => e.id === visit.exhibition_id),
    opp = s.data.commercial_opportunities.find((o) => o.visit_id === id),
    files = s.data.visit_attachments.filter((a) => a.visit_id === id),
    canEdit =
      s.profile?.role !== "employee" || visit.employee_id === s.profile?.id;
  if (edit)
    return (
      <>
        <Heading title="تعديل بيانات الزيارة">
          <button className="button ghost" onClick={() => setEdit(false)}>
            إلغاء التعديل
          </button>
        </Heading>
        <VisitForm
          exhibition={ex}
          visit={visit}
          onSaved={() => setEdit(false)}
        />
      </>
    );
  return (
    <>
      <Heading
        title={ex?.name || "تفاصيل الزيارة"}
        description={`${ex?.organization || ""} · ${s.name(visit.employee_id)} · ${saDate(visit.visited_at)}`}
      >
        {canEdit && (
          <button className="button primary" onClick={() => setEdit(true)}>
            تعديل الزيارة
          </button>
        )}
        <Link className="button ghost" to="/visits">
          سجل الزيارات
        </Link>
      </Heading>
      <section className="panel">
        <div className="section-head">
          <h2>بيانات الزيارة</h2>
          <Badge>تمت الزيارة</Badge>
        </div>
        <dl className="detail-grid">
          {fields.map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>
                {f.key === "opportunity"
                  ? opp?.description || "لا توجد فرصة مسجلة"
                  : visit[f.key] || "—"}
              </dd>
            </div>
          ))}
          <div>
            <dt>التقييم</dt>
            <dd className="rating">{"★".repeat(visit.rating)}</dd>
          </div>
          <div>
            <dt>مستوى الاهتمام</dt>
            <dd>{visit.interest}</dd>
          </div>
          <div>
            <dt>أولوية المتابعة</dt>
            <dd>{visit.priority}</dd>
          </div>
          <div>
            <dt>آخر تحديث</dt>
            <dd>{saDate(visit.updated_at)}</dd>
          </div>
        </dl>
      </section>
      <section className="panel below">
        <h2>المرفقات ({files.length})</h2>
        {files.length ? (
          <div className="file-grid">
            {files.map((file) => (
              <button
                className="file-card"
                key={file.id}
                onClick={() =>
                  void s.run(async () => {
                    const tab = window.open("about:blank", "_blank");
                    if (tab) tab.opener = null;
                    try {
                      const { data, error } = await client()
                        .storage.from("visit-files")
                        .createSignedUrl(file.path, 60);
                      if (error) throw error;
                      if (tab) tab.location.href = data.signedUrl;
                      else
                        throw new Error("اسمح بالنوافذ المنبثقة لفتح المرفق.");
                    } catch (e) {
                      tab?.close();
                      throw e;
                    }
                  }, "تم فتح المرفق برابط مؤقت")
                }
              >
                <FileText />
                <strong>{file.name}</strong>
                <span>
                  فتح آمن
                  <ExternalLink size={14} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">لا توجد مرفقات لهذه الزيارة.</p>
        )}
      </section>
    </>
  );
}
