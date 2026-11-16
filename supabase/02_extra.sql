-- رفّي — إضافة ثانية: مكان لأي معلومة إضافية عشان ما يضيع شي من بياناتك
alter table public.books         add column if not exists extra jsonb default '{}';
alter table public.sessions      add column if not exists extra jsonb default '{}';
alter table public.wishlist      add column if not exists extra jsonb default '{}';
alter table public.mood_log      add column if not exists extra jsonb default '{}';
alter table public.user_settings add column if not exists extra jsonb default '{}';
alter table public.favorite_authors add column if not exists is_favorite boolean default true;
alter table public.user_settings alter column current_book_id type text;
