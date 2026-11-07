# قوالب البريد العربية

انسخ محتوى كل قالب إلى إعدادات Supabase Auth Email Templates المقابلة. هذه القوالب لا تُطبق تلقائيًا من كود الواجهة.

## دعوة موظف — Invite user

العنوان: دعوتك إلى منصة الأفكار الناجحة التجارية

```html
<div dir="rtl" lang="ar" style="font-family:Arial,sans-serif;background:#f1efe3;color:#12110d;padding:32px">
  <h2>مرحبًا بك في فريق الأفكار الناجحة التجارية</h2>
  <p>تمت دعوتك إلى منصة إدارة المعارض والمؤتمرات. استخدم الرابط التالي لتفعيل حسابك وتعيين كلمة المرور.</p>
  <p><a href="{{ .ConfirmationURL }}" style="background:#c4a46a;color:#12110d;padding:12px 20px;display:inline-block">تفعيل الحساب</a></p>
  <p>إذا لم تكن تتوقع هذه الدعوة، تواصل مع مسؤول الشركة.</p>
</div>
```

## استعادة كلمة المرور — Reset password

العنوان: إعادة تعيين كلمة مرور منصة الأفكار الناجحة

```html
<div dir="rtl" lang="ar" style="font-family:Arial,sans-serif;background:#f1efe3;color:#12110d;padding:32px">
  <h2>إعادة تعيين كلمة المرور</h2>
  <p>ورد طلب لتعيين كلمة مرور جديدة لحسابك.</p>
  <p><a href="{{ .ConfirmationURL }}" style="background:#c4a46a;color:#12110d;padding:12px 20px;display:inline-block">تعيين كلمة مرور جديدة</a></p>
  <p>إذا لم تطلب هذا التغيير، تجاهل الرسالة ولا تشارك رابطها.</p>
</div>
```
