-- ============================================================
-- Grupos (por ejemplo, la ficha): se unen con un código, tienen su propio ranking y un chat
-- ============================================================
create table if not exists public.groups (
  id         bigint generated always as identity primary key,
  code       text not null unique check (code ~ '^GR-[A-HJKMNP-Z2-9]{5}$'),
  name       text not null check (char_length(name) between 3 and 30),
  owner      uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id  bigint not null references public.groups (id) on delete cascade,
  user_id   uuid   not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);
create table if not exists public.group_messages (
  id         bigint generated always as identity primary key,
  group_id   bigint not null references public.groups (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group on public.group_messages (group_id, id);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
revoke all on public.groups, public.group_members, public.group_messages from anon, authenticated;

create or replace function public.check_group_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.has_bad_word(new.name) then raise exception 'El nombre del grupo tiene palabras no permitidas'; end if;
  return new;
end $$;
drop trigger if exists groups_name_words on public.groups;
create trigger groups_name_words before insert or update of name on public.groups for each row execute function public.check_group_name();

create or replace function public.is_group_member(gid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()))
$$;

create or replace function public.create_group(group_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); c text; alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int; gid bigint;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  if char_length(trim(group_name)) < 3 or char_length(trim(group_name)) > 30 then raise exception 'El nombre debe tener entre 3 y 30 letras'; end if;
  if (select count(*) from public.groups where owner = uid) >= 3 then raise exception 'Puedes crear máximo 3 grupos'; end if;
  if (select count(*) from public.group_members where user_id = uid) >= 5 then raise exception 'Puedes estar en máximo 5 grupos'; end if;
  loop
    c := 'GR-'; for i in 1..5 loop c := c || substr(alpha, 1 + floor(random() * length(alpha))::int, 1); end loop;
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  insert into public.groups (code, name, owner) values (c, trim(group_name), uid) returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, uid);
  return c;
end $$;

create or replace function public.join_group(group_code text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); gid bigint;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  select id into gid from public.groups where code = upper(trim(group_code));
  if gid is null then raise exception 'No hay ningún grupo con ese código'; end if;
  if exists (select 1 from public.group_members where group_id = gid and user_id = uid) then return gid; end if;
  if (select count(*) from public.group_members where user_id = uid) >= 5 then raise exception 'Puedes estar en máximo 5 grupos'; end if;
  if (select count(*) from public.group_members where group_id = gid) >= 60 then raise exception 'Ese grupo ya está lleno (60 personas)'; end if;
  insert into public.group_members (group_id, user_id) values (gid, uid);
  return gid;
end $$;

-- salir: si sale el creador, el grupo pasa al miembro más antiguo; si queda vacío, se borra
create or replace function public.leave_group(gid bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); heir uuid;
begin
  delete from public.group_members where group_id = gid and user_id = uid;
  if not found then raise exception 'No estás en ese grupo'; end if;
  if (select owner from public.groups where id = gid) = uid then
    select user_id into heir from public.group_members where group_id = gid order by joined_at limit 1;
    if heir is null then delete from public.groups where id = gid;
    else update public.groups set owner = heir where id = gid; end if;
  end if;
end $$;

create or replace function public.my_groups()
returns table (id bigint, code text, name text, members int, owner boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.code, g.name, (select count(*)::int from public.group_members m where m.group_id = g.id), g.owner = (select auth.uid())
    from public.groups g join public.group_members me on me.group_id = g.id and me.user_id = (select auth.uid())
   order by me.joined_at
$$;

-- tabla del grupo: estadísticas públicas de cada miembro (solo para miembros)
create or replace function public.group_board(gid bigint)
returns table (user_id uuid, username text, character_name text, last_seen timestamptz, best_score int, levels int,
               kills int, quiz int, party int, races int, coins int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.character_name, p.last_seen, coalesce(g.best_score, 0),
         coalesce((select sum(x::int) from jsonb_array_elements_text(coalesce(g.progress->'done', '[]'::jsonb)) x), 0)::int,
         coalesce((g.stats->>'kills')::int, 0), coalesce((g.stats->>'quizRight')::int, 0), coalesce((g.stats->>'partyWins')::int, 0),
         coalesce((g.stats->>'raceWins')::int, 0), coalesce((g.stats->>'coinsEarned')::int, 0)
    from public.group_members m join public.profiles p on p.id = m.user_id left join public.game_progress g on g.user_id = p.id
   where m.group_id = gid and public.is_group_member(gid)
$$;

create or replace function public.send_group_message(gid bigint, msg text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t text := trim(regexp_replace(coalesce(msg, ''), '\s+', ' ', 'g'));
begin
  if not public.is_group_member(gid) then raise exception 'No estás en ese grupo'; end if;
  if char_length(t) < 1 or char_length(t) > 200 then raise exception 'El mensaje debe tener entre 1 y 200 letras'; end if;
  if public.has_bad_word(t) then raise exception 'El mensaje tiene palabras no permitidas'; end if;
  if exists (select 1 from public.group_messages where user_id = uid and created_at > now() - interval '2 seconds') then raise exception 'Espera un momento antes de enviar otro'; end if;
  insert into public.group_messages (group_id, user_id, body) values (gid, uid, t);
end $$;

create or replace function public.group_messages_since(gid bigint, after_id bigint default 0)
returns table (id bigint, username text, character_name text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  select * from (
    select m.id, p.username, p.character_name, m.body, m.created_at, m.user_id = (select auth.uid())
      from public.group_messages m join public.profiles p on p.id = m.user_id
     where m.group_id = gid and m.id > coalesce(after_id, 0) and public.is_group_member(gid)
     order by m.id desc limit 50) t order by id
$$;

revoke execute on function public.is_group_member(bigint) from public, anon, authenticated;
revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.leave_group(bigint) from public, anon;
revoke execute on function public.my_groups() from public, anon;
revoke execute on function public.group_board(bigint) from public, anon;
revoke execute on function public.send_group_message(bigint, text) from public, anon;
revoke execute on function public.group_messages_since(bigint, bigint) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(bigint) to authenticated;
grant execute on function public.my_groups() to authenticated;
grant execute on function public.group_board(bigint) to authenticated;
grant execute on function public.send_group_message(bigint, text) to authenticated;
grant execute on function public.group_messages_since(bigint, bigint) to authenticated;
