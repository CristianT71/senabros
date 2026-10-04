-- Ropa nueva hecha en Blender: gorro de Navidad, cuernos, corona real, casco de astronauta y capa de héroe
create or replace function public.item_price(item text)
returns int language sql immutable set search_path = '' as $$
  select case item
    when 'mago' then 350
    when 'vikingo' then 450
    when 'copa' then 300
    when 'gato' then 250
    when 'aureola' then 500
    when 'visor' then 350
    when 'alas' then 700
    when 'jetpack' then 600
    when 'gorro_navidad' then 150
    when 'cuernos' then 200
    when 'corona_rey' then 400
    when 'astronauta' then 450
    when 'capa_heroe' then 300
    when 'gorra' then 0
    when 'casco' then 0
    when 'audifonos' then 120
    when 'vueltiao' then 200
    when 'corona' then 500
    when 'gafas_sol' then 0
    when 'gafas_dev' then 0
    when 'mochila' then 0
    when 'capa_roja' then 150
    when 'capa_sena' then 180
    when 'estela_verde' then 0
    when 'estela_dorada' then 250
    when 'estela_arcoiris' then 450
  end
$$;

create or replace function public.item_slot(item text)
returns text language sql immutable set search_path = '' as $$
  select case
    when item in ('gorra','casco','audifonos','vueltiao','corona','mago','vikingo','copa','gato','aureola',
                  'gorro_navidad','cuernos','corona_rey','astronauta') then 'cabeza'
    when item in ('gafas_sol','gafas_dev','visor') then 'cara'
    when item in ('mochila','capa_roja','capa_sena','alas','jetpack','capa_heroe') then 'espalda'
    when item in ('estela_verde','estela_dorada','estela_arcoiris') then 'estela'
  end
$$;
