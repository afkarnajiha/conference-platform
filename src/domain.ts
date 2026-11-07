import { z } from "zod";
z.setErrorMap(() => ({
  message: "تحقق من صحة القيمة وطول النص والحقول المطلوبة.",
}));
export type Role = "admin" | "supervisor" | "employee";
export type Row = { id: string; [key: string]: any };
export const roleNames: Record<Role, string> = {
  admin: "المدير الرئيسي",
  supervisor: "مشرف",
  employee: "موظف",
};
export const priorities = ["مرتفعة", "متوسطة", "منخفضة"];
export const visitSchema = z.object({
  contact_name: z.string().trim().min(2, "أدخل اسم المسؤول").max(200),
  job_title: z.string().max(200),
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "أدخل رقم تواصل صحيحًا من 7 إلى 20 محرفًا"),
  email: z.union([
    z.literal(""),
    z.string().email("أدخل بريدًا إلكترونيًا صحيحًا"),
  ]),
  business_activity: z
    .string()
    .trim()
    .min(2, "أدخل طبيعة نشاط الجهة")
    .max(4000),
  services: z.string().max(4000),
  products: z.string().max(4000),
  collaboration: z.string().max(4000),
  opportunity: z
    .string()
    .max(4000)
    .refine((v) => !v.trim() || v.trim().length >= 3, "أدخل وصفًا أوضح للفرصة"),
  importance: z.enum(["مرتفعة", "متوسطة", "منخفضة"]),
  rating: z.coerce.number().int().min(1).max(5),
  interest: z.enum(["مرتفع", "متوسط", "منخفض"]),
  priority: z.enum(["مرتفعة", "متوسطة", "منخفضة"]),
  notes: z.string().max(4000),
});
export type VisitInput = z.infer<typeof visitSchema>;
export const emptyVisit: VisitInput = {
  contact_name: "",
  job_title: "",
  phone: "",
  email: "",
  business_activity: "",
  services: "",
  products: "",
  collaboration: "",
  opportunity: "",
  importance: "متوسطة",
  rating: 3,
  interest: "متوسط",
  priority: "متوسطة",
  notes: "",
};
export function saDate(value: string, onlyDate = false) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    calendar: "gregory",
    dateStyle: "medium",
    ...(!onlyDate ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value.length === 10 ? value + "T12:00:00+03:00" : value));
}
export function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function conferenceDays(start: string, end: string) {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00Z"),
    last = new Date(end + "T12:00:00Z");
  for (let i = 0; d <= last && i < 366; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() <= 3) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
export function normalizeQr(value: string) {
  return value.trim();
}
export function exhibitionStatus(
  ex: Row,
  visits: Row[],
  reservations: Row[],
  now = Date.now(),
) {
  if (ex.needs_review) return "يحتاج إلى مراجعة";
  if (
    visits.some(
      (v) => v.exhibition_id === ex.id && v.visit_round === ex.visit_round,
    )
  )
    return "تمت الزيارة";
  if (
    reservations.some(
      (r) => r.exhibition_id === ex.id && Date.parse(r.expires_at) > now,
    )
  )
    return "قيد التسجيل";
  return "لم تتم الزيارة";
}
export const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export async function validateFile(file: File) {
  if (!mimeExtensions[file.type])
    throw new Error(
      "نوع الملف غير مسموح. استخدم صورة JPG أو PNG أو WebP أو ملف PDF.",
    );
  if (file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error(
      "حجم الملف يجب أن يكون أكبر من صفر وألا يتجاوز 10 ميجابايت.",
    );
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const s = new TextDecoder().decode(b);
  const valid =
    file.type === "application/pdf"
      ? s.startsWith("%PDF-")
      : file.type === "image/png"
        ? b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
        : file.type === "image/jpeg"
          ? b[0] === 255 && b[1] === 216 && b[2] === 255
          : s.startsWith("RIFF") && s.slice(8, 12) === "WEBP";
  if (!valid) throw new Error("محتوى الملف لا يطابق نوعه. اختر ملفًا صالحًا.");
}
export function safeCell(v: unknown) {
  const s = String(v ?? "");
  return /^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s;
}
export function csvText(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return (
    "\uFEFF" +
    [headers, ...rows.map((r) => headers.map((k) => safeCell(r[k])))]
      .map((row) =>
        row.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n")
  );
}
