// @vitest-environment jsdom
// Fixture data is test-only and is never imported by the application.
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mock = vi.hoisted(() => ({
  state: null as any,
  rpc: vi.fn(),
  account: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  reset: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("../src/store", () => ({ useStore: () => mock.state }));
vi.mock("../src/api", () => ({
  configured: true,
  errorText: (e: any) => e.message,
  rpc: mock.rpc,
  accountAction: mock.account,
  client: () => ({
    auth: {
      signInWithPassword: mock.login,
      signOut: mock.logout,
      resetPasswordForEmail: mock.reset,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: mock.lookup }) }),
      }),
    }),
  }),
}));
import { DataTable } from "../src/components";
import {
  Exhibitions,
  Schedule,
  Team,
  Dashboard,
  Opportunities,
} from "../src/pages";
import { ScanPage, VisitPage, VisitDetails } from "../src/visits";
import { App } from "../src/App";
const admin = {
  id: "a",
  full_name: "مدير الاختبار",
  email: "admin@test.invalid",
  role: "admin",
  active: true,
  created_at: "2026-11-08T08:00:00Z",
};
const employee = {
  id: "b",
  full_name: "موظف الاختبار",
  email: "employee@test.invalid",
  role: "employee",
  active: true,
  created_at: "2026-11-08T08:00:00Z",
};
const conference = {
  id: "c",
  name: "مؤتمر الاختبار",
  location: "الرياض",
  starts_on: "2026-11-08",
  ends_on: "2026-11-11",
};
const ex = {
  id: "e",
  conference_id: "c",
  name: "معرض اختبار",
  organization: "جهة الاختبار",
  visit_round: 1,
  needs_review: false,
};
const visit = {
  id: "v",
  exhibition_id: "e",
  employee_id: "b",
  visit_round: 1,
  contact_name: "مسؤول جهة",
  phone: "0501234567",
  business_activity: "نشاط تقني",
  rating: 4,
  interest: "مرتفع",
  priority: "مرتفعة",
  visited_at: "2026-11-08T10:00:00Z",
  updated_at: "2026-11-08T10:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.state = {
    session: { user: { id: "a" } },
    ready: true,
    profile: admin,
    conference,
    conferenceId: "c",
    setConferenceId: vi.fn(),
    loading: false,
    error: "",
    notice: "",
    setError: vi.fn(),
    setNotice: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    recovery: false,
    setRecovery: vi.fn(),
    data: {
      profiles: [admin, employee],
      employees: [],
      conferences: [conference],
      conference_assignments: [],
      exhibitions: [ex],
      exhibition_qr_codes: [
        { id: "q", exhibition_id: "e", content: "QR-ORIGINAL" },
      ],
      visits: [],
      visit_reservations: [],
      visit_attachments: [],
      commercial_opportunities: [],
      activity_logs: [],
    },
    run: async (fn: () => Promise<unknown>) => {
      await fn();
      return true;
    },
  };
  mock.rpc.mockResolvedValue("new-id");
  mock.account.mockResolvedValue({ ok: true });
  mock.login.mockResolvedValue({ error: null });
  mock.logout.mockResolvedValue({ error: null });
  mock.reset.mockResolvedValue({ error: null });
});
afterEach(cleanup);
const mount = (node: React.ReactNode, path = "/") =>
  render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
