-- Los niveles del editor ahora pueden tener bloques de pregunta de programación (letra Q)
create or replace function public.level_data_ok(d jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare w int; r text;
begin
  if jsonb_typeof(d) <> 'object' or (d->>'v') is distinct from '1' then return false; end if;
  w := (d->>'W')::int;
  if w is null or w < 30 or w > 240 then return false; end if;
  if jsonb_typeof(d->'rows') <> 'array' or jsonb_array_length(d->'rows') <> 14 then return false; end if;
  for r in select jsonb_array_elements_text(d->'rows') loop
    if char_length(r) <> w or r !~ '^[.#BMSKQpo123^=|_f<>zICF?]*$' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke execute on function public.level_data_ok(jsonb) from public, anon, authenticated;
