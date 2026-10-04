-- Perfil público: cualquier jugador con cuenta puede ver el perfil de otro (solo datos de juego, nada privado)
create or replace function public.get_public_profile(who text)
returns table (
  id uuid, username text, player_code text, character_name text, last_seen timestamptz, created_at timestamptz,
  best_score int, done jsonb, stats jsonb, eq jsonb, levels_published int, crowns text[], friend_status text
)
language sql stable security definer set search_path = '' as $$
  with p as (
    select pr.* from public.profiles pr
     where pr.id::text = who or lower(pr.username) = lower(trim(who)) or upper(pr.player_code) = upper(trim(who))
     limit 1
  )
  select p.id, p.username, p.player_code, p.character_name, p.last_seen, p.created_at,
         coalesce(g.best_score, 0),
         coalesce(g.progress->'done', '[]'::jsonb),
         -- solo los contadores del juego (para logros y estadísticas)
         coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(g.stats, '{}'::jsonb)) as s(k, v)
                    where k in ('levels','kills','coinsEarned','bossKills','raceWins','battleWins','partyWins','survivalBest','revives','quizRight','quizStreak','champion','flawless')), '{}'::jsonb),
         coalesce(g.wardrobe->'eq', '{}'::jsonb),
         (select count(*)::int from public.user_levels l where l.owner = p.id),
         coalesce((select array_agg(c.board) from public.weekly_champions() c where c.user_id = p.id), '{}'),
         (select case when f.status = 'accepted' then 'amigos' when f.requester_id = (select auth.uid()) then 'enviada' else 'recibida' end
            from public.friendships f
           where (f.requester_id = (select auth.uid()) and f.addressee_id = p.id) or (f.addressee_id = (select auth.uid()) and f.requester_id = p.id)
           limit 1)
    from p left join public.game_progress g on g.user_id = p.id
   where (select auth.uid()) is not null
$$;
revoke execute on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;
