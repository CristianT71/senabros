-- ============================================================
-- Moderación: filtro de groserías en usuarios y nombres de niveles, y reportes de niveles
-- ============================================================

-- ¿El texto tiene groserías? Las compuestas se buscan dentro del texto; las cortas solo como palabra suelta
-- (así "computadora" o "Vergara" no se bloquean).
create or replace function public.has_bad_word(t text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(coalesce(t, '')) ~ '(hijueputa|hijuepu|hpta|gonorrea|malparid|careverga|caremonda|pendej|maric[oó]n)'
      or lower(coalesce(t, '')) ~ '(^|[^a-záéíóúñ])(hp|puta|puto|putas|mierda|verga|marica|culo|imbecil|imbécil|idiota|estupid[oa]s?|estúpid[oa]s?|perra|zorra|chimba|guevon|huevon|gueva|malparido)([^a-záéíóúñ]|$)'
$$;

-- usuarios: se revisa al registrarse o al cambiarlo (los que ya existen no se tocan)
create or replace function public.check_username_words()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.has_bad_word(replace(new.username, '_', ' ')) then raise exception 'Ese usuario no está permitido'; end if;
  return new;
end $$;
drop trigger if exists profiles_username_words on public.profiles;
create trigger profiles_username_words before insert or update of username on public.profiles
  for each row execute function public.check_username_words();

create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select name ~ '^[A-Za-z0-9_]{3,16}$'
     and not public.has_bad_word(replace(name, '_', ' '))
     and not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

-- niveles: nombre sin groserías y se pueden ocultar por reportes
alter table public.user_levels add column if not exists hidden boolean not null default false;
create table if not exists public.level_reports (
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  level_id   bigint not null references public.user_levels (id) on delete cascade,
  reason     text   not null check (reason in ('groserias', 'trampa', 'otro')),
  created_at timestamptz not null default now(),
  primary key (user_id, level_id)
);
alter table public.level_reports enable row level security;
revoke all on public.level_reports from anon, authenticated;

create or replace function public.check_level_title()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.has_bad_word(new.title) then raise exception 'El nombre del nivel tiene palabras no permitidas'; end if;
  return new;
end $$;
drop trigger if exists user_levels_title_words on public.user_levels;
create trigger user_levels_title_words before insert or update of title on public.user_levels
  for each row execute function public.check_level_title();

-- Reportar: 3 reportes de personas distintas lo ocultan hasta que el dueño del juego lo revise en Supabase
create or replace function public.report_level(level_code text, reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); lid bigint; own uuid; n int;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  select id, owner into lid, own from public.user_levels where code = upper(trim(level_code));
  if lid is null then raise exception 'Ese nivel no existe'; end if;
  if own = uid then raise exception 'No puedes reportar tu propio nivel'; end if;
  insert into public.level_reports (user_id, level_id, reason) values (uid, lid, coalesce(reason, 'otro')) on conflict do nothing;
  select count(*) into n from public.level_reports where level_id = lid;
  if n >= 3 then update public.user_levels set hidden = true where id = lid; end if;
  return n;
end $$;

-- la lista y la apertura ignoran los niveles ocultos (menos para su dueño)
drop function if exists public.list_levels(text, text);
create function public.list_levels(sort text default 'top', q text default '')
returns table (code text, title text, theme text, author text, author_char text, plays int, clears int, likes int, liked boolean, mine boolean, created_at timestamptz, hidden boolean, reported boolean)
language sql stable security definer set search_path = '' as $$
  select l.code, l.title, l.theme, p.username, p.character_name, l.plays, l.clears, l.likes,
         exists (select 1 from public.level_likes k where k.level_id = l.id and k.user_id = (select auth.uid())),
         l.owner = (select auth.uid()), l.created_at, l.hidden,
         exists (select 1 from public.level_reports r where r.level_id = l.id and r.user_id = (select auth.uid()))
    from public.user_levels l join public.profiles p on p.id = l.owner
   where (sort <> 'mine' or l.owner = (select auth.uid()))
     and (not l.hidden or l.owner = (select auth.uid()))
     and (coalesce(q, '') = '' or l.code = upper(trim(q)) or l.title ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%')
   order by case when sort = 'top' then l.likes * 3 + l.plays else 0 end desc, l.created_at desc
   limit 40
$$;
create or replace function public.get_level(level_code text)
returns table (code text, title text, theme text, author text, data jsonb, likes int, liked boolean, mine boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión'; end if;
  update public.user_levels set plays = plays + 1 where user_levels.code = upper(trim(level_code)) and not user_levels.hidden;
  return query
    select l.code, l.title, l.theme, p.username, l.data, l.likes,
           exists (select 1 from public.level_likes k where k.level_id = l.id and k.user_id = (select auth.uid())),
           l.owner = (select auth.uid())
      from public.user_levels l join public.profiles p on p.id = l.owner
     where l.code = upper(trim(level_code)) and (not l.hidden or l.owner = (select auth.uid()));
end $$;

revoke execute on function public.has_bad_word(text) from public, anon, authenticated;
revoke execute on function public.report_level(text, text) from public, anon;
revoke execute on function public.list_levels(text, text) from public, anon;
grant execute on function public.report_level(text, text) to authenticated;
grant execute on function public.list_levels(text, text) to authenticated;
