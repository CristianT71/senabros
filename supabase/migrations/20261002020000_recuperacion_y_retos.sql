-- SENA Bros · recuperación de contraseña con código y cancelación de retos
-- Los correos de las cuentas son inventados (usuario@senabros.vercel.app), así que no se puede mandar un enlace por correo.
-- En su lugar cada jugador tiene un CÓDIGO DE RECUPERACIÓN (se muestra una sola vez) con el que puede poner una contraseña nueva.
-- Se puede ejecutar más de una vez sin romperse.

-- Los códigos se guardan cifrados (bcrypt) en una tabla a la que el navegador NO tiene acceso (RLS activo y sin políticas).
create table if not exists public.account_recovery (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  code_hash       text not null,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.account_recovery enable row level security;
revoke all on public.account_recovery from anon, authenticated;

-- Genera un código nuevo (reemplaza el anterior) y lo devuelve UNA sola vez: XXXX-XXXX-XXXX
create or replace function public.create_recovery_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 símbolos, sin I, O, 0, 1
  raw_bytes bytea := extensions.gen_random_bytes(12);              -- aleatorio criptográfico
  code text := '';
  i int;
begin
  if (select auth.uid()) is null then raise exception 'No has iniciado sesión'; end if;
  for i in 0..11 loop
    code := code || substr(alphabet, 1 + (get_byte(raw_bytes, i) % 32), 1);
  end loop;
  insert into public.account_recovery (user_id, code_hash)
  values ((select auth.uid()), extensions.crypt(code, extensions.gen_salt('bf', 8)))
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, failed_attempts = 0, locked_until = null, created_at = now();
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4);
end $$;

create or replace function public.has_recovery_code()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_recovery where user_id = (select auth.uid()));
$$;

-- Cambia la contraseña con usuario + código. Devuelve 'ok', 'invalid' o 'locked' (no lanza error para poder contar intentos).
-- 5 intentos fallidos bloquean la recuperación de esa cuenta 15 minutos. El código sirve una sola vez.
create or replace function public.recover_password(uname text, code text, new_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  r   public.account_recovery;
  norm text;
begin
  if new_password is null or length(new_password) < 6 or length(new_password) > 72 then
    raise exception 'La contraseña debe tener entre 6 y 72 caracteres';
  end if;
  select p.id into uid from public.profiles p where lower(p.username) = lower(coalesce(uname, ''));
  if uid is null then return 'invalid'; end if;
  select * into r from public.account_recovery where user_id = uid for update;
  if not found then return 'invalid'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;

  norm := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  if extensions.crypt(norm, r.code_hash) <> r.code_hash then
    update public.account_recovery
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
     where user_id = uid;
    return 'invalid';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = uid;
  delete from auth.sessions where user_id = uid;              -- cierra las sesiones abiertas
  delete from public.account_recovery where user_id = uid;    -- el código se gasta; hay que generar otro
  return 'ok';
end $$;

-- El que creó un reto lo puede cancelar mientras no haya terminado
create or replace function public.cancel_challenge(challenge bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.challenges
   where id = challenge and creator_id = (select auth.uid()) and status in ('pending','active');
  if not found then raise exception 'No se puede cancelar este reto'; end if;
end $$;

revoke execute on function public.create_recovery_code()                   from public, anon;
revoke execute on function public.has_recovery_code()                      from public, anon;
revoke execute on function public.recover_password(text, text, text)       from public;
revoke execute on function public.cancel_challenge(bigint)                 from public, anon;
grant  execute on function public.create_recovery_code()                   to authenticated;
grant  execute on function public.has_recovery_code()                      to authenticated;
grant  execute on function public.recover_password(text, text, text)       to anon, authenticated;
grant  execute on function public.cancel_challenge(bigint)                 to authenticated;
