-- ============================================================
-- Niveles creados por los jugadores (editor) y compartidos con un código
-- ============================================================
create table if not exists public.user_levels (
  id         bigint generated always as identity primary key,
  code       text not null unique check (code ~ '^NV-[A-HJKMNP-Z2-9]{5}$'),
  owner      uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 3 and 30),
  theme      text not null check (theme in ('yamboro','laguna','selva','cueva','volcan','nube','hielo','datos','tormenta')),
  data       jsonb not null,
  plays      int not null default 0,
  clears     int not null default 0,
  likes      int not null default 0,
  created_at timestamptz not null default now(),
  constraint level_size check (pg_column_size(data) < 20000)
);
create index if not exists user_levels_owner on public.user_levels (owner);
create table if not exists public.level_likes (
  user_id  uuid   not null references public.profiles (id) on delete cascade,
  level_id bigint not null references public.user_levels (id) on delete cascade,
  primary key (user_id, level_id)
);
alter table public.user_levels enable row level security;
alter table public.level_likes enable row level security;
revoke all on public.user_levels, public.level_likes from anon, authenticated;
-- todo pasa por las funciones de abajo

-- ¿El dibujo del editor es válido? 14 filas del mismo ancho (30 a 240) y solo letras conocidas
create or replace function public.level_data_ok(d jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare w int; r text;
begin
  if jsonb_typeof(d) <> 'object' or (d->>'v') is distinct from '1' then return false; end if;
  w := (d->>'W')::int;
  if w is null or w < 30 or w > 240 then return false; end if;
  if jsonb_typeof(d->'rows') <> 'array' or jsonb_array_length(d->'rows') <> 14 then return false; end if;
  for r in select jsonb_array_elements_text(d->'rows') loop
    if char_length(r) <> w or r !~ '^[.#BMSKpo123^=|_f<>zICF?]*$' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function public.publish_level(title text, theme text, data jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); c text; alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int;
begin
  if uid is null then raise exception 'Inicia sesión para publicar'; end if;
  if char_length(trim(title)) < 3 or char_length(trim(title)) > 30 then raise exception 'El nombre debe tener entre 3 y 30 letras'; end if;
  if not public.level_data_ok(data) then raise exception 'El nivel no es válido'; end if;
  if position('F' in (select string_agg(x, '') from jsonb_array_elements_text(data->'rows') x)) = 0 then raise exception 'Pon la bandera de meta antes de publicar'; end if;
  if (select count(*) from public.user_levels where owner = uid) >= 15 then raise exception 'Llegaste al máximo de 15 niveles publicados. Borra uno para publicar otro'; end if;
  loop
    c := 'NV-'; for i in 1..5 loop c := c || substr(alpha, 1 + floor(random() * length(alpha))::int, 1); end loop;
    exit when not exists (select 1 from public.user_levels where code = c);
  end loop;
  insert into public.user_levels (code, owner, title, theme, data) values (c, uid, trim(title), theme, data);
  return c;
end $$;

-- Lista: 'top' (más jugados y con más me gusta), 'new' (recientes), 'mine' (los míos). q busca por nombre o código.
create or replace function public.list_levels(sort text default 'top', q text default '')
returns table (code text, title text, theme text, author text, author_char text, plays int, clears int, likes int, liked boolean, mine boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.code, l.title, l.theme, p.username, p.character_name, l.plays, l.clears, l.likes,
         exists (select 1 from public.level_likes k where k.level_id = l.id and k.user_id = (select auth.uid())),
         l.owner = (select auth.uid()), l.created_at
    from public.user_levels l join public.profiles p on p.id = l.owner
   where (sort <> 'mine' or l.owner = (select auth.uid()))
     and (coalesce(q, '') = '' or l.code = upper(trim(q)) or l.title ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%')
   order by case when sort = 'top' then l.likes * 3 + l.plays else 0 end desc, l.created_at desc
   limit 40
$$;

-- Traer un nivel para jugarlo (suma una partida)
create or replace function public.get_level(level_code text)
returns table (code text, title text, theme text, author text, data jsonb, likes int, liked boolean, mine boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión'; end if;
  update public.user_levels set plays = plays + 1 where user_levels.code = upper(trim(level_code));
  return query
    select l.code, l.title, l.theme, p.username, l.data, l.likes,
           exists (select 1 from public.level_likes k where k.level_id = l.id and k.user_id = (select auth.uid())),
           l.owner = (select auth.uid())
      from public.user_levels l join public.profiles p on p.id = l.owner where l.code = upper(trim(level_code));
end $$;

create or replace function public.clear_level(level_code text)
returns void language sql security definer set search_path = '' as $$
  update public.user_levels set clears = clears + 1 where code = upper(trim(level_code)) and (select auth.uid()) is not null;
$$;

-- Me gusta (se puede quitar); devuelve el total
create or replace function public.like_level(level_code text, on_off boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); lid bigint; n int;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  select id into lid from public.user_levels where code = upper(trim(level_code));
  if lid is null then raise exception 'Ese nivel no existe'; end if;
  if on_off then insert into public.level_likes values (uid, lid) on conflict do nothing;
  else delete from public.level_likes where user_id = uid and level_id = lid; end if;
  select count(*) into n from public.level_likes where level_id = lid;
  update public.user_levels set likes = n where id = lid;
  return n;
end $$;

create or replace function public.delete_level(level_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.user_levels where code = upper(trim(level_code)) and owner = (select auth.uid());
  if not found then raise exception 'Solo puedes borrar tus propios niveles'; end if;
end $$;

revoke execute on function public.level_data_ok(jsonb)               from public, anon, authenticated;
revoke execute on function public.publish_level(text, text, jsonb)   from public, anon;
revoke execute on function public.list_levels(text, text)            from public, anon;
revoke execute on function public.get_level(text)                    from public, anon;
revoke execute on function public.clear_level(text)                  from public, anon;
revoke execute on function public.like_level(text, boolean)          from public, anon;
revoke execute on function public.delete_level(text)                 from public, anon;
grant execute on function public.publish_level(text, text, jsonb)   to authenticated;
grant execute on function public.list_levels(text, text)            to authenticated;
grant execute on function public.get_level(text)                    to authenticated;
grant execute on function public.clear_level(text)                  to authenticated;
grant execute on function public.like_level(text, boolean)          to authenticated;
grant execute on function public.delete_level(text)                 to authenticated;
