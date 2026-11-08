// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  action: vi.fn(),
  refresh: vi.fn(),
  notice: vi.fn(),
}));
vi.mock("../src/employee-import", () => ({ readEmployees: mocks.read }));
vi.mock("../src/api", () => ({
  accountAction: mocks.action,
  errorText: (e: Error) => e.message,
}));
vi.mock("../src/store", () => ({
  useStore: () => ({
    data: { profiles: [] },
    refresh: mocks.refresh,
    setNotice: mocks.notice,
  }),
}));
import { EmployeeImport } from "../src/EmployeeImport";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.action.mockResolvedValue({ ok: true });
  mocks.read.mockResolvedValue({
    sheet: "بيانات الموظفين",
    rows: [
      {
        row: 2,
        full_name: "موظف اختبار",
        email: "a@example.com",
        job_title: "",
        error: "",
        existing: false,
      },
      {
        row: 3,
        full_name: "حساب موجود",
        email: "b@example.com",
        job_title: "",
        error: "",
        existing: true,
      },
    ],
  });
});
afterEach(cleanup);
async function choose() {
  render(<EmployeeImport onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("ملف الموظفين"), {
    target: { files: [new File(["x"], "staff.xlsx")] },
  });
  await screen.findByText("موظف اختبار");
}
it("does not send invitations merely by choosing the file", async () => {
  await choose();
  expect(mocks.action).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "إنشاء 1 حساب وإرسال الدعوات",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("imports only new valid employees after explicit confirmation", async () => {
  await choose();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "إنشاء 1 حساب وإرسال الدعوات" }),
  );
  await waitFor(() => expect(mocks.action).toHaveBeenCalledOnce());
  expect(mocks.action).toHaveBeenCalledWith({
    action: "create",
    full_name: "موظف اختبار",
    email: "a@example.com",
    job_title: "",
    role: "employee",
    active: true,
    manage_employees: false,
  });
  await screen.findByText("تم إنشاء الحساب وطلب إرسال الدعوة");
});
it("stops the batch at the first server error without automatically retrying", async () => {
  mocks.read.mockResolvedValue({
    sheet: "بيانات الموظفين",
    rows: [
      {
        row: 2,
        full_name: "موظف أول",
        email: "a@example.com",
        job_title: "",
        error: "",
        existing: false,
      },
      {
        row: 3,
        full_name: "موظف ثان",
        email: "b@example.com",
        job_title: "",
        error: "",
        existing: false,
      },
    ],
  });
  mocks.action.mockRejectedValue(new Error("فشل إرسال الدعوة"));
  render(<EmployeeImport onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("ملف الموظفين"), {
    target: { files: [new File(["x"], "staff.xlsx")] },
  });
  await screen.findByText("موظف أول");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "إنشاء 2 حساب وإرسال الدعوات" }),
  );
  await screen.findByText(/توقف الاستيراد عند أول خطأ/);
  expect(mocks.action).toHaveBeenCalledOnce();
});