describe("تفاعل الواجهة مع طبقة الخدمات (بيانات اختبار معزولة)", () => {
  it("البحث والفرز وتقسيم صفحات الجدول", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      id: String(i),
      name: `جهة ${String(i).padStart(2, "0")}`,
    }));
    mount(
      <DataTable
        rows={rows}
        searchKeys={["name"]}
        columns={[{ key: "name", label: "الجهة" }]}
      />,
    );
    expect(screen.queryByText("جهة 13")).toBeNull();
    fireEvent.click(screen.getByText("التالي"));
    expect(screen.getByText("جهة 13")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("البحث"), {
      target: { value: "جهة 05" },
    });
    expect(screen.getByText("جهة 05")).toBeTruthy();
    expect(screen.queryByText("جهة 13")).toBeNull();
    fireEvent.change(screen.getByLabelText("البحث"), {
      target: { value: "غير موجود" },
    });
    expect(screen.getByText("لا توجد نتائج")).toBeTruthy();
  });
  it("الفرز يتغير بين التصاعدي والتنازلي", () => {
    mount(
      <DataTable
        rows={[
          { id: "1", name: "أ" },
          { id: "2", name: "ب" },
        ]}
        searchKeys={["name"]}
        columns={[{ key: "name", label: "الاسم" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "الاسم" }));
    expect(screen.getAllByRole("cell")[0].textContent).toBe("أ");
    fireEvent.click(screen.getByRole("button", { name: "الاسم" }));
    expect(screen.getAllByRole("cell")[0].textContent).toBe("ب");
  });
  it("تصفية المعارض حسب حالتها", () => {
    mount(<Exhibitions />);
    expect(screen.getByText("جهة الاختبار")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("تصفية الحالة"), {
      target: { value: "تمت الزيارة" },
    });
    expect(screen.getByText("لا توجد نتائج")).toBeTruthy();
  });
  it("تعديل المعرض يستدعي العملية المحمية", async () => {
    mount(<Exhibitions />);
    fireEvent.click(screen.getByLabelText("تعديل المعرض"));
    fireEvent.change(screen.getByLabelText(/اسم المعرض/), {
      target: { value: "معرض معدل" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith(
        "edit_exhibition",
        expect.objectContaining({
          p_id: "e",
          p_name: "معرض معدل",
          p_reviewed: true,
        }),
      ),
    );
  });
  it("إعادة التعيين تتطلب سببًا وترسل تصريح الزيارة الإضافية", async () => {
    mount(<Exhibitions />);
    fireEvent.click(screen.getByLabelText("إعادة التعيين"));
    fireEvent.change(screen.getByLabelText(/سبب الإجراء/), {
      target: { value: "متابعة تجارية إضافية" },
    });
    fireEvent.click(screen.getByLabelText(/السماح صراحة/));
    fireEvent.click(
      screen.getByRole("button", { name: "تأكيد إعادة التعيين" }),
    );
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("reset_exhibition", {
        p_exhibition: "e",
        p_additional: true,
        p_reason: "متابعة تجارية إضافية",
      }),
    );
  });
  it("توزيع الموظفين يحفظ الأيام المختارة", async () => {
    mount(<Schedule />);
    fireEvent.click(screen.getAllByRole("button", { name: "تعديل الأيام" })[1]);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("assign_employee", {
        p_conference: "c",
        p_employee: "b",
        p_dates: ["2026-11-08", "2026-11-09"],
      }),
    );
  });
  it("إنشاء الحساب يذهب لوظيفة الخادم فقط", async () => {
    mount(<Team />);
    fireEvent.click(screen.getByRole("button", { name: "إضافة حساب" }));
    fireEvent.change(screen.getByLabelText(/الاسم الكامل/), {
      target: { value: "موظف جديد" },
    });
    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/), {
      target: { value: "new@test.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await waitFor(() =>
      expect(mock.account).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "create",
          full_name: "موظف جديد",
          email: "new@test.invalid",
          role: "employee",
        }),
      ),
    );
  });
  it("تعطيل الحساب يرسل حالته المحدثة للخادم", async () => {
    mount(<Team />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "تعديل", exact: true })[1],
    );
    fireEvent.click(screen.getByLabelText("الحساب نشط"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await waitFor(() =>
      expect(mock.account).toHaveBeenCalledWith(
        expect.objectContaining({ action: "update", id: "b", active: false }),
      ),
    );
  });
  it("لوحة التحكم تحسب القيم من السجلات", () => {
    mock.state.data.visits = [visit];
    mock.state.data.commercial_opportunities = [
      {
        id: "o",
        visit_id: "v",
        importance: "مرتفعة",
        follow_up_status: "جديدة",
      },
    ];
    mount(<Dashboard />);
    expect(screen.getByText("100٪")).toBeTruthy();
    expect(screen.getByText("مؤتمر الاختبار")).toBeTruthy();
  });
  it("تحديث حالة الفرصة يستدعي RPC", async () => {
    mock.state.data.visits = [visit];
    mock.state.data.commercial_opportunities = [
      {
        id: "o",
        visit_id: "v",
        description: "فرصة اختبار",
        importance: "مرتفعة",
        follow_up_status: "جديدة",
      },
    ];
    mount(<Opportunities />);
    fireEvent.change(screen.getByLabelText("تحديث حالة الفرصة"), {
      target: { value: "قيد المتابعة" },
    });
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("follow_up", {
        p_id: "o",
        p_status: "قيد المتابعة",
      }),
    );
  });
  it("تسجيل الدخول يستخدم البريد وكلمة المرور", async () => {
    mock.state.session = null;
    mount(<App />);
    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/), {
      target: { value: "user@test.invalid" },
    });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), {
      target: { value: "test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "دخول المنصة" }));
    await waitFor(() =>
      expect(mock.login).toHaveBeenCalledWith({
        email: "user@test.invalid",
        password: "test-password",
      }),
    );
  });
  it("تسجيل الخروج يستدعي Auth", async () => {
    mount(<App />);
    fireEvent.click(screen.getByLabelText("تسجيل الخروج"));
    await waitFor(() => expect(mock.logout).toHaveBeenCalledOnce());
  });
  it("الموظف لا يرى إدارة الفريق والتقارير والإعدادات", () => {
    mock.state.profile = employee;
    mock.state.session.user.id = "b";
    mount(<App />);
    expect(screen.queryByRole("link", { name: "فريق العمل" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "التقارير والتصدير" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "إعدادات المؤتمر" })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "مسح رمز المعرض" }).length,
    ).toBeGreaterThan(0);
  });
  it("QR معروف ينتقل إلى فحص الزيارة دون فتح الرابط الخارجي", async () => {
    mock.lookup.mockResolvedValue({
      data: { exhibition_id: "e" },
      error: null,
    });
    mount(
      <Routes>
        <Route path="/" element={<ScanPage />} />
        <Route path="/record/:id" element={<p>وصل إلى الحجز</p>} />
      </Routes>,
    );
    fireEvent.change(screen.getByLabelText(/الرابط أو النص الأصلي/), {
      target: { value: "https://example.invalid/profile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "التحقق من المعرض" }));
    expect(await screen.findByText("وصل إلى الحجز")).toBeTruthy();
    expect(mock.lookup).toHaveBeenCalledOnce();
  });
  it("QR غير معروف يعرض نموذج المراجعة", async () => {
    mock.lookup.mockResolvedValue({ data: null, error: null });
    mount(<ScanPage />);
    fireEvent.change(screen.getByLabelText(/الرابط أو النص الأصلي/), {
      target: { value: "رمز نصي" },
    });
    fireEvent.click(screen.getByRole("button", { name: "التحقق من المعرض" }));
    expect(await screen.findByText("هذا الرمز غير مسجل بعد")).toBeTruthy();
  });
  it("الزيارة السابقة تعرض اسم الموظف وتاريخها", async () => {
    mock.state.data.visits = [visit];
    mock.state.data.profiles.push({ id: "b", full_name: "زميل سابق" });
    mock.rpc.mockResolvedValue({
      status: "completed",
      employee: "زميل سابق",
      visited_at: "2026-11-08T10:00:00Z",
      visit_id: "v",
    });
    mount(
      <Routes>
        <Route path="/record/:id" element={<VisitPage />} />
      </Routes>,
      "/record/e",
    );
    expect(await screen.findByText("تمت زيارة هذا المعرض مسبقًا")).toBeTruthy();
    expect(screen.getByText(/اسم الموظف:/)).toBeTruthy();
  });
  it("حفظ الزيارة يرسل البيانات دون هوية أو وقت يختاره المستخدم", async () => {
    mock.rpc.mockImplementation(async (name: string) =>
      name === "reserve_exhibition"
        ? {
            status: "accepted",
            token: "token-test",
            expires_at: new Date(Date.now() + 600000).toISOString(),
          }
        : "v",
    );
    mount(
      <Routes>
        <Route path="/record/:id" element={<VisitPage />} />
        <Route path="/visit/:id" element={<p>حفظت الزيارة</p>} />
      </Routes>,
      "/record/e",
    );
    fireEvent.change(await screen.findByLabelText(/اسم الشخص المسؤول/), {
      target: { value: "مسؤول اختبار" },
    });
    fireEvent.change(screen.getByLabelText(/رقم التواصل/), {
      target: { value: "0501234567" },
    });
    fireEvent.change(screen.getByLabelText(/طبيعة نشاط الجهة/), {
      target: { value: "نشاط تجاري" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "حفظ الزيارة وإكمالها" }),
    );
    expect(await screen.findByText("حفظت الزيارة")).toBeTruthy();
    const args = mock.rpc.mock.calls.find(
      (c) => c[0] === "save_visit_direct",
    )![1];
    expect(args.p_token).toBeUndefined();
    expect(args.p_round).toBe(1);
    expect(args.p_data.employee_id).toBeUndefined();
    expect(args.p_data.visited_at).toBeUndefined();
  });
  it("تفاصيل زيارة الزميل لا تسمح بالتعديل للموظف", () => {
    mock.state.profile = employee;
    mock.state.data.visits = [{ ...visit, employee_id: "a" }];
    mount(
      <Routes>
        <Route path="/visit/:id" element={<VisitDetails />} />
      </Routes>,
      "/visit/v",
    );
    expect(screen.queryByRole("button", { name: "تعديل الزيارة" })).toBeNull();
  });
});
