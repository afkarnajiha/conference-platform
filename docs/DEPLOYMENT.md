# دليل الربط والنشر — للمرحلة التالية

لم تنفذ هذه الخطوات على حسابات الشركة بعد. لا ترسل مفاتيح الإدارة في المحادثات ولا تضعها في GitHub.

## 1. رفع المصدر إلى GitHub

أنشئ مستودعًا باسم تختاره، ثم ضع محتويات `conference-platform` في جذره. استخدم GitHub Desktop أو Git:

```sh
git init
git add .
git commit -m "Build Arabic conference management platform"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

استبدل OWNER وREPOSITORY. `.gitignore` يستبعد ملفات البيئة والتبعيات والناتج. لا تضف أسرارًا حتى في مستودع خاص. لا يحتاج رفع الكود إلى اتصال Supabase؛ أول نشر دون متغيرات سيعرض شاشة الإعداد.

## 2. قاعدة بيانات Supabase

أنشئ مشروع الشركة. من SQL Editor طبّق هذين الملفين **مرة واحدة بالترتيب** على مشروع جديد:

1. `supabase/migrations/202611070001_platform.sql`
2. `supabase/migrations/202611070002_accounts.sql`

أو استخدم Supabase CLI وتدفق الترحيلات:

```sh
supabase login
supabase link --project-ref PROJECT_REF
supabase db push
```

الترحيلات تنشئ الحاوية الخاصة `visit-files` وتحدد MIME والحجم، وتضيف جداول التطبيق إلى `supabase_realtime` إن كانت publication موجودة. لا تغيّر الحاوية إلى عامة.

## 3. الحساب الإداري الأول

عطّل التسجيل العام للمستخدمين في إعدادات Auth. أنشئ مستخدم المدير الأول من لوحة Supabase Auth، باستخدام بريده الحقيقي وكلمة مرور يختارها المسؤول. بعد ظهور المستخدم، طبّق SQL التالي في SQL Editor مع استبدال البريد والاسم:

```sql
insert into public.profiles(id, full_name, email, role, active)
select id, 'اسم المدير الحقيقي', email, 'admin', true
from auth.users where lower(email) = lower('ADMIN_EMAIL_HERE');

insert into public.employees(id, job_title)
select id, 'المدير الرئيسي'
from public.profiles where lower(email) = lower('ADMIN_EMAIL_HERE');
```

تحقق أن صفًا واحدًا أُنشئ. لا تستخدم trigger يمنح دور المدير لكل مسجل. بعد ذلك تدار الحسابات من داخل المنصة.

## 4. روابط Auth والبريد

في Auth URL Configuration:

- Site URL: `https://OWNER.github.io/REPOSITORY/`
- أضف الرابط نفسه إلى Redirect URLs، وأضف `http://localhost:5173/` عند الحاجة إلى تطوير محلي.
- لا تضف مسارات hash في Redirect URLs؛ التطبيق يعالج روابط استعادة كلمة المرور قبل التنقل.
- اضبط قوالب الدعوة والاستعادة بالعربية. يمكن استخدام النصوص في `docs/EMAIL-TEMPLATES.md`.
- اضبط إرسال البريد الذي تسمح به إعدادات مشروع الشركة. وصول الدعوات ورسائل الاستعادة يجب اختباره؛ حدود البريد الافتراضي لا تعني وصولًا مضمونًا لجميع موظفي الشركة.

## 5. وظيفة إدارة الحسابات

انشر `manage-account` عبر Supabase CLI أو محرر Edge Functions. لا يحتاج المتصفح إلى مفاتيح إدارة.

```sh
supabase functions deploy manage-account --no-verify-jwt
supabase secrets set APP_ORIGIN=https://OWNER.github.io
supabase secrets set APP_REDIRECT_URL=https://OWNER.github.io/REPOSITORY/
```

`APP_ORIGIN` هو الأصل فقط دون مسار؛ `APP_REDIRECT_URL` يشمل مسار المستودع. لتطوير محلي استخدم أصل المنصة المحلي في مشروع اختبار منفصل. الوظيفة تتحقق بنفسها من JWT باستخدام `auth.getUser`، ثم تقرأ صلاحيات المستخدم النشط من قاعدة البيانات. تعطيل `verify_jwt` في بوابة الوظيفة لا يلغي هذا التحقق.

`SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` تقرؤهما الوظيفة من أسرار بيئة Supabase. **لا تنسخ Service Role إلى متغيرات VITE أو إلى GitHub.** وظيفة SQL الخاصة بتعديل الحسابات ممنوحة لـservice_role وحده، وتعيد التحقق من صلاحية المسؤول وتحمي آخر مدير نشط.

## 6. متغيرات الواجهة

محليًا، أنشئ `.env` من `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_BASE_PATH=/
```

المفتاح العام مصمم للاستخدام في المتصفح، والأمان يعتمد على RLS. لا تضع مفتاحًا يبدأ بـ`sb_secret_` ولا Service Role في هذه المتغيرات.

## 7. GitHub Pages

من Settings → Pages اختر GitHub Actions. في Settings → Secrets and variables → Actions أضف:

| الاسم | النوع | القيمة |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Secret | رابط المشروع |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Secret | المفتاح العام فقط |
| `VITE_BASE_PATH` | Variable | `/REPOSITORY/` أو `/` لمستودع OWNER.github.io أو نطاق خاص |

عند غياب `VITE_BASE_PATH` يستخدم Workflow اسم المستودع تلقائيًا. انشر من فرع `main`. يعمل Workflow على فحص الوحدات وSQL والبناء قبل نشر `dist`. جميع الصفحات تستخدم روابط مثل `/#/visits`، فلا يحتاج تحديث الصفحة إلى إعداد إعادة كتابة مسارات.

بعد تعديل Secrets أعد تشغيل Workflow؛ متغيرات Vite تُضمّن أثناء البناء وليست إعدادات حية.

## 8. اختبار القبول قبل الاستخدام

استخدم مؤتمر اختبار واضحًا، ومديرًا ومشرفًا وموظفين اثنين، ثم نفّذ قائمة `QA.md`. لا تعتمد الإنتاج قبل نجاح المصادقة وRLS والملفات والتزامن.

لاختبار طلبين في اللحظة نفسها، عيّن متغيرات اختبار محلية غير متتبعة:

`TEST_SUPABASE_URL`, `TEST_PUBLIC_KEY`, `TEST_EMPLOYEE_A_JWT`, `TEST_EMPLOYEE_B_JWT`, `TEST_EXHIBITION_ID`.

```sh
npm run test:concurrency
```

يجب أن يكون المعرض غير مزور وغير محجوز ومعتمدًا داخل مؤتمر الاختبار. الاختبار يطلق طلبين بالتوازي ويتحقق من فائز واحد ثم يحرر الحجز الذي أنشأه. لا تستخدم JWT في سجل الأوامر أو مستودع Git.

## 9. التحديث والنسخ الاحتياطي

قبل تغييرات قاعدة البيانات خذ نسخة احتياطية مناسبة لإعدادات مشروعك. أضف ترحيلًا جديدًا بدل إعادة تطبيق ملفات الإنشاء. شغّل الاختبارات ثم ارفع المصدر؛ ينشر GitHub Actions الواجهة. انشر Edge Function منفصلة عند تعديلها. احتفظ بملف `package-lock.json` لتكرار البناء، واستخدم `npm ci`.
