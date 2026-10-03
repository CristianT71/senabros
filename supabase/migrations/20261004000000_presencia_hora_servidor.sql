-- touch_presence ahora devuelve la hora del servidor, para que el juego compare "conectado"
-- con el reloj del servidor y no con el del celular (si la hora del celular está mal, antes salía desconectado).
drop function if exists public.touch_presence();
create function public.touch_presence()
returns timestamptz language sql security definer set search_path = '' as $$
  update public.profiles set last_seen = now() where id = (select auth.uid());
  select now();
$$;
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;
