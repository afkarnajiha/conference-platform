import { useState } from "react";
import { NavLink, Route, Routes, Link, Navigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  ScanLine,
  Users,
  CalendarDays,
  BriefcaseBusiness,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  ArrowUpLeft,
  ShieldCheck,
  Database,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { client, configured, errorText } from "./api";
import { useStore } from "./store";
import { Field, Form, Submit, Loading } from "./components";
import { roleNames, saDate, type Role } from "./domain";
import {
  Dashboard,
  Exhibitions,
  Team,
  Schedule,
  SettingsPage,
  Opportunities,
} from "./pages";
import { ScanPage, VisitPage, VisitDetails, VisitsPage } from "./visits";
import { Reports } from "./reports";
const nav = [
  ["/", "نظرة عامة", LayoutDashboard],
  ["/scan", "مسح رمز المعرض", ScanLine],
  ["/exhibitions", "المعارض المشاركة", Building2],
  ["/visits", "سجل الزيارات", FileBarChart],
  ["/schedule", "جدول المشاركة", CalendarDays],
  ["/opportunities", "الفرص التجارية", BriefcaseBusiness],
  ["/team", "فريق العمل", Users],
  ["/reports", "التقارير والتصدير", FileBarChart],
  ["/settings", "إعدادات المؤتمر", Settings],
] as const;
export function App() {
  const s = useStore(),
    [menu, setMenu] = useState(false);
  if (!configured) return <Setup />;
  if (!s.ready) return <Loading />;
  if (!s.session) return <Login />;
  if (s.recovery) return <Login recovery />;
  if (!s.profile) {
    return (
      <main className="auth">
        <h1>جارٍ التحقق من حسابك</h1>
        {s.loading ? (
          <Loading />
        ) : (
          <>
            <p>
              {s.error ||
                "تعذر العثور على ملف حساب نشط. تواصل مع مسؤول المنصة."}
            </p>
            <button className="button" onClick={() => void s.refresh()}>
              إعادة المحاولة
            </button>
            <button
              className="button ghost"
              onClick={() => void client().auth.signOut()}
            >
              تسجيل الخروج
            </button>
          </>
        )}
      </main>
    );
  }
  if (!s.profile.active)
    return (
      <main className="auth">
        <h1>الحساب غير نشط</h1>
        <p>تواصل مع مسؤول المنصة لتفعيل الحساب.</p>
        <button className="button" onClick={() => void client().auth.signOut()}>
          تسجيل الخروج
        </button>
      </main>
    );
  const staff = s.profile.role !== "employee",
    admin = s.profile.role === "admin";
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Building2 size={27} />
          </div>
          <div>
            <strong>الأفكار الناجحة</strong>
            <small>إدارة المعارض والمؤتمرات</small>
          </div>
        </Link>
        <button
          className="mobile-only icon-button close-menu"
          aria-label="إغلاق القائمة"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="nav-label">مساحة العمل</div>
        <nav>
          {nav
            .filter(
              ([url]) =>
                !(
                  (url === "/team" ||
                    url === "/reports" ||
                    url === "/opportunities") &&
                  !staff
                ) && !(url === "/settings" && !admin),
            )
            .map(([url, label, Icon]) => (
              <NavLink
                key={url}
                to={url}
                end={url === "/"}
                onClick={() => setMenu(false)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {url === "/" && <span className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck size={19} />
          <span>
            بيانات الشركة في مساحة آمنة<small>صلاحيات مخصصة لكل عضو</small>
          </span>
        </div>
      </aside>
      {menu && <div className="menu-shade" onClick={() => setMenu(false)} />}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="mobile-only icon-button"
              aria-label="فتح القائمة"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>منصة إدارة المشاركة</span>
            <span className="topbar-divider" />
            <select
              aria-label="المؤتمر الحالي"
              value={s.conferenceId}
              onChange={(e) => s.setConferenceId(e.target.value)}
            >
              {!s.data.conferences.length && (
                <option value="">لم تتم إضافة مؤتمر</option>
              )}
              {s.data.conferences.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="account">
            <div className="avatar">{s.profile.full_name.slice(0, 1)}</div>
            <div>
              <strong>{s.profile.full_name}</strong>
              <small>{roleNames[s.profile.role as Role]}</small>
            </div>
            <button
              className="icon-button"
              title="تحديث البيانات"
              aria-label="تحديث البيانات"
              onClick={() => void s.refresh()}
            >
              <RefreshCw size={17} className={s.loading ? "spin" : ""} />
            </button>
            <button
              className="icon-button"
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
              onClick={() =>
                void s.run(async () => {
                  const { error } = await client().auth.signOut();
                  if (error) throw error;
                }, "تم تسجيل الخروج")
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {s.error && (
            <div role="alert" className="alert">
              <span>{s.error}</span>
              <button onClick={() => s.setError("")} aria-label="إغلاق التنبيه">
                <X size={16} />
              </button>
            </div>
          )}
          {s.notice && (
            <div role="status" className="toast">
              <CheckCircle2 size={20} />
              {s.notice}
            </div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/exhibitions" element={<Exhibitions />} />
            <Route path="/visits" element={<VisitsPage />} />
            <Route path="/visit/:id" element={<VisitDetails />} />
            <Route path="/record/:id" element={<VisitPage />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route
              path="/team"
              element={staff ? <Team /> : <Navigate to="/" />}
            />
            <Route
              path="/opportunities"
              element={staff ? <Opportunities /> : <Navigate to="/" />}
            />
            <Route
              path="/reports"
              element={staff ? <Reports /> : <Navigate to="/" />}
            />
            <Route
              path="/settings"
              element={admin ? <SettingsPage /> : <Navigate to="/" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="footer">
            <span>الأفكار الناجحة التجارية</span>
            <span>التوقيت المحلي · المملكة العربية السعودية</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Setup() {
  return (
    <div className="setup">
      <div className="setup-brand">
        <Building2 />
        <strong>الأفكار الناجحة التجارية</strong>
        <span>منصة إدارة المعارض والمؤتمرات</span>
      </div>
      <div className="setup-grid">
        <section>
          <span className="eyebrow">مشاركة منظّمة. فرص أوضح.</span>
          <h1>
            كل زيارة،
            <br />
            خطوة نحو <em>فرصة جديدة.</em>
          </h1>
          <p>
            مساحة واحدة لتنظيم فريقك، وتوثيق الزيارات، ومتابعة الفرص التجارية في
            معارض ومؤتمرات الشركة.
          </p>
          <div className="setup-features">
            {[
              [
                ScanLine,
                "زيارة واحدة لكل معرض",
                "تسجيل مباشر مع منع تكرار الزيارة عند الحفظ.",
              ],
              [
                Users,
                "فريق يعمل بتناغم",
                "توزيع واضح لأيام المشاركة وصلاحيات محددة.",
              ],
              [
                BriefcaseBusiness,
                "فرص تستحق المتابعة",
                "بيانات موثقة وتقارير تساعدك على اتخاذ القرار.",
              ],
            ].map(([I, t, d], i) => {
              const Icon = I as typeof Users;
              return (
                <div key={i}>
                  <Icon />
                  <div>
                    <strong>{String(t)}</strong>
                    <p>{String(d)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="setup-card">
          <div className="setup-icon">
            <Database size={30} />
          </div>
          <span className="eyebrow">إعداد مساحة العمل</span>
          <h2>المشروع جاهز للإعداد المحلي</h2>
          <p>
            لم يتم ربط قاعدة بيانات الشركة بعد. لن تُعرض بيانات أو إحصائيات حتى
            يكتمل الربط.
          </p>
          <ol>
            <li>
              <b>إكمال ملفات المشروع</b>
              <span>الواجهة، وظائف قاعدة البيانات، ودليل التشغيل.</span>
            </li>
            <li>
              <b>رفع المشروع إلى GitHub</b>
              <span>حفظ المصدر وإعداد النشر التلقائي.</span>
            </li>
            <li>
              <b>ربط Supabase وتفعيل الحسابات</b>
              <span>تطبيق SQL وإضافة متغيرات البيئة.</span>
            </li>
          </ol>
          <div className="setup-note">
            <ShieldCheck />
            <p>
              مفاتيح الإدارة تبقى على الخادم، وملفات الشركة تحفظ في مساحة خاصة.
            </p>
          </div>
          <details>
            <summary>
              متغيرات الربط المطلوبة <ArrowUpLeft size={16} />
            </summary>
            <p>
              انسخ ملف .env.example إلى .env وأضف رابط مشروع Supabase والمفتاح
              العام، ثم أعد تشغيل التطبيق.
            </p>
            <code dir="ltr">
              VITE_SUPABASE_URL
              <br />
              VITE_SUPABASE_PUBLISHABLE_KEY
            </code>
          </details>
        </section>
      </div>
      <footer>
        نظام الشركة لإدارة المشاركة الميدانية{" "}
        <span>{saDate(new Date().toISOString(), true)}</span>
      </footer>
    </div>
  );
}
function Login({ recovery = false }: { recovery?: boolean }) {
  const s = useStore(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [forgot, setForgot] = useState(false),
    [err, setErr] = useState(""),
    [sent, setSent] = useState(false);
  return (
    <main className="login-page">
      <section className="login-intro">
        <Building2 size={46} />
        <h1>الأفكار الناجحة التجارية</h1>
        <p>
          من الزيارة الأولى
          <br />
          إلى الفرصة القادمة.
        </p>
      </section>
      <section className="auth">
        <span className="eyebrow">مرحبًا بك في منصة الشركة</span>
        <h1>
          {recovery
            ? "تعيين كلمة مرور جديدة"
            : forgot
              ? "استعادة كلمة المرور"
              : "تسجيل الدخول"}
        </h1>
        <p>استخدم حساب العمل للوصول إلى مساحة المشاركة.</p>
        {err && (
          <div className="alert" role="alert">
            {err}
          </div>
        )}
        {sent && (
          <div className="alert">
            إذا كان البريد مسجلًا، ستصلك رسالة لإعادة تعيين كلمة المرور.
          </div>
        )}
        <Form
          onSave={async () => {
            setErr("");
            try {
              if (recovery) {
                const { error } = await client().auth.updateUser({ password });
                if (error) throw error;
                s.setRecovery(false);
                s.setNotice("تم تحديث كلمة المرور");
              } else if (forgot) {
                const { error } = await client().auth.resetPasswordForEmail(
                  email,
                  { redirectTo: location.origin + location.pathname },
                );
                if (error) throw error;
                setSent(true);
              } else {
                const { error } = await client().auth.signInWithPassword({
                  email,
                  password,
                });
                if (error) throw error;
              }
            } catch (e) {
              setErr(errorText(e));
            }
          }}
        >
          {(busy) => (
            <>
              {!recovery && (
                <Field label="البريد الإلكتروني" required>
                  <input
                    type="email"
                    autoComplete="username"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              )}
              {(!forgot || recovery) && (
                <Field label="كلمة المرور" required>
                  <input
                    type="password"
                    minLength={recovery ? 12 : 1}
                    required
                    autoComplete={
                      recovery ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              )}
              <Submit busy={busy}>
                {recovery
                  ? "حفظ كلمة المرور"
                  : forgot
                    ? "إرسال رابط الاستعادة"
                    : "دخول المنصة"}
              </Submit>
            </>
          )}
        </Form>
        {!recovery && (
          <button
            className="text-button"
            onClick={() => {
              setForgot(!forgot);
              setErr("");
              setSent(false);
            }}
          >
            {forgot ? "العودة إلى تسجيل الدخول" : "نسيت كلمة المرور؟"}
          </button>
        )}
        <small className="muted">الحسابات ينشئها مسؤول المنصة فقط.</small>
      </section>
    </main>
  );
}
