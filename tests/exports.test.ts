import { it, expect } from "vitest";
import ExcelJS from "exceljs";
import { createWorkbook } from "../src/export-workbook";
it("ينشئ ملف XLSX حقيقيًا قابلًا للقراءة مع العربية وRTL وحماية الصيغ", async () => {
  const bytes = await createWorkbook("تقرير الزيارات", [
    { الجهة: "شركة اختبار", التقييم: 5, الملاحظات: '=HYPERLINK("x")' },
  ]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.worksheets[0];
  expect(sheet.getCell("A1").value).toBe("الجهة");
  expect(sheet.getCell("A2").value).toBe("شركة اختبار");
  expect(sheet.getCell("B2").value).toBe(5);
  expect(sheet.getCell("C2").type).toBe(ExcelJS.ValueType.String);
  expect(sheet.views[0].rightToLeft).toBe(true);
  expect(sheet.views[0].state).toBe("frozen");
});
