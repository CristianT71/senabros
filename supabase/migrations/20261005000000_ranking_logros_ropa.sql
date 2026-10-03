-- ============================================================
-- Ranking semanal, logros (estadísticas) y ropa comprada con monedas
-- ============================================================

-- ---------- 1. Estadísticas y armario en el progreso ----------
-- stats: contadores que solo suben (bugs, monedas ganadas, carreras ganadas...). De ahí salen los logros.
-- wardrobe: {owned:[ids], eq:{cabeza,cara,espalda,estela}}. Solo se cambia con buy_item / equip_items.
alter table public.game_progress add column if not exists stats    jsonb not null default '{}'::jsonb;
alter table public.game_progress add column if not exists wardrobe jsonb not null default '{}'::jsonb;
alter table public.game_progress drop constraint if exists stats_small;
alter table public.game_progress add constraint stats_small check (pg_column_size(stats) < 2048);
alter table public.game_progress drop constraint if exists wardrobe_small;
alter table public.game_progress add constraint wardrobe_small check (pg_column_size(wardrobe) < 2048);
grant update (stats) on public.game_progress to authenticated;

-- Precio de cada prenda (null = no existe). El juego tiene la misma lista en js/game.js (SHOP).
create or replace function public.item_price(item text)
returns int language sql immutable set search_path = '' as $$
  select case item
    when 'gorra'      then 150  when 'casco'     then 300  when 'audifonos' then 450
    when 'vueltiao'   then 800  when 'corona'    then 2000
    when 'gafas_sol'  then 200  when 'gafas_dev' then 250
    when 'mochila'    then 350  when 'capa_roja' then 600  when 'capa_sena' then 700
    when 'estela_verde' then 300 when 'estela_dorada' then 900 when 'estela_arcoiris' then 1500
  end
$$;
create or replace function public.item_slot(item text)
returns text language sql immutable set search_path = '' as $$
  select case
    when item in ('gorra','casco','audifonos','vueltiao','corona') then 'cabeza'
    when item in ('gafas_sol','gafas_dev') then 'cara'
    when item in ('mochila','capa_roja','capa_sena') then 'espalda'
    when item in ('estela_verde','estela_dorada','estela_arcoiris') then 'estela'
  end
$$;

-- Comprar: monedas disponibles = monedas ganadas (stats.coinsEarned) - lo que ya costaron las prendas compradas
create or replace function public.buy_item(item text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); price int := public.item_price(item); st jsonb; wr jsonb; owned jsonb; spent int; earned int;
begin
  if uid is null then raise exception 'Inicia sesión para comprar'; end if;
  if price is null then raise exception 'Esa prenda no existe'; end if;
  select stats, wardrobe into st, wr from public.game_progress where user_id = uid for update;
  owned := coalesce(wr->'owned', '[]'::jsonb);
  if owned ? item then raise exception 'Ya tienes esa prenda'; end if;
  select coalesce(sum(public.item_price(x)), 0) into spent from jsonb_array_elements_text(owned) x;
  earned := coalesce((st->>'coinsEarned')::int, 0);
  if earned - spent < price then raise exception 'No tienes suficientes monedas'; end if;
  wr := jsonb_set(coalesce(wr, '{}'::jsonb), '{owned}', owned || to_jsonb(item));
  update public.game_progress set wardrobe = wr, updated_at = now() where user_id = uid;
  return wr;
end $$;

-- Ponerse / quitarse prendas: cada espacio solo acepta una prenda propia de ese tipo (o '' para quitar)
create or replace function public.equip_items(eq jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); wr jsonb; owned jsonb; k text; v text; clean jsonb := '{}'::jsonb;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  if jsonb_typeof(eq) <> 'object' then raise exception 'Formato inválido'; end if;
  select wardrobe into wr from public.game_progress where user_id = uid for update;
  owned := coalesce(wr->'owned', '[]'::jsonb);
  for k, v in select key, value from jsonb_each_text(eq) loop
    if k not in ('cabeza','cara','espalda','estela') then raise exception 'Espacio inválido'; end if;
    if v <> '' and (not owned ? v or public.item_slot(v) is distinct from k) then raise exception 'No tienes esa prenda'; end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  wr := jsonb_set(coalesce(wr, '{}'::jsonb), '{eq}', clean);
  update public.game_progress set wardrobe = wr, updated_at = now() where user_id = uid;
  return wr;
