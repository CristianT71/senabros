-- SENA Bros · cuentas, amigos, progreso en la nube y retos
-- Se puede ejecutar más de una vez sin romperse (todo es idempotente).
-- Seguridad: todas las tablas tienen RLS; el navegador solo puede hacer lo que las políticas permiten.

-- ============================================================
-- 1. PERFILES (un perfil por cuenta: usuario + ID corto para buscarse)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  player_code text not null unique,
  character_name text not null default 'Diego',
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  constraint profiles_character_valid check (character_name in ('Diego','Wilson','Juan','Carlos','Intructor','Jhonny','Fabian'))
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- ID corto tipo SB-K7M2Q9 (sin letras que se confunden: 0/O, 1/I/L)
create or replace function public.generate_player_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text; i int;
begin
  loop
    code := 'SB-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where player_code = code);
  end loop;
  return code;
end $$;

-- Al crear una cuenta (auth.users) se crea su perfil y su fila de progreso
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, player_code)
  values (new.id, new.raw_user_meta_data ->> 'username', public.generate_player_code());
  insert into public.game_progress (user_id) values (new.id);
  return new;
end $$;

-- ============================================================
-- 2. PROGRESO EN LA NUBE
-- ============================================================
create table if not exists public.game_progress (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  progress   jsonb not null default '{}'::jsonb,   -- {done:[a,b], node:[a,b], world}
  powers     jsonb not null default '{}'::jsonb,   -- {Wilson:{unlocked:true,kills:15}, ...}
  coins      int  not null default 0 check (coins >= 0),
  best_score int  not null default 0 check (best_score >= 0),
  updated_at timestamptz not null default now(),
  constraint progress_small check (pg_column_size(progress) < 2048),
  constraint powers_small   check (pg_column_size(powers)   < 4096)
);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. AMIGOS
-- ============================================================
create table if not exists public.friendships (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id)
);
-- una sola relación por pareja, sin importar quién pidió primero
create unique index if not exists friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- ============================================================
-- 4. RETOS ENTRE AMIGOS
-- ============================================================
create table if not exists public.challenges (
  id              bigint generated always as identity primary key,
  creator_id      uuid not null references public.profiles (id) on delete cascade,
  opponent_id     uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('coins','kills','score','time_left')),
  world           int  not null default 1 check (world between 1 and 9),
  level           int  not null default 1 check (level between 1 and 9),
  status          text not null default 'pending' check (status in ('pending','active','finished','declined')),
  creator_result  int,
  opponent_result int,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  constraint challenges_not_self check (creator_id <> opponent_id)
);
create index if not exists challenges_creator  on public.challenges (creator_id);
create index if not exists challenges_opponent on public.challenges (opponent_id);

-- ============================================================
-- 5. SEGURIDAD (RLS)
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.game_progress enable row level security;
alter table public.friendships  enable row level security;
alter table public.challenges   enable row level security;

-- perfiles: cualquier jugador con cuenta puede buscar a otros; solo edita el suyo
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- progreso: privado (solo el dueño)
drop policy if exists progress_select_own on public.game_progress;
create policy progress_select_own on public.game_progress for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists progress_update_own on public.game_progress;
create policy progress_update_own on public.game_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- amigos: solo las dos personas involucradas
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- retos: solo los dos jugadores los ven; se crean y responden con funciones (abajo)
drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges for select to authenticated
  using ((select auth.uid()) in (creator_id, opponent_id));

-- ============================================================
-- 6. PERMISOS (como "exponer tablas automáticamente" está apagado, se dan a mano)
-- ============================================================
revoke all on public.profiles, public.game_progress, public.friendships, public.challenges from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (character_name, last_seen) on public.profiles to authenticated;
grant select on public.game_progress to authenticated;
grant update (progress, powers, coins, best_score, updated_at) on public.game_progress to authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (requester_id, addressee_id) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
grant select on public.challenges to authenticated;

