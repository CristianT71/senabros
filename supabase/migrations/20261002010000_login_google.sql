-- SENA Bros · soporte para entrar con Google (u otro proveedor externo)
-- Quien entra con Google no elige usuario: se le genera uno a partir de su nombre y puede cambiarlo UNA vez.
-- Se puede ejecutar más de una vez sin romperse.

alter table public.profiles add column if not exists username_changed boolean not null default false;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  wanted    text := new.raw_user_meta_data ->> 'username';
  base      text;
  candidate text;
begin
  if wanted is not null then
    -- registro normal: el jugador eligió su usuario (la tabla lo valida: 3-16 letras, números o _)
    insert into public.profiles (id, username, player_code, username_changed)
    values (new.id, wanted, public.generate_player_code(), true);
  else
    -- Google u otro proveedor: usuario automático a partir del nombre o del correo
    base := regexp_replace(lower(coalesce(
              new.raw_user_meta_data ->> 'name',
              new.raw_user_meta_data ->> 'full_name',
              split_part(coalesce(new.email, ''), '@', 1), '')), '[^a-z0-9_]', '', 'g');
    base := left(base, 10);
    if length(base) < 3 then base := 'jugador'; end if;
    loop
      candidate := base || '_' || substr(md5(random()::text), 1, 4);
      exit when not exists (select 1 from public.profiles where lower(username) = candidate);
    end loop;
    insert into public.profiles (id, username, player_code, username_changed)
    values (new.id, candidate, public.generate_player_code(), false);
  end if;
  insert into public.game_progress (user_id) values (new.id);
  return new;
end $$;

-- Cambiar el usuario (una sola vez, solo para quien recibió uno automático)
create or replace function public.change_username(new_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'No has iniciado sesión'; end if;
  if new_name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'Usuario inválido: 3 a 16 letras, números o _'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(new_name) and id <> (select auth.uid())) then
    raise exception 'Ese usuario ya existe';
  end if;
  update public.profiles set username = new_name, username_changed = true
   where id = (select auth.uid()) and username_changed = false;
  if not found then raise exception 'Ya cambiaste tu usuario una vez'; end if;
end $$;

revoke execute on function public.change_username(text) from public, anon;
grant  execute on function public.change_username(text) to authenticated;
