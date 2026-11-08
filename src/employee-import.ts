export type EmployeeImportRow = {
  row: number;
  full_name: string;
  email: string;
  job_title: string;
  error: string;
  existing: boolean;
};
export function normalizedHeader(value: string) {
  return value
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/[\s_\-]+/g, "")
    .toLowerCase();
}
export function prepareEmployees(matrix: string[][], existingEmails: string[]) {
  const aliases = {
    full_name: ["الاسم الكامل", "اسم الموظف", "الاسم", "full_name", "name"],
    email: [
      "البريد الإلكتروني",
      "البريد الالكتروني",
      "الإيميل",
      "الايميل",
      "email",
    ],
    job_title: ["المسمى الوظيفي", "الوظيفة", "job_title", "title"],
  };
  const headers = (matrix[0] || []).map(normalizedHeader);
  const index = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      headers.findIndex((h) => names.map(normalizedHeader).includes(h)),
    ]),
  ) as Record<keyof typeof aliases, number>;
  if (index.full_name < 0 || index.email < 0)
    throw new Error(
      "يجب أن يحتوي الصف الأول على عمودي الاسم الكامل والبريد الإلكتروني.",
    );
  const present = new Set(existingEmails.map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows: EmployeeImportRow[] = [];
  matrix.slice(1).forEach((cells, i) => {
    if (!cells.some((cell) => cell.trim())) return;
    const full_name = (cells[index.full_name] || "").trim();
    const email = (cells[index.email] || "").trim().toLowerCase();
    const job_title = (cells[index.job_title] || "").trim();
    const problems: string[] = [];
    if (full_name.length < 2 || full_name.length > 150)
      problems.push("الاسم يجب أن يكون من 2 إلى 150 حرفًا");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      problems.push("البريد الإلكتروني غير صحيح");
    if (job_title.length > 200) problems.push("المسمى الوظيفي أطول من 200 حرف");
    if (seen.has(email)) problems.push("البريد مكرر في الملف");
    seen.add(email);
    rows.push({
      row: i + 2,
      full_name,
      email,
      job_title,
      error: problems.join("؛ "),
      existing: present.has(email),
    });
  });
  if (!rows.length) throw new Error("الورقة لا تحتوي على موظفين.");
  if (rows.length > 200)
    throw new Error("استورد 200 موظف كحد أقصى في المرة الواحدة.");
  return rows;
}
export async function readEmployees(file: File, existingEmails: string[]) {
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("اختر ملف Excel بصيغة XLSX.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("حجم ملف Excel يجب ألا يتجاوز 5 ميجابايت.");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet("بيانات الموظفين") || book.worksheets[0];
  if (!sheet) throw new Error("لا توجد ورقة بيانات في الملف.");
  const matrix: string[][] = [];
  // Deliberately inspect only the main employee sheet; never send other sheets.
  if (sheet.actualRowCount > 201)
    throw new Error("استورد 200 موظف كحد أقصى في المرة الواحدة.");
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let i = 1; i <= Math.min(sheet.columnCount, 50); i++)
      cells.push(row.getCell(i).text);
    matrix.push(cells);
  });
  return { sheet: sheet.name, rows: prepareEmployees(matrix, existingEmails) };
}
