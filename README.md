# SENA Bros

Juego de plataformas 3D en el navegador, estilo Mario Bros, hecho para el SENA:
los instructores de ADSO (Análisis y Desarrollo de Software) contra los bugs.

**Jugar:** https://senabros.vercel.app

## Cómo se juega

| Acción | Teclado | Celular |
|---|---|---|
| Moverse | A / D o flechas | Cruceta |
| Correr | Shift | B |
| Saltar | Espacio / W | A |
| Agacharse / *ground pound* en el aire | S | Cruceta abajo |
| Puñetazo | J | 👊 |
| Poder del instructor | K | ⚡ |
| Volver al mapa | Esc | ⏸ |

- 2 mundos: **Yamboró** (6 niveles) y **Volcán Binario** (5 niveles, jefe final: el Bug Rey).
- 7 instructores, cada uno con un poder que se desbloquea cumpliendo una misión y gasta energía (monedas, bugs y ladrillos la recargan).
- El progreso, los poderes desbloqueados y los ajustes de controles se guardan en el navegador.

## Estructura

```
SenaBros/
├── index.html              Página del juego (menú, HUD, mapa, controles táctiles)
├── css/style.css           Estilos (menú, HUD, mapa, gloria, controles de celular)
├── js/
│   ├── game.js             Motor del juego: niveles, física, enemigos, poderes, mapa, mundos
│   ├── touch.js            Controles táctiles y ventana de ajustes (solo en celular)
│   ├── online.js           Cuentas, amigos, retos y progreso en la nube (Supabase)
│   ├── multiplayer.js      Salas en tiempo real (Supabase Realtime): presencia, posiciones y eventos
│   └── config.js           URL y llave pública (anon) de Supabase
├── assets/                 Lo que carga el juego (modelos e imágenes en base64)
│   ├── enemigos.js         Robot 404, Entrega Tardía, Archivo Corrupto, café y empanada
│   ├── fondo-yamboro.js    Fondo del nivel 1-1
│   ├── retratos.js         Retratos de los instructores para el menú
│   ├── personajes/         Un archivo por instructor (modelo 3D + 12 animaciones)
│   └── fondos/             Fondos de los niveles 1-2 a 1-6 (se cargan al entrar)
├── supabase/migrations/    Tablas y reglas de seguridad de la base de datos (SQL)
└── fuentes/                Originales para editar en Blender (no se suben a GitHub)
    ├── modelos/            .glb de Tripo y versiones optimizadas
    └── imagenes/           Fondos en alta resolución, retratos y referencias
```

## Probar un nivel directo

Agrega al final de la dirección:

- `#test=2-5` abre el nivel 2-5
- `#test=map2` abre el mapa del Mundo 2
- `#test=1-3;c=Juan` abre el 1-3 con Juan

## Modo online (Supabase)

- Los jugadores se registran con **usuario + contraseña** (por dentro se usa un correo sintético `usuario@senabros.vercel.app`),
  y cada uno recibe un **ID corto** tipo `SB-K7M2Q9` para que sus amigos lo encuentren.
- Se guardan en la nube: perfil, progreso y poderes. Hay solicitudes de amistad, búsqueda por usuario o ID y (próximamente) retos entre amigos.
- La llave `anon` de `js/config.js` es pública por diseño; la seguridad está en las políticas RLS de `supabase/migrations/`.
  **Nunca** subas la llave `service_role` ni la contraseña de la base de datos.
- En Supabase hay que tener **desactivado** *Authentication → Sign In / Providers → Email → Confirm email*
  (los correos son sintéticos, no se pueden confirmar).

## Multijugador en tiempo real

- Botón **EN LÍNEA** en el menú (requiere cuenta). El anfitrión crea una sala con un código de 5 letras; hasta 4 jugadores.
- Se entra con el código o por invitación de un amigo conectado (llega como aviso arriba de la pantalla).
- En el nivel cada jugador envía su posición y animación 10 veces por segundo; los demás lo ven con su instructor y su nombre.
- Se sincronizan: bugs derrotados, bloques, monedas, golpes al jefe y la meta (si uno llega, gana todo el equipo). Sin vidas que perder.
- Al terminar todos vuelven a la sala con la tabla de resultados.
- Canales privados: solo jugadores con cuenta (políticas en `supabase/migrations/20261003000000_multijugador_realtime.sql`).

### Modos y chat en línea
- **En equipo:** si caes quedas como fantasma 20 s; un compañero te revive tocándote. Si cae todo el equipo, vuelven al checkpoint.
- **Carrera:** cada uno juega su propio mundo; gana el primero en la bandera (luego hay 30 s para los demás). Ranking en vivo,
  pisar a otro jugador lo aturde y le roba hasta 3 monedas, y chocar de lado empuja. Al final, podio en la sala.
- **Chat:** tecla T (o el botón Chat) durante el nivel; también en la sala. Mensajes rápidos, texto libre (máx. 60, con filtro
  de groserías) y 8 caritas dibujadas por el juego (risa, llorón, burla, enojado, sorpresa, fuego, corazón, bien).
