-- ============================================================================
-- Skema Database PostgreSQL & Supabase Auth Trigger untuk Aplikasi Do-Siti
-- Jalankan seluruh skrip ini di SQL Editor pada Dashboard Supabase Anda.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TABEL PROFIL PENGGUNA (terhubung 1:1 dengan auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. FUNGSI HELPER & TRIGGER OTOMATIS SAAT REGISTRASI (SIGN UP)
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Trigger SECURITY DEFINER untuk otomatis membuat baris di public.profiles
-- setiap kali pengguna baru mendaftar via supabase.auth.signUp().
-- Peran selalu dipaksa 'user' di level database agar tidak bisa dimanipulasi klien.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  extracted_name text;
  extracted_phone text;
begin
  extracted_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, 'Pengguna'), '@', 1)
  );

  extracted_phone := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');

  insert into public.profiles (id, full_name, email, role, phone)
  values (
    new.id,
    extracted_name,
    coalesce(new.email, ''),
    'user',
    extracted_phone
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = coalesce(excluded.phone, public.profiles.phone);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Fungsi SECURITY DEFINER untuk memeriksa apakah pengguna saat ini adalah Admin
-- tanpa memicu rekursi RLS pada tabel public.profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ============================================================================
-- 3. TABEL KATALOG MENU (Donat & Minuman) + SISTEM STOK & RESTOCK OTOMATIS
-- ============================================================================
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 3),
  category text not null check (category in ('Donat', 'Minuman')),
  price integer not null check (price > 0),
  stock integer not null default 0 check (stock >= 0),
  description text not null check (char_length(trim(description)) >= 10),
  image_url text not null,
  is_available boolean not null default true,
  highlight text,
  restock_available_at timestamptz,
  last_stock integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_items
  add column if not exists restock_available_at timestamptz;
alter table public.menu_items
  add column if not exists last_stock integer;

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row
  execute function public.set_updated_at();

create or replace function public.generate_different_restock_amount(
  p_previous_stock integer,
  p_alt_previous integer default null
)
returns integer
language plpgsql
as $$
declare
  v_candidates integer[];
  v_idx integer;
begin
  select array_agg(n)
  into v_candidates
  from generate_series(8, 25) as n
  where n <> coalesce(p_previous_stock, -1)
    and n <> coalesce(p_alt_previous, -1);

  if v_candidates is null or array_length(v_candidates, 1) is null then
    return 12;
  end if;

  v_idx := 1 + floor(random() * array_length(v_candidates, 1))::integer;
  if v_idx > array_length(v_candidates, 1) then
    v_idx := array_length(v_candidates, 1);
  end if;
  return v_candidates[v_idx];
end;
$$;

create or replace function public.handle_menu_stock_state()
returns trigger
language plpgsql
as $$
begin
  if new.stock > 0 then
    new.restock_available_at := null;
    if tg_op = 'INSERT' or coalesce(old.stock, 0) = 0 or new.last_stock is null then
      new.last_stock := new.stock;
    end if;
  elsif new.stock = 0 and new.is_available = true then
    if tg_op = 'INSERT' then
      if new.restock_available_at is null then
        new.restock_available_at := now() + interval '5 minutes';
      end if;
    else
      if old.stock > 0 and new.last_stock is null then
        new.last_stock := old.stock;
      end if;
      if new.restock_available_at is null then
        new.restock_available_at := now() + interval '5 minutes';
      end if;
    end if;
  else
    new.restock_available_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_menu_items_stock_state on public.menu_items;
create trigger trg_menu_items_stock_state
  before insert or update on public.menu_items
  for each row
  execute function public.handle_menu_stock_state();

-- Sinkronisasi otomatis menu yang sudah melewati masa jeda restock 5 menit
create or replace function public.sync_expired_restocks()
returns setof public.menu_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.menu_items%rowtype;
  v_new_stock integer;
