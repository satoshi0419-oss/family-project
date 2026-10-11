-- ============================================================
-- 家族で料理する工程表(family-cooking) データベースの設計図
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。
-- ============================================================
-- 用語メモ
--   table(テーブル)  : データを入れる表
--   RLS               : Row Level Security(行=row ごとの安全装置)。
--                       「この行は、この家族の端末にだけ見せる」というルール
--   function(関数)   : データベースの中で動く小さなプログラム
--   security definer  : 関数を「作った人(=管理者)の権限」で動かす設定。
--                       合言葉の照合のように、利用者には直接見せたくない処理に使う
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. 表(テーブル) ----------

-- 家族。family_code は人に伝える「家族ID」、pass_hash は合言葉を読めない形に変えたもの
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  family_code text not null unique,
  pass_hash   text not null,
  created_at  timestamptz not null default now()
);

-- 家族に参加している端末(匿名サインインした端末ごとの「名札」)
create table if not exists public.family_members (
  family_id  uuid not null references public.families(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  joined_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- 料理プロジェクト(例:カレー 第1回)。template は献立の型、goal_at は「いただきます」の時刻
create table if not exists public.cook_projects (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  template    text not null default 'curry',
  goal_at     timestamptz not null,
  settings    jsonb not null default '{"caps":{"peeler":1,"board":1,"stove":2},"correct":false}',
  created_at  timestamptz not null default now()
);

-- 実行モードで押した「始める/終わった」の記録。1プロジェクト×1作業で1行
create table if not exists public.task_runs (
  project_id  uuid not null references public.cook_projects(id) on delete cascade,
  family_id   uuid not null references public.families(id) on delete cascade,
  task_id     text not null,
  started_at  timestamptz,
  ended_at    timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (project_id, task_id)
);

create index if not exists cook_projects_family_idx on public.cook_projects(family_id);
create index if not exists task_runs_family_idx on public.task_runs(family_id);

-- ---------- 2. 関数 ----------

-- 自分(この端末)がその家族のメンバーか?
create or replace function public.is_family_member(fid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.family_members m
                where m.family_id = fid and m.user_id = auth.uid());
$$;

-- 家族を作る。家族ID(6文字)を自動で発行し、作った端末をメンバーにする
create or replace function public.create_family(p_name text, p_pass text)
returns table(family_id uuid, family_code text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_code text;
  v_id   uuid;
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 見間違えやすい O/0/I/1 は除く
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_pass is null or char_length(p_pass) < 4 then raise exception 'pass_too_short'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists(select 1 from public.families f where f.family_code = v_code);
  end loop;
  insert into public.families(name, family_code, pass_hash)
    values (trim(p_name), v_code, crypt(p_pass, gen_salt('bf')))
    returning id into v_id;
  insert into public.family_members(family_id, user_id) values (v_id, auth.uid());
  return query select v_id, v_code;
end;
$$;

-- 家族に入る。家族IDと合言葉が合えば、この端末をメンバーに加える
create or replace function public.join_family(p_code text, p_pass text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select f.id into v_id from public.families f
   where f.family_code = upper(trim(p_code))
     and f.pass_hash = crypt(p_pass, f.pass_hash);
  if v_id is null then
    perform pg_sleep(1); -- 総当たりで試されにくくするための待ち時間
    raise exception 'wrong_code_or_pass';
  end if;
  insert into public.family_members(family_id, user_id) values (v_id, auth.uid())
    on conflict do nothing;
  return v_id;
end;
$$;

-- updated_at を自動で更新する
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists task_runs_touch on public.task_runs;
create trigger task_runs_touch before update on public.task_runs
  for each row execute function public.touch_updated_at();

-- ---------- 3. 権限(だれが何をできるか) ----------

alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.cook_projects  enable row level security;
alter table public.task_runs      enable row level security;

-- 家族:メンバーだけが見られる。作る・入るは上の関数経由のみ(直接の書き込みは不可)
drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select to authenticated using (public.is_family_member(id));

drop policy if exists members_select on public.family_members;
create policy members_select on public.family_members
  for select to authenticated using (public.is_family_member(family_id));
drop policy if exists members_leave on public.family_members;
create policy members_leave on public.family_members
  for delete to authenticated using (user_id = auth.uid());

-- 料理プロジェクトと記録:同じ家族のメンバーなら読み書きできる
drop policy if exists projects_all on public.cook_projects;
create policy projects_all on public.cook_projects
  for all to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists runs_all on public.task_runs;
create policy runs_all on public.task_runs
  for all to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id)
              and exists(select 1 from public.cook_projects p
                         where p.id = project_id and p.family_id = task_runs.family_id));

-- 表そのものへの出入りの許可(grant=与える)。ここが漏れると、ルール以前に門前払いになる
revoke all on public.families, public.family_members, public.cook_projects, public.task_runs from anon;
-- 合言葉の暗号(pass_hash)は家族にも見せない:列(column)単位で許可する
revoke select on public.families from authenticated;
grant select (id, name, family_code, created_at) on public.families to authenticated;
grant select, delete on public.family_members to authenticated;
grant select, insert, update, delete on public.cook_projects, public.task_runs to authenticated;

revoke execute on function public.create_family(text, text) from public, anon;
revoke execute on function public.join_family(text, text)   from public, anon;
revoke execute on function public.is_family_member(uuid)    from public, anon;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text, text)   to authenticated;
grant execute on function public.is_family_member(uuid)    to authenticated;

-- ---------- 4. リアルタイム同期 ----------
-- タブレットで押した「終わった」が、親のスマホにすぐ反映されるようにする
do $$
begin
  begin
    alter publication supabase_realtime add table public.task_runs;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.cook_projects;
  exception when duplicate_object then null; end;
end $$;
