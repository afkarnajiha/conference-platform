import { it, expect } from "vitest";
import { prepareEmployees, readEmployees } from "../src/employee-import";
import ExcelJS from "exceljs";
const header = ["م", "الاسم الكامل", "المسمى الوظيفي", "البريد الإلكتروني"];
it("maps the supplied Arabic column order and keeps missing titles empty", () => {
  const rows = prepareEmployees(
    [header, ["1", "موظف اختبار", "", " USER@example.com "]],
    [],
  );
  expect(rows[0]).toMatchObject({
    full_name: "موظف اختبار",
    email: "user@example.com",
    job_title: "",
    error: "",
    existing: false,
  });
});
it("flags duplicates and invalid emails, and skips existing accounts", () => {
  const rows = prepareEmployees(
    [
      header,
      ["1", "موظف أول", "", "A@EXAMPLE.COM"],
      ["2", "موظف ثان", "", "a@example.com"],
      ["3", "موظف ثالث", "", "invalid"],
    ],
    ["a@example.com"],
  );
  expect(rows[0].existing).toBe(true);
  expect(rows[1].error).toContain("مكرر");
  expect(rows[2].error).toContain("غير صحيح");
});
it("rejects files with missing required headers", () =>
  expect(() => prepareEmployees([["م", "القسم"]], [])).toThrow());
it("reads only the main employee sheet and ignores personal-detail sheets", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("تفاصيل شخصية").addRow(["لا تستورد"]);
  const main = book.addWorksheet("بيانات الموظفين");
  main.addRow(header);
  main.addRow([1, "موظف تجريبي", "مهندس", "person@example.com"]);
  const bytes = await book.xlsx.writeBuffer();
  const result = await readEmployees(
    new File([bytes as BlobPart], "staff.xlsx"),
    [],
  );
  expect(result.sheet).toBe("بيانات الموظفين");
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].full_name).toBe("موظف تجريبي");
});