begin
  for v_row in
    select *
    from public.menu_items
    where stock = 0
      and is_available = true
      and restock_available_at is not null
      and restock_available_at <= now()
    for update skip locked
  loop
    v_new_stock := public.generate_different_restock_amount(v_row.last_stock, v_row.stock);

    update public.menu_items
    set stock = v_new_stock,
        last_stock = v_new_stock,
        restock_available_at = null,
        is_available = true,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;

    return next v_row;
  end loop;
  return;
end;
$$;

-- Fungsi transaksi pengurangan stok saat checkout (anti-minus & kunci baris atomik)
create or replace function public.process_checkout_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_menu public.menu_items%rowtype;
  v_new_stock integer;
  v_restocked integer;
  v_result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan untuk mengurangi stok pesanan.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Daftar item pesanan tidak boleh kosong.';
  end if;

  for v_entry in
    select
      (elem ->> 'menu_id')::uuid as menu_id,
      sum((elem ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'menu_id')::uuid
    order by (elem ->> 'menu_id')::uuid
  loop
    if v_entry.quantity is null or v_entry.quantity <= 0 then
      raise exception 'Jumlah pembelian minimal 1 porsi.';
    end if;

    select *
    into v_menu
    from public.menu_items
    where id = v_entry.menu_id
    for update;

    if not found then
      raise exception 'Salah satu menu yang dipilih tidak ditemukan.';
    end if;

    -- Jika jeda restock 5 menit sudah selesai, otomatis isi ulang stok dulu
    if v_menu.stock = 0 and v_menu.is_available = true and v_menu.restock_available_at is not null and v_menu.restock_available_at <= now() then
      v_restocked := public.generate_different_restock_amount(v_menu.last_stock, v_menu.stock);
      update public.menu_items
      set stock = v_restocked,
          last_stock = v_restocked,
          restock_available_at = null,
          updated_at = now()
      where id = v_menu.id
      returning * into v_menu;
    end if;

    if not v_menu.is_available then
      raise exception 'Menu "%" sedang tidak tersedia saat ini.', v_menu.name;
    end if;

    if v_menu.stock <= 0 then
      raise exception 'Menu "%" sedang habis dan dalam masa jeda restock 5 menit.', v_menu.name;
    end if;

    if v_menu.stock < v_entry.quantity then
      raise exception 'Stok "%" tersisa % porsi.', v_menu.name, v_menu.stock;
    end if;

    v_new_stock := greatest(0, v_menu.stock - v_entry.quantity);

    update public.menu_items
    set stock = v_new_stock,
        last_stock = case
          when v_new_stock = 0 then coalesce(v_menu.last_stock, v_menu.stock)
          else coalesce(v_menu.last_stock, v_menu.stock)
        end,
        restock_available_at = case
          when v_new_stock = 0 then now() + interval '5 minutes'
          else null
        end,
        updated_at = now()
    where id = v_menu.id
    returning * into v_menu;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'id', v_menu.id,
        'stock', v_menu.stock,
        'last_stock', v_menu.last_stock,
        'restock_available_at', v_menu.restock_available_at
      )
    );
  end loop;

  return v_result;
end;
$$;

