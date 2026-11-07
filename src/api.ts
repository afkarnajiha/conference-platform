import { createClient } from "@supabase/supabase-js";
import type { Row } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const inviteSession = window.location.hash.includes("type=invite");
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function client() {
  if (!supabase) throw new Error("يلزم ربط قاعدة البيانات أولًا.");
  return supabase;
}
const messages: Record<string, string> = {
  FORBIDDEN: "ليس لديك صلاحية لتنفيذ هذه العملية، أو تم تعطيل حسابك.",
  NOT_FOUND: "السجل المطلوب غير موجود.",
  RESERVATION_EXPIRED: "انتهى الحجز أو تم تحريره. أعد بدء الزيارة قبل الحفظ.",
  LINK_REQUIRES_REVIEW: "ربط رمز بمعرض موجود يتطلب مراجعة المشرف.",
  INVALID_DAY: "اختر يومًا بين الأحد والأربعاء ضمن فترة المؤتمر.",
  INVALID_FILES: "تعذر اعتماد المرفقات. تحقق من الملفات وأعد رفعها.",
  REASON_REQUIRED: "أدخل سببًا واضحًا لا يقل عن خمسة أحرف.",
  ASSIGNMENTS_OUTSIDE_DATES:
    "توجد مشاركات خارج الفترة الجديدة. عدّل التوزيع أولًا.",
};
export function errorText(e: unknown) {
  const x = e as { message?: string; code?: string };
  for (const [code, msg] of Object.entries(messages))
    if (x.message?.includes(code)) return msg;
  if (x.code === "23505")
    return "السجل موجود بالفعل. حدّث البيانات وتحقق من عدم التكرار.";
  if (x.code === "23514" || x.code === "23502")
    return "تحقق من الحقول المطلوبة وصحة البيانات.";
  if (x.message?.includes("Invalid login"))
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (x.message?.includes("JWT") || x.code === "PGRST301")
    return "انتهت صلاحية الجلسة. سجّل الدخول مجددًا.";
  if (x.message?.includes("fetch") || x.message?.includes("network"))
    return "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.";
  if (e instanceof Error && !("code" in e) && /[\u0600-\u06ff]/.test(e.message))
    return e.message;
  return "تعذر إتمام العملية. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.";
}
export async function rpc<T = any>(
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function allRows(table: string) {
  const result: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client()
      .from(table)
      .select("*")
      .order(table === "visit_reservations" ? "exhibition_id" : "id")
      .range(from, from + 999);
    if (error) throw error;
    result.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return result;
}
export async function accountAction(body: Record<string, unknown>) {
  const { data, error } = await client().functions.invoke("manage-account", {
    body,
  });
  if (error) {
    const response = (error as any).context;
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
