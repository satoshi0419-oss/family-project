-- ============================================================
-- 追加 002:家族のメンバーと「できること」
-- schema.sql を実行したあとに、SQL Editor で一度だけ実行してください。
-- 何度実行しても壊れないように作ってあります。
-- ============================================================
-- 用語メモ
--   jsonb  : JSON(JavaScript Object Notation)を binary=バイナリ形式で保存する列。
--            {"knife": 2, "fire": 1} のような「名前と値の組」をまとめて入れられる
--   uuid[] : uuid の配列(array)。1つの作業を複数人で担当したときの「だれ」を入れる
-- ============================================================

-- 家族のメンバー。kind は adult(大人)/ child(子ども)
-- skills は「できること」の段階:0=まだ / 1=できそう(見守りで挑戦) / 2=できる
create table if not exists public.family_people (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 20),
  kind       text not null default 'adult' check (kind in ('adult', 'child')),
  color      int  not null default 0 check (color between 0 and 7),
  sort       int  not null default 0,
  skills     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists family_people_family_idx on public.family_people(family_id);

-- 「できるようになったこと」の記録(段階が変わったときに1行増える)
create table if not exists public.skill_log (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  person_id  uuid not null references public.family_people(id) on delete cascade,
  skill      text not null,
  from_level int  not null,
  to_level   int  not null,
  created_at timestamptz not null default now()
);
create index if not exists skill_log_person_idx on public.skill_log(person_id);

-- 記録に「だれがやったか」を残す列
alter table public.task_runs add column if not exists people uuid[] not null default '{}';

-- 安全装置(RLS):同じ家族のメンバーの端末だけが読み書きできる
alter table public.family_people enable row level security;
alter table public.skill_log     enable row level security;

drop policy if exists people_all on public.family_people;
create policy people_all on public.family_people
  for all to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists skill_log_all on public.skill_log;
create policy skill_log_all on public.skill_log
  for all to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id)
              and exists(select 1 from public.family_people p
                         where p.id = person_id and p.family_id = skill_log.family_id));

revoke all on public.family_people, public.skill_log from anon;
grant select, insert, update, delete on public.family_people, public.skill_log to authenticated;

-- リアルタイム同期の対象に追加
do $$
begin
  begin alter publication supabase_realtime add table public.family_people;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.skill_log;
  exception when duplicate_object then null; end;
end $$;