-- Fungsi rollback stok bila pencatatan pesanan gagal setelah stok dikurangi
create or replace function public.restore_checkout_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
begin
  if auth.uid() is null then
    return;
  end if;

  for v_entry in
    select
      (elem ->> 'menu_id')::uuid as menu_id,
      sum((elem ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'menu_id')::uuid
  loop
    update public.menu_items
    set stock = stock + greatest(0, v_entry.quantity),
        restock_available_at = null,
        updated_at = now()
    where id = v_entry.menu_id;
  end loop;
end;
$$;

-- ============================================================================
-- 4. TABEL PESANAN & ITEM PESANAN
-- ============================================================================
create sequence if not exists public.order_number_seq start 1043;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('DS-' || nextval('public.order_number_seq')::text),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null default '',
  delivery_method text not null check (delivery_method in ('Ambil di Toko', 'Antar ke Alamat')),
  payment_method text not null default 'COD' check (payment_method in ('COD', 'QRIS', 'E-Wallet')),
  notes text,
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null check (total >= 0),
  status text not null default 'Menunggu' check (status in ('Menunggu', 'Diproses', 'Siap', 'Selesai', 'Dibatalkan')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists payment_method text not null default 'COD'
  check (payment_method in ('COD', 'QRIS', 'E-Wallet'));

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  category text not null check (category in ('Donat', 'Minuman')),
  price integer not null check (price >= 0),
  quantity integer not null check (quantity > 0),
  subtotal integer not null check (subtotal >= 0),
  image_url text not null,
  note text
);

-- ============================================================================
-- 5. HAK AKSES DASAR (GRANT) & ROW LEVEL SECURITY (RLS)
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;
grant usage, select on sequence public.order_number_seq to authenticated;
grant execute on function public.sync_expired_restocks() to anon, authenticated;
grant execute on function public.process_checkout_stock(jsonb) to authenticated;
grant execute on function public.restore_checkout_stock(jsonb) to authenticated;

alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Kebijakan RLS: public.profiles
drop policy if exists "User membaca profil sendiri dan Admin membaca semua" on public.profiles;
create policy "User membaca profil sendiri dan Admin membaca semua"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "User dapat membuat profil sendiri dengan role user" on public.profiles;
create policy "User dapat membuat profil sendiri dengan role user"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'user');

drop policy if exists "User memperbarui profil sendiri tanpa ubah role" on public.profiles;
create policy "User memperbarui profil sendiri tanpa ubah role"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Admin mengelola semua data profil pengguna" on public.profiles;
create policy "Admin mengelola semua data profil pengguna"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Kebijakan RLS: public.menu_items
drop policy if exists "Semua pengunjung dapat membaca katalog menu" on public.menu_items;
create policy "Semua pengunjung dapat membaca katalog menu"
  on public.menu_items for select
  using (true);

drop policy if exists "Hanya Admin dapat menambah mengubah menghapus menu" on public.menu_items;
create policy "Hanya Admin dapat menambah mengubah menghapus menu"
  on public.menu_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Kebijakan RLS: public.orders
drop policy if exists "User membaca pesanan sendiri dan Admin membaca semua" on public.orders;
create policy "User membaca pesanan sendiri dan Admin membaca semua"
  on public.orders for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "User terautentikasi dapat membuat pesanan sendiri" on public.orders;
create policy "User terautentikasi dapat membuat pesanan sendiri"
  on public.orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Hanya Admin dapat mengubah status pesanan" on public.orders;
create policy "Hanya Admin dapat mengubah status pesanan"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- Kebijakan RLS: public.order_items
drop policy if exists "User membaca item pesanan sendiri dan Admin membaca semua" on public.order_items;
create policy "User membaca item pesanan sendiri dan Admin membaca semua"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "User dapat menambah item pada pesanan miliknya" on public.order_items;
create policy "User dapat menambah item pada pesanan miliknya"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. STORAGE BUCKET UNTUK FOTO MENU (Supabase Storage)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "Publik dapat melihat foto menu" on storage.objects;
create policy "Publik dapat melihat foto menu"
  on storage.objects for select
  using (bucket_id = 'menu-images');

drop policy if exists "Hanya Admin dapat mengunggah foto menu" on storage.objects;
create policy "Hanya Admin dapat mengunggah foto menu"
  on storage.objects for insert
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "Hanya Admin dapat menghapus foto menu" on storage.objects;
create policy "Hanya Admin dapat menghapus foto menu"
  on storage.objects for delete
  using (bucket_id = 'menu-images' and public.is_admin());

