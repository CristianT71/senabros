-- Precios más bajos y prendas sencillas gratis (lo que ya se compró a precio viejo devuelve la diferencia sola,
-- porque las monedas disponibles se calculan con los precios actuales)
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