-- ============================================================
-- 7. FUNCIONES PARA EL JUEGO
-- ============================================================
-- ¿Está libre este usuario? (se puede llamar antes de registrarse)
create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select name ~ '^[A-Za-z0-9_]{3,16}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

-- Buscar jugadores por usuario o por ID (SB-XXXXXX). No devuelve al propio jugador.
create or replace function public.search_players(q text)
returns table (id uuid, username text, player_code text, character_name text, last_seen timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.player_code, p.character_name, p.last_seen
  from public.profiles p
  where p.id <> (select auth.uid())
    and length(trim(q)) >= 2
    and (upper(p.player_code) = upper(trim(q)) or lower(p.username) like lower(trim(q)) || '%')
  order by (upper(p.player_code) = upper(trim(q))) desc, p.username
  limit 20;
$$;

-- Crear un reto a un amigo
create or replace function public.create_challenge(opponent uuid, kind text, world int, level int)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if (select auth.uid()) is null then raise exception 'No has iniciado sesión'; end if;
  if not public.are_friends((select auth.uid()), opponent) then raise exception 'Solo puedes retar a tus amigos'; end if;
  insert into public.challenges (creator_id, opponent_id, kind, world, level)
  values ((select auth.uid()), opponent, kind, world, level) returning id into new_id;
  return new_id;
end $$;

-- Aceptar o rechazar un reto (solo quien fue retado)
create or replace function public.respond_challenge(challenge bigint, accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.challenges
     set status = case when accept then 'active' else 'declined' end
   where id = challenge and opponent_id = (select auth.uid()) and status = 'pending' and expires_at > now();
  if not found then raise exception 'Reto no disponible'; end if;
end $$;

-- Guardar el resultado de cada jugador; cuando ambos terminan, el reto se cierra
create or replace function public.submit_challenge_result(challenge bigint, result int)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.challenges;
begin
  if result < 0 or result > 10000000 then raise exception 'Resultado inválido'; end if;
  select * into c from public.challenges where id = challenge for update;
  if not found or c.status <> 'active' or c.expires_at < now() then raise exception 'Reto no disponible'; end if;
  if (select auth.uid()) = c.creator_id and c.creator_result is null then
    update public.challenges set creator_result = result where id = challenge;
  elsif (select auth.uid()) = c.opponent_id and c.opponent_result is null then
    update public.challenges set opponent_result = result where id = challenge;
  else raise exception 'No puedes enviar este resultado'; end if;
  update public.challenges set status = 'finished'
   where id = challenge and creator_result is not null and opponent_result is not null;
end $$;

-- Marca al jugador como conectado (actualiza su "última vez visto")
create or replace function public.touch_presence()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_seen = now() where id = (select auth.uid());
$$;

-- Borrar la propia cuenta (perfil, progreso, amigos y retos se borran en cascada)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'No has iniciado sesión'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;

-- Quién puede llamar qué: nada para "anon" salvo comprobar si un usuario está libre
revoke execute on function public.generate_player_code()                        from public, anon, authenticated;
revoke execute on function public.handle_new_user()                             from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid)                       from public, anon, authenticated;
revoke execute on function public.username_available(text)                      from public;
revoke execute on function public.search_players(text)                          from public, anon;
revoke execute on function public.create_challenge(uuid, text, int, int)        from public, anon;
revoke execute on function public.respond_challenge(bigint, boolean)            from public, anon;
revoke execute on function public.submit_challenge_result(bigint, int)          from public, anon;
revoke execute on function public.touch_presence()                              from public, anon;
revoke execute on function public.delete_my_account()                           from public, anon;
grant execute on function public.username_available(text)                   to anon, authenticated;
grant execute on function public.search_players(text)                       to authenticated;
grant execute on function public.create_challenge(uuid, text, int, int)     to authenticated;
grant execute on function public.respond_challenge(bigint, boolean)         to authenticated;
grant execute on function public.submit_challenge_result(bigint, int)       to authenticated;
grant execute on function public.touch_presence()                           to authenticated;
grant execute on function public.delete_my_account()                         to authenticated;