end $$;

-- ---------- 2. Ranking semanal ----------
-- Tableros: 'nivel:M-N' (mejor puntaje del nivel), 'carrera' (carreras ganadas), 'batalla' (más monedas en una batalla),
-- 'supervivencia' (oleada más alta). La semana empieza el lunes (hora de Colombia).
create table if not exists public.weekly_scores (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  board      text not null check (board ~ '^(nivel:[1-9]-[1-9]|carrera|batalla|supervivencia)$'),
  week       date not null,
  value      int  not null check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (board, week, user_id)
);
alter table public.weekly_scores enable row level security;
revoke all on public.weekly_scores from anon, authenticated;
-- se lee solo con get_ranking y se escribe solo con submit_score

create or replace function public.current_week()
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', now() at time zone 'America/Bogota')::date
$$;

create or replace function public.submit_score(board_name text, val int)
returns int language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); wk date := public.current_week(); lim int; res int;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  lim := case when board_name ~ '^nivel:[1-9]-[1-9]$' then 2000000 when board_name = 'carrera' then 1
              when board_name = 'batalla' then 3000 when board_name = 'supervivencia' then 300 end;
  if lim is null then raise exception 'Tablero inválido'; end if;
  if val is null or val < 0 or val > lim then raise exception 'Valor inválido'; end if;
  if board_name = 'carrera' then   -- cada victoria suma 1 (máximo 300 por semana)
    insert into public.weekly_scores as w (user_id, board, week, value) values (uid, board_name, wk, 1)
      on conflict (board, week, user_id) do update set value = least(w.value + 1, 300), updated_at = now()
      returning value into res;
  else                        -- se guarda el mejor de la semana
    insert into public.weekly_scores as w (user_id, board, week, value) values (uid, board_name, wk, val)
      on conflict (board, week, user_id) do update set value = greatest(w.value, excluded.value),
        updated_at = case when excluded.value > w.value then now() else w.updated_at end
      returning value into res;
  end if;
  return res;
end $$;

-- Top 20 de la semana (y tu puesto aunque no estés en el top). El primero recibe la corona en el juego.
create or replace function public.get_ranking(board_name text, weeks_ago int default 0)
returns table (rank int, user_id uuid, username text, character_name text, value int, me boolean)
language sql stable security definer set search_path = '' as $$
  with r as (
    select w.user_id, p.username, p.character_name, w.value,
           (rank() over (order by w.value desc, w.updated_at asc))::int as rank
      from public.weekly_scores w join public.profiles p on p.id = w.user_id
     where w.board = get_ranking.board_name and w.week = public.current_week() - 7 * greatest(0, least(weeks_ago, 8))
  )
  select rank, user_id, username, character_name, value, user_id = (select auth.uid()) as me
    from r where rank <= 20 or user_id = (select auth.uid())
   order by rank limit 21
$$;

-- Quiénes van primeros esta semana en algún tablero (para la corona en la sala y en el perfil)
create or replace function public.weekly_champions()
returns table (user_id uuid, board text)
language sql stable security definer set search_path = '' as $$
  select distinct on (board) user_id, board from public.weekly_scores
   where week = public.current_week() order by board, value desc, updated_at asc
$$;

revoke execute on function public.buy_item(text)          from public, anon;
revoke execute on function public.equip_items(jsonb)      from public, anon;
revoke execute on function public.submit_score(text, int) from public, anon;
revoke execute on function public.get_ranking(text, int)  from public, anon;
revoke execute on function public.weekly_champions()      from public, anon;
grant execute on function public.buy_item(text)          to authenticated;
grant execute on function public.equip_items(jsonb)      to authenticated;
grant execute on function public.submit_score(text, int) to authenticated;
grant execute on function public.get_ranking(text, int)  to authenticated;
grant execute on function public.weekly_champions()      to authenticated;
