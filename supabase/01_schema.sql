-- رفّي — قاعدة البيانات
-- الصقي هذا الملف كله في Supabase → SQL Editor → New query، واضغطي Run.

-- ١) الكتب
create table public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  title         text not null,
  author        text default '',
  translator    text default '',
  publisher     text default '',
  genre         text default '',
  format        text default 'ورقي',          -- ورقي / كندل
  vibe          text default '',
  status        text default 'want',           -- want / reading / finished ...
  total_pages   int  default 0,
  owned         boolean default false,
  synopsis      text default '',
  author_bio    text default '',
  cover_path    text,                          -- مسار الغلاف في التخزين (covers)
  rating        int  default 0,
  desire        int  default 0,
  review        text default '',
  series_name   text default '',
  series_index  int,
  follow_series boolean default false,
  read_with     text default '',
  bookmark_style text default '',
  isbn          text default '',
  is_favorite   boolean default false,
  date_added    date default current_date,
  date_started  date,
  date_finished date,
  created_at    timestamptz default now()
);

-- ٢) جلسات القراءة
create table public.sessions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  book_id   uuid references public.books on delete cascade,
  date      date default current_date,
  from_page int default 0,
  to_page   int default 0,
  minutes   int default 0,
  note      text default '',
  mood      text default ''
);

-- ٣) الأمنيات (قائمة الشراء)
create table public.wishlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  book_id      uuid references public.books on delete set null,
  title        text not null,
  author       text default '',
  translator   text default '',
  genre        text default '',
  format       text default '',
  series_name  text default '',
  series_index int,
  priority     int default 0,
  notes        text default '',
  options      jsonb default '[]',            -- أماكن الشراء والأسعار
  cover_path   text,
  auto_added   boolean default false,
  date_added   date default current_date
);

-- ٤) سجل المزاج
create table public.mood_log (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date    date default current_date,
  mood    text not null,
  source  text default ''
);

-- ٥) الأهداف
create table public.goals (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data    jsonb not null default '{}'
);

-- ٦) المؤلفين المفضلين (ومنهم مؤلفين ما عندك كتب لهم)
create table public.favorite_authors (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name    text not null,
  bio     text default '',
  aliases text[] default '{}',
  unique (user_id, name)
);

-- ٧) إعدادات كل مستخدم (الألوان، الأوسمة، الكتاب الحالي...)
create table public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users on delete cascade,
  palette          text default '',
  hidden           jsonb default '[]',
  earned_badge_ids text[] default '{}',
  current_book_id  uuid,
  updated_at       timestamptz default now()
);

-- الحماية: كل مستخدم يشوف ويعدّل بياناته هو بس
do $$
declare t text;
begin
  foreach t in array array['books','sessions','wishlist','mood_log','goals','favorite_authors','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- تخزين الأغلفة: مجلد لكل مستخدم داخل covers
insert into storage.buckets (id, name, public) values ('covers', 'covers', false);

create policy "own covers read"   on storage.objects for select using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own covers write"  on storage.objects for insert with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own covers update" on storage.objects for update using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own covers delete" on storage.objects for delete using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
