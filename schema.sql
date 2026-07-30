-- =========================================================
-- PALLET CHECKER — Supabase schema (thay thế Google Sheets)
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- =========================================================

-- 1. BẢNG employees (thay sheet "danhsachnhanvien")
-- ---------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password text not null,       -- LƯU Ý: đang lưu plaintext theo yêu cầu, xem README về rủi ro bảo mật
  role text default 'N/A',      -- "chức danh"
  note text,                    -- "ghi chú"
  created_at timestamptz default now()
);

create index if not exists idx_employees_email on employees (lower(email));

-- 2. BẢNG locations (thay sheet "locationdich")
-- ---------------------------------------------------------
create table if not exists locations (
  id text primary key,          -- code đầy đủ, vd "80001010_Z1_R1_D2_C1_T2_H1"
  name text not null,           -- vd "Rack Thường"
  icon text default 'location_on',
  color text default '#f97316',
  created_at timestamptz default now()
);

-- 3. BẢNG transfer_history (thay sheet "lichsuluanchuyen")
-- ---------------------------------------------------------
create table if not exists transfer_history (
  id bigint generated always as identity primary key,
  ticket_id text not null unique,
  pallet_id text not null,
  dest_id text references locations(id),
  dest_name text not null,
  performed_by_name text not null,
  status text not null default 'Chờ' check (status in ('Chờ', 'Hoàn tất')),
  created_at timestamptz default now()
);

create index if not exists idx_transfer_ticket on transfer_history (ticket_id);
create index if not exists idx_transfer_status on transfer_history (status);
create index if not exists idx_transfer_dest on transfer_history (dest_id);

create sequence if not exists ticket_seq;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table employees enable row level security;
alter table locations enable row level security;
alter table transfer_history enable row level security;

-- locations: đọc công khai (cần cho danh sách vị trí đích)
drop policy if exists "public read locations" on locations;
create policy "public read locations"
  on locations for select using (true);

-- transfer_history: đọc công khai (cần cho lịch sử luân chuyển)
drop policy if exists "public read transfer_history" on transfer_history;
create policy "public read transfer_history"
  on transfer_history for select using (true);

-- employees: KHÔNG tạo policy nào -> chặn hoàn toàn SELECT/INSERT/UPDATE
-- trực tiếp từ client. Chỉ truy cập qua function login() (security definer) bên dưới.

-- =========================================================
-- FUNCTIONS (thay các hàm trong Code.gs)
-- =========================================================

-- Thay checkLogin()
create or replace function login(p_email text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp employees%rowtype;
begin
  select * into v_emp from employees
  where lower(email) = lower(trim(p_email))
    and password = p_password
  limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'Email hoặc mật khẩu không đúng!');
  end if;

  return json_build_object(
    'success', true,
    'user', json_build_object(
      'name', v_emp.name,
      'email', v_emp.email,
      'role', v_emp.role
    )
  );
end;
$$;

grant execute on function login(text, text) to anon;

-- Thay savePalletAction()
create or replace function save_pallet_action(
  p_pallet_id text,
  p_dest_id text,
  p_dest_name text,
  p_user_name text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id text;
begin
  v_ticket_id := 'LCNB' || to_char(now(), 'DDMMYYYY') || lpad(nextval('ticket_seq')::text, 5, '0');

  insert into transfer_history (ticket_id, pallet_id, dest_id, dest_name, performed_by_name, status)
  values (v_ticket_id, p_pallet_id, p_dest_id, p_dest_name, p_user_name, 'Chờ');

  return json_build_object('success', true, 'message', 'Đã lưu thành công: ' || v_ticket_id, 'ticketId', v_ticket_id);
exception when others then
  return json_build_object('success', false, 'message', 'Lỗi khi lưu dữ liệu: ' || sqlerrm);
end;
$$;

grant execute on function save_pallet_action(text, text, text, text) to anon;

-- Thay confirmTransferTicket()
create or replace function confirm_transfer_ticket(p_ticket_id text, p_staff_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update transfer_history
  set status = 'Hoàn tất',
      performed_by_name = p_staff_name
  where ticket_id = p_ticket_id;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return json_build_object('success', false, 'message', 'Không tìm thấy mã phiếu: ' || p_ticket_id);
  end if;

  return json_build_object('success', true, 'message', 'Đã hoàn tất phiếu ' || p_ticket_id);
end;
$$;

grant execute on function confirm_transfer_ticket(text, text) to anon;

-- =========================================================
-- SEED DATA
-- =========================================================
insert into employees (name, email, password, role) values
('Nguyễn Tiến Hưng', 'HungNT91@fpt.com', '123456', 'Thủ Kho Nhập'),
('Trần Ngọc Ý', 'ytn4@fpt.com', '123456', 'Trưởng Nhóm Nhập Hàng'),
('Đỗ Ngọc Thắng', 'thangdn7@fpt.com', '123456', 'Trưởng Nhóm Nhập Hàng'),
('Tạ Minh Lực', 'luctm3@fpt.com', '123456', 'Nhân Viên Điều Phối'),
('Lê Cao Tuấn Khoa', 'khoalct@fpt.com', '123456', 'Nhân Viên Điều Phối'),
('Nguyễn Hoàng Tuấn Vũ', 'vunht4@fpt.com', '123456', 'Nhân Viên Điều Phối'),
('Nguyễn Phạm Ngọc Yến', 'yennpn@fpt.com', '123456', 'Trưởng Nhóm Nhập Hàng'),
('Lê Hoàng Phát Đạt', 'datlhp@fpt.com', '123456', 'Trưởng Nhóm Nhập Hàng'),
('Đoàn Thị Bích Xinh', 'xinhdtb2@fpt.com', '123456', 'Nhân Viên In Tem'),
('Trần Tấn Khang', 'khangtt5@fpt.com', '123456', 'Trưởng Nhóm Điều Phối'),
('Lưu Thạch Long', 'longlt46@fpt.com', '123456', 'NV Lái Xe Nâng')
on conflict (email) do nothing;

insert into locations (id, name) values
('80001010_Z1_R1_D2_C1_T2_H1', 'Rack Thường'),
('80001030_Z1_R1_D1_C1_T2_H1', 'Rack Cắt Liều'),
('80001010_Z3_R1_D10_C1_T1_H1', 'Tiền Soạn 1 - Kho 2 T4'),
('80001010_Z2_R1_D8_C2_T1_H1', 'Tiền Soạn 1 - Kho 1 T4'),
('80001010_Z3_R1_D1_C1_T1_H1', 'Tiền Soạn 1 - Kho 2')
on conflict (id) do nothing;
