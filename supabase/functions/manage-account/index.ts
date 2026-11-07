import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigin = Deno.env.get("APP_ORIGIN") || "";
const redirectTo = Deno.env.get("APP_REDIRECT_URL") || allowedOrigin;
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
Deno.serve(async (req: Request) => {
  if (!allowedOrigin)
    return reply(503, { error: "لم يتم إعداد عنوان المنصة على الخادم." });
  if (req.headers.get("Origin") !== allowedOrigin)
    return reply(403, { error: "الطلب غير مسموح." });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return reply(405, { error: "طريقة الطلب غير مسموحة." });
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return reply(401, { error: "يلزم تسجيل الدخول." });
    const { data: auth, error: authError } = await service.auth.getUser(jwt);
    if (authError || !auth.user)
      return reply(401, { error: "انتهت صلاحية الجلسة. سجّل الدخول مجددًا." });
    const { data: actor } = await service
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .single();
    if (
      !actor?.active ||
      !(
        actor.role === "admin" ||
        (actor.role === "supervisor" && actor.manage_employees)
      )
    )
      return reply(403, { error: "لا تملك صلاحية إدارة الحسابات." });
    const body = await req.json();
    if (!["create", "update", "reset", "delete"].includes(body.action))
      return reply(400, { error: "العملية المطلوبة غير صحيحة." });
    let target: any = null;
    if (body.action !== "create") {
      if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
        return reply(400, { error: "معرف الحساب غير صحيح." });
      const { data, error } = await service
        .from("profiles")
        .select("*")
        .eq("id", body.id)
        .single();
      if (error || !data) return reply(404, { error: "الحساب غير موجود." });
      target = data;
      if (actor.role !== "admin" && target.role !== "employee")
        return reply(403, {
          error: "لا يمكنك إدارة صلاحيات المشرفين أو المدير.",
        });
    }
    if (body.action === "reset") {
      const { error } = await service.auth.resetPasswordForEmail(target.email, {
        redirectTo,
      });
      if (error) throw error;
      const { error: logError } = await service
        .from("activity_logs")
        .insert({
          actor_id: actor.id,
          action: "إرسال رابط استعادة كلمة المرور",
          entity_id: target.id,
        });
      if (logError) throw logError;
      return reply(200, { ok: true });
    }
    if (body.action === "delete") {
      const { error } = await service.rpc("manage_profile", {
        p_actor: actor.id,
        p_action: "delete",
        p_id: target.id,
      });
      if (error) throw error;
      const { error: authDeleteError } = await service.auth.admin.deleteUser(
        target.id,
      );
      if (authDeleteError) throw new Error("PROFILE_REMOVED_AUTH_REMAINS");
      return reply(200, { ok: true });
    }
    if (
      typeof body.full_name !== "string" ||
      body.full_name.trim().length < 2 ||
      body.full_name.length > 150 ||
      typeof body.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(body.email) ||
      !["admin", "supervisor", "employee"].includes(body.role) ||
      typeof body.active !== "boolean" ||
      typeof body.manage_employees !== "boolean" ||
      typeof body.job_title !== "string" ||
      body.job_title.length > 200
    )
      return reply(400, {
        error: "تحقق من الاسم والبريد والصلاحية والمسمى الوظيفي.",
      });
    if (
      actor.role !== "admin" &&
      (body.role !== "employee" || body.manage_employees)
    )
      return reply(403, { error: "لا يمكنك منح صلاحيات إدارية." });
    let id = target?.id,
      created = false;
    if (body.action === "create") {
      const { data, error } = await service.auth.admin.inviteUserByEmail(
        body.email.trim().toLowerCase(),
        { redirectTo },
      );
      if (error) throw error;
      id = data.user.id;
      created = true;
    }
    const { error } = await service.rpc("manage_profile", {
      p_actor: actor.id,
      p_action: body.action,
      p_id: id,
      p_name: body.full_name,
      p_email: body.email,
      p_role: body.role,
      p_active: body.active,
      p_manage: body.manage_employees,
      p_title: body.job_title,
    });
    if (error) {
      if (created) await service.auth.admin.deleteUser(id);
      throw error;
    }
    return reply(200, { ok: true, id });
  } catch (e) {
    const error = e as { message?: string; code?: string };
    let message = "تعذر تنفيذ العملية. تحقق من الإعدادات ثم حاول مجددًا.";
    if (error.code === "23503")
      message =
        "الحساب مرتبط بسجلات سابقة. استخدم تعطيل الحساب للحفاظ على التاريخ.";
    if (error.message?.includes("LAST_ADMIN"))
      message = "لا يمكن تعطيل أو إزالة صلاحية آخر مدير نشط.";
    if (error.message?.includes("FORBIDDEN"))
      message = "لا تملك صلاحية تنفيذ هذا التغيير.";
    if (error.message?.includes("already") || error.code === "23505")
      message = "البريد الإلكتروني مسجل بالفعل.";
    if (error.message?.includes("PROFILE_REMOVED_AUTH_REMAINS"))
      message =
        "أزيل وصول الحساب، لكن حذف هوية الدخول يحتاج مراجعة المسؤول في Supabase.";
    return reply(400, { error: message });
  }
});
