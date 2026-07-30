# Pallet Checker — Static + Supabase

Bản chuyển đổi từ Google Apps Script sang site tĩnh (GitHub Pages) + Supabase làm database.

## Cấu trúc file

```
index.html          # Giao diện (đã bỏ template GAS, link CSS/JS ngoài)
style.css           # Toàn bộ CSS (trích từ style.html cũ)
app.js              # Toàn bộ logic JS (đã thay google.script.run -> supabase-js)
supabase/schema.sql # Tables + RLS + Functions + Seed data
```

## Bước 1 — Chạy schema trên Supabase

1. Vào Supabase Dashboard → project của bạn → **SQL Editor**.
2. Mở file `supabase/schema.sql`, copy toàn bộ, paste vào SQL Editor, bấm **Run**.
3. Kiểm tra lại trong **Table Editor**: phải thấy 3 bảng `employees`, `locations`, `transfer_history` với dữ liệu mẫu đã có sẵn.

## Bước 2 — Điền thông tin kết nối vào `app.js`

Mở `app.js`, sửa đầu file:

```js
const supabase = window.supabase.createClient(
    'YOUR_PROJECT_URL',   // Project Settings > API > Project URL
    'YOUR_ANON_KEY'       // Project Settings > API > anon public key
);
```

⚠️ Đây là site tĩnh nên `anon key` sẽ hiển thị công khai trong code — đây là điều **bình thường và dự kiến** với Supabase (anon key được thiết kế để public), miễn là RLS đã bật đúng như trong `schema.sql` (bảng `employees` không có policy nào nên không thể đọc/ghi trực tiếp từ client).

## Bước 3 — Đẩy lên GitHub Pages

```bash
git add index.html style.css app.js supabase/
git commit -m "Migrate from Apps Script to static + Supabase"
git push
```

Vào repo trên GitHub → **Settings → Pages** → Source chọn nhánh (vd `main`) và thư mục `/root`. Sau vài phút site sẽ có ở `https://<username>.github.io/<repo>/`.

## Lưu ý bảo mật (đã thống nhất giữ nguyên theo yêu cầu)

- Mật khẩu nhân viên đang lưu **plaintext** trong bảng `employees`, đúng như hành vi gốc của `checkLogin()` trong Apps Script. Bảng này bị khoá hoàn toàn bằng RLS (không có policy select/insert/update nào), chỉ truy cập được qua function `login()` chạy với quyền `security definer`, nên anon key không thể đọc trực tiếp mật khẩu từ bảng — nhưng bản thân cơ chế so sánh plaintext vẫn yếu hơn so với Supabase Auth hoặc hash bcrypt. Khi có điều kiện, nên nâng cấp.
- Camera QR (`html5-qrcode`) chỉ hoạt động trên **HTTPS** — GitHub Pages mặc định HTTPS nên không cần cấu hình thêm.

## Việc còn thiếu / cần bổ sung sau

- Danh sách `locations` hiện chỉ có 5 dòng (toàn bộ dữ liệu bạn cung cấp). Khi có thêm vị trí mới, thêm trực tiếp qua Table Editor của Supabase hoặc chạy thêm câu `insert into locations (...) values (...)`.
- Nhân viên mới: thêm qua Table Editor Supabase (không nên cho tự đăng ký vì bảng bị khoá RLS).
