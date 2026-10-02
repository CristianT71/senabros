-- SENA Bros · multijugador en tiempo real (Supabase Realtime, canales privados)
-- Salas:        topic 'room:<CODIGO>'   -> cualquier jugador con cuenta que conozca el código puede entrar (broadcast + presence)
-- Invitaciones: topic 'inbox:<user_id>' -> cualquiera con cuenta puede ENVIAR, pero solo el dueño puede RECIBIR
-- Los visitantes sin cuenta (anon) no pueden usar ningún canal privado.
-- Se puede ejecutar más de una vez sin romperse.

drop policy if exists senabros_rooms_receive on realtime.messages;
create policy senabros_rooms_receive on realtime.messages for select to authenticated
  using (realtime.topic() like 'room:%' and realtime.messages.extension in ('broadcast', 'presence'));

drop policy if exists senabros_rooms_send on realtime.messages;
create policy senabros_rooms_send on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'room:%' and realtime.messages.extension in ('broadcast', 'presence'));

drop policy if exists senabros_inbox_receive on realtime.messages;
create policy senabros_inbox_receive on realtime.messages for select to authenticated
  using (realtime.topic() = 'inbox:' || (select auth.uid())::text and realtime.messages.extension = 'broadcast');

drop policy if exists senabros_inbox_send on realtime.messages;
create policy senabros_inbox_send on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'inbox:%' and realtime.messages.extension = 'broadcast');