-- ============================================================================
-- 7. DATA AWAL KATALOG MENU (Minimal 10+ Produk Siap Pakai)
-- ============================================================================
insert into public.menu_items (name, category, price, stock, description, image_url, is_available, highlight)
select v.name, v.category, v.price, v.stock, v.description, v.image_url, v.is_available, v.highlight
from (
  values
    ('Brioche Rose Berry', 'Donat', 24000, 18, 'Donat brioche fermentasi lambat dengan glasir raspberry mawar yang lembut dan taburan kelopak mawar kering.', '/src/assets/images/donut_rose_berry_1795086666461.jpg', true, 'Favorit'),
    ('Vanilla Bean Pistachio', 'Donat', 26000, 14, 'Adonan donat empuk berlapis krim vanila Madagaskar asli, lelehan cokelat putih, dan pistachio panggang.', '/src/assets/images/donut_matcha_cream_1795086666050.jpg', true, 'Baru'),
    ('Bomboloni Dark Hazelnut', 'Donat', 28000, 9, 'Bomboloni isi ganache cokelat hitam 64% yang lumer di dalam dengan taburan kakao halus dan hazelnut panggang.', '/src/assets/images/donut_choco_hazelnut_1795086666592.jpg', true, 'Terlaris'),
    ('Velvet Berry Cream Ring', 'Donat', 23000, 12, 'Donat cincin klasik dengan lapisan krim berry velvet lembut dan sentuhan manis seimbang untuk teman ngopi.', '/src/assets/images/hero_dositi_spread_1795086667502.jpg', true, null),
    ('Donat Cokelat Cherry Klasik', 'Donat', 22000, 16, 'Donat empuk bertabur serutan cokelat hitam melimpah dengan buah ceri manis di tengahnya.', '/src/assets/images/donut_choco_hazelnut_1795086666592.jpg', true, 'Favorit'),
    ('Donat Stroberi Sprinkle', 'Donat', 20000, 20, 'Donat lembut dengan glasir stroberi merah muda yang manis segar dan taburan sprinkle warna-warni.', '/src/assets/images/donut_rose_berry_1795086666461.jpg', true, null),
    ('Iced Rose Velvet Latte', 'Minuman', 32000, 22, 'Espresso single origin berpadu susu mawar vanila dingin dan foam krim lembut di atasnya.', '/src/assets/images/drink_rose_latte_1795086667182.jpg', true, 'Signature'),
    ('Strawberry Matcha Cloud', 'Minuman', 34000, 16, 'Lapisan puree stroberi segar buatan dapur sendiri, susu dingin, dan matcha seremonial Uji.', '/src/assets/images/drink_berry_matcha_1795086666533.jpg', true, 'Favorit'),
    ('Iced Thai Milk Tea', 'Minuman', 24000, 25, 'Seduhan teh Thailand autentik dengan susu evaporasi creamy dan manis karamel yang menyegarkan.', '/src/assets/images/drink_rose_latte_1795086667182.jpg', true, 'Terlaris'),
    ('Iced Creamy Matcha Latte', 'Minuman', 28000, 18, 'Matcha hijau pekat berpadu susu segar dingin untuk teman ngemil donat manis.', '/src/assets/images/drink_berry_matcha_1795086666533.jpg', true, null),
    ('Iced Belgian Choco Latte', 'Minuman', 29000, 15, 'Cokelat Belgia dingin dengan tekstur kental lembut dan susu segar pilihan.', '/src/assets/images/drink_rose_latte_1795086667182.jpg', true, null),
    ('Paket Segar Teh Melati & Mineral', 'Minuman', 15000, 30, 'Pilihan minuman praktis penyegar dahaga: teh melati botol dingin atau air mineral kemasan sejuk.', '/src/assets/images/drink_berry_matcha_1795086666533.jpg', true, null)
) as v(name, category, price, stock, description, image_url, is_available, highlight)
where not exists (
  select 1 from public.menu_items m where m.name = v.name
);

-- Catatan promosi Admin pertama (jalankan manual di SQL Editor setelah akun Admin mendaftar):
-- update public.profiles set role = 'admin' where email = 'email_admin_anda@domain.com';
