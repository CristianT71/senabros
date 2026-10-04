-- Ropa nueva modelada en Blender (sombrero de mago, casco vikingo, copa, orejas de gato, aureola, visor, alas y jetpack)
create or replace function public.item_price(item text)
returns int language sql immutable set search_path = '' as $$
  select case item
    when 'gorra'      then 150  when 'casco'     then 300  when 'audifonos' then 450
    when 'vueltiao'   then 800  when 'corona'    then 2000
    when 'gafas_sol'  then 200  when 'gafas_dev' then 250
    when 'mochila'    then 350  when 'capa_roja' then 600  when 'capa_sena' then 700
    when 'estela_verde' then 300 when 'estela_dorada' then 900 when 'estela_arcoiris' then 1500
    when 'mago' then 1200 when 'vikingo' then 1600 when 'copa' then 1000 when 'gato' then 900 when 'aureola' then 1800
    when 'visor' then 1300 when 'alas' then 2500 when 'jetpack' then 2200
  end
$$;
create or replace function public.item_slot(item text)
returns text language sql immutable set search_path = '' as $$
  select case
    when item in ('gorra','casco','audifonos','vueltiao','corona','mago','vikingo','copa','gato','aureola') then 'cabeza'
    when item in ('gafas_sol','gafas_dev','visor') then 'cara'
    when item in ('mochila','capa_roja','capa_sena','alas','jetpack') then 'espalda'
    when item in ('estela_verde','estela_dorada','estela_arcoiris') then 'estela'
  end
$$;
