import { describe, it, expect } from "vitest";
import {
  conferenceDays,
  dayKey,
  exhibitionStatus,
  normalizeQr,
  visitSchema,
  emptyVisit,
  csvText,
  safeCell,
  validateFile,
} from "../src/domain";
describe("قواعد تسجيل الزيارة", () => {
  it("يقبل بيانات التواصل الصحيحة ويرفض القيم الناقصة", () => {
    expect(visitSchema.safeParse(emptyVisit).success).toBe(false);
    expect(
      visitSchema.safeParse({
        ...emptyVisit,
        contact_name: "مسؤول الجهة",
        phone: "+966501234567",
        business_activity: "خدمات تقنية",
      }).success,
    ).toBe(true);
  });
  it("يرفض البريد والرقم والتقييم غير الصحيح", () => {
    const base = {
      ...emptyVisit,
      contact_name: "مسؤول",
      phone: "0501234567",
      business_activity: "تقنية",
    };
    for (const bad of [{ email: "invalid" }, { phone: "abc" }, { rating: 6 }])
      expect(visitSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  });
  it("يحافظ على المحتوى الأصلي للرموز المختلفة", () => {
    for (const v of ["https://example.com/A?q=1#b", "معرض ١٢", "CODE-001"])
      expect(normalizeQr(" " + v + "\n")).toBe(v);
  });
  it("يستخدم يوم الرياض عند عبور منتصف الليل", () => {
    expect(dayKey("2026-11-07T22:30:00Z")).toBe("2026-11-08");
  });
  it("يسمح بأيام الأحد إلى الأربعاء فقط", () => {
    expect(conferenceDays("2026-11-08", "2026-11-14")).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
    ]);
  });
  it("لا يعرض الحجز المنتهي باعتباره فعالًا", () => {
    const ex = { id: "e", visit_round: 1 };
    expect(
      exhibitionStatus(
        ex,
        [],
        [{ id: "r", exhibition_id: "e", expires_at: "2026-01-01" }],
        Date.parse("2026-02-01"),
      ),
    ).toBe("لم تتم الزيارة");
  });
  it("يفصل بين الزيارة السابقة والجولة الإضافية", () => {
    const ex = { id: "e", visit_round: 2 };
    expect(
      exhibitionStatus(
        ex,
        [{ id: "v", exhibition_id: "e", visit_round: 1 }],
        [],
      ),
    ).toBe("لم تتم الزيارة");
    expect(
      exhibitionStatus(
        { ...ex, visit_round: 1 },
        [{ id: "v", exhibition_id: "e", visit_round: 1 }],
        [],
      ),
    ).toBe("تمت الزيارة");
  });
  it("يمنع حقن صيغ الجداول ويحافظ على العربية والاقتباسات", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvText([{ الاسم: 'شركة "أ"', الهاتف: "+966" }])).toContain(
      '"شركة ""أ"""',
    );
    expect(csvText([{ الاسم: "أ" }]).charCodeAt(0)).toBe(0xfeff);
  });
  it("يرفض الملفات التنفيذية والتواقيع المزورة", async () => {
    await expect(
      validateFile(
        new File(["MZ"], "x.exe", { type: "application/octet-stream" }),
      ),
    ).rejects.toThrow();
    await expect(
      validateFile(new File(["not pdf"], "x.pdf", { type: "application/pdf" })),
    ).rejects.toThrow();
    await expect(
      validateFile(
        new File(["%PDF-1.7"], "x.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toBeUndefined();
  });
  it("يرفض الملف الفارغ والكبير", async () => {
    await expect(
      validateFile(new File([], "x.pdf", { type: "application/pdf" })),
    ).rejects.toThrow();
    await expect(
      validateFile(
        new File([new Uint8Array(10485761)], "x.pdf", {
          type: "application/pdf",
        }),
      ),
    ).rejects.toThrow();
  });
});
