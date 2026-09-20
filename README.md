# BBSA Blur

Extension يسوي pre-blur لكل النصوص والصور وحقول الإدخال ومؤشرات الخطورة (severity) في `bugbounty.sa`
قبل ما الصفحة ترسم، ولما تحط الماوس على أي عنصر يظهر محتواه، وتشيل الماوس يرجع blur.

## التثبيت (Chrome / Edge / Brave)

1. افتح `chrome://extensions`.
2. شغّل **Developer mode**.
3. اضغط **Load unpacked** واختر مجلد `bbsa-blur`.

## الاستخدام

- **hover mode** (الافتراضي): مرر الماوس على العنصر يظهر، تشيله يختفي.
- **click mode**: أول ضغطة تظهر العنصر وتوقف أي navigation، الضغطة الثانية ترجّعه blur. `Esc` يرجّع كل شي blur.
- `Alt + Shift + B` يشغّل/يطفي الـ blur بالكامل.
- أيقونة الـ extension فيها: شدة الـ blur، وضع الإظهار، وتشغيل/إيقاف blur الصور وحقول الإدخال وألوان الخطورة، وتغطية الصفحة أثناء التحميل.

## توسيعه لمواقع ثانية

في `manifest.json` زد الدومين في `host_permissions` وفي `content_scripts[0].matches`:

```json
"matches": ["https://bugbounty.sa/*", "https://*.bugbounty.sa/*", "https://bugcrowd.com/*"]
```

## ملاحظات تقنية

- **الـ curtain**: `body` كامل يظل مغطى (blur قوي + grayscale) من `document_start` ولين: الـ `readyState` يجهز + ما فيه أي fetch/XHR شغال + الـ DOM يسكت 180ms. بعدها يصير مسح كامل، وينشال الغطاء بعد frame‑ين. سقف 6 ثواني عشان ما تعلق الصفحة.
- **تتبّع الـ API**: `inject.js` يشتغل في الـ MAIN world ويلف `fetch` و`XMLHttpRequest.send` ويعدّ الطلبات الشغالة في `data-bbsa-inflight` على `<html>`، وكمان يلف `pushState`/`replaceState` ويطلق event `bbsa:nav` — فأول ما تفتح ريبورت يرجع الغطاء قبل ما ينحط المحتوى.
- **ما فيه flash**: ما فيه `transition` على تطبيق الـ blur إطلاقاً (الـ transition القديم كان يسوي fade من واضح إلى blur = frames مقروءة)، والـ transition الوحيد موجود على الـ hover reveal فقط. والـ `MutationObserver` يصنّف العناصر الجديدة synchronously جوّا الـ microtask، قبل الـ paint.
- **ألوان الخطورة**: الـ blur ما يخفي اللون (بار أحمر = High)، فينضاف `grayscale(1)` فوق الـ blur. العناصر الملونة بدون نص (bars, dots, chips) تتصاد بالـ class names (`severity`, `priority`, `badge`, `progress`, `status`...) وبفحص `backgroundColor` للعناصر الـ leaf المشبعة لوناً.
- الـ blur مربوط بـ data attributes على `<html>`، فالتبديل ما يحتاج إعادة مسح للـ DOM.
- ما يتم عمل nesting للـ blur: لو العنصر الأب متبلور، أبناؤه ما ينبلورون مرة ثانية (عشان الـ filter ما يتراكم).
- `MutationObserver` يمسك المحتوى اللي يجي من SPA/AJAX ويطبق عليه الـ blur تلقائياً.
- `filter: blur()` ينشئ containing block جديد، فلو عنصر `position: fixed` انبلور بيتأثر تموضعه؛ نادر لكن انتبه له.
