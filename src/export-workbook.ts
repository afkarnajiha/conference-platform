import { safeCell } from "./domain";
export async function createWorkbook(
  title: string,
  rows: Record<string, unknown>[],
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(
    title.replace(/[\/*?:[\]]/g, " ").slice(0, 31),
    { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] },
  );
  const keys = rows.length ? Object.keys(rows[0]) : [];
  sheet.columns = keys.map((key) => ({ header: key, key, width: 25 }));
  for (const row of rows)
    sheet.addRow(
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "number" ? value : safeCell(value),
        ]),
      ),
    );
  sheet.getRow(1).font = { bold: true, color: { argb: "FF12110D" }, size: 12 };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC4A46A" },
  };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
  });
  if (keys.length)
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: keys.length },
    };
  return workbook.xlsx.writeBuffer();
}
