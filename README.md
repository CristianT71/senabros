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

- 3 mundos: **Yamboró** (6 niveles), **Volcán Binario** (5 niveles, jefe: el Bug Rey) y **La Nube** (5 niveles:
  islas sobre el vacío, piso de hielo que resbala, cintas transportadoras, rayos que avisan antes de caer y el
  jefe final, el Bug Supremo, con 5 de vida y que llama rayos).
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
│   ├── premios.js          Pantallas de Ranking, Logros y Tienda
│   ├── editor.js           Editor de niveles y niveles de la comunidad
│   ├── preguntas.js        Banco de preguntas de programación (bloque </>)
│   ├── assets.js           Rutas de modelos e imágenes (y ASSET_V para forzar una versión nueva)
│   ├── libs/               Decodificador meshopt (para los .glb comprimidos)
│   └── config.js           URL y llave pública (anon) de Supabase
├── assets/                 Archivos pesados: se bajan solo cuando hacen falta y quedan en caché
│   ├── modelos/personajes/ Un .glb por instructor (modelo 3D + 12 animaciones)
│   ├── modelos/enemigos/   Robot 404, Entrega Tardía, Archivo Corrupto, café y empanada
│   ├── fondos/             Fondos de los niveles (.webp)
│   └── retratos/           Retratos de los instructores (.webp)
├── vercel.json             Caché larga para assets/ (un año)
├── supabase/migrations/    Tablas y reglas de seguridad de la base de datos (SQL)
└── fuentes/                Originales para editar en Blender (no se suben a GitHub)
    ├── modelos/            .glb de Tripo y versiones optimizadas
    └── imagenes/           Fondos en alta resolución, retratos y referencias
```

## Ranking, logros y tienda

- **Ranking semanal** (botón Ranking del menú): mejor puntaje por nivel jugando solo, carreras ganadas, más monedas en una
  batalla y oleada más alta en supervivencia. Se reinicia cada lunes (hora de Colombia); el primero lleva corona, también en la sala.
  Se escribe solo con la función `submit_score` (el servidor valida tablero y rango) y se lee con `get_ranking`.
- **Logros** (botón Logros): 17 logros que salen de contadores (`game_progress.stats`: bugs, monedas ganadas, carreras...).
- **Tienda** (botón Tienda): 13 prendas y estelas hechas en 3D que se ajustan a la cabeza y espalda de cada instructor.
  Las monedas disponibles son las monedas ganadas menos lo que costaron las prendas; las compras pasan por `buy_item`
  y `equip_items`, que revisan precio y saldo en el servidor. Los demás jugadores te ven con tu ropa en línea.
- Ojo: los contadores los envía el navegador, así que alguien con conocimientos podría inflarlos. Para un juego de
  aprendizaje está bien; si algún día hay premios reales, habría que validar las partidas en un servidor.

## Preguntas de programación (bloque </>)

- Cada nivel tiene 1 o 2 bloques azules **</>**. Al golpearlos el juego se pausa y sale una pregunta de ADSO
  con 4 opciones y 25 segundos. Acertar da +1 vida, +1000 puntos y energía llena; fallar no quita nada y muestra
  la respuesta correcta con una explicación.
- 98 preguntas en `js/preguntas.js` (lógica, HTML, CSS, JavaScript, SQL, Python, POO, Git, Scrum, UML, seguridad,
  algoritmos...). La dificultad sube con el mundo y primero salen las que el jugador no ha visto o falló.
- Se responde con el ratón, el dedo o las teclas 1-4 / A-D; Enter continúa. En línea el bloque da una moneda (no se pausa a nadie).
- Logros: Programador (10 correctas), Experto ADSO (50) y En racha (5 seguidas). En el editor está la pieza "Bloque pregunta".
- Para agregar preguntas: copiar una línea de `js/preguntas.js`, cambiar el `id` y revisar que la respuesta sea correcta.

## Editor de niveles (botón Crear)

- Cuadrícula de 14 filas y de 30 a 240 columnas, 9 escenarios y 24 piezas: suelo, ladrillo, bloques ?, hongo y piedra,
  tubos, monedas, trampolín, los 3 bugs, cañón, fuego, rayo, plataformas (ida y vuelta, ascensor, que cae), cintas,
  inicio, checkpoint y bandera. Se pinta con el dedo o el ratón; dos dedos (o la herramienta Mover) desplazan la vista.
- **Probar** abre el nivel al instante; **Guardar** lo deja en el navegador (Mis borradores).
- **Publicar** lo sube con un código `NV-XXXXX`. En **Comunidad** se ven los populares y los nuevos, se busca por nombre
  o código, se juega y se da me gusta. Enlace directo: `index.html#nivel=NV-XXXXX`.
- El servidor valida cada nivel (`publish_level`: 14 filas, solo letras conocidas, con bandera; máximo 15 por persona).
- Los niveles creados no dan monedas para la tienda, logros ni puestos en el ranking (así nadie arma niveles llenos de monedas).
- Formato: `{ v:1, W, rows:[14 textos] }`; la conversión a nivel jugable es `editorToSpec()` en `js/game.js`.

## Agregar o cambiar un modelo

Los .glb se comprimen con [gltf-transform](https://gltf-transform.dev) (geometría con meshopt y texturas WebP):

```
npx @gltf-transform/cli webp modelo.glb tmp.glb --quality 75
npx @gltf-transform/cli meshopt tmp.glb assets/modelos/personajes/Nombre.glb --level high
```

Como los assets quedan guardados un año en el navegador, si reemplazas un archivo sube `ASSET_V` en `js/assets.js`.
La calidad de gráficos (automática, alta, media, baja) se cambia en Ajustes; en automática baja sola si el juego va lento.

## Probar un nivel directo

Agrega al final de la dirección:

- `#test=2-5` abre el nivel 2-5
- `#test=map2` abre el mapa del Mundo 2 (`#test=3-4` abre la Tormenta Eléctrica del Mundo 3)
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
- **Batalla de monedas:** arena cerrada, 2 minutos. Las monedas (y alguna dorada de 5) las reparte un jugador para todos;
  quien la toca primero se la queda. Pisar a otro le roba monedas y tocar un bug quita 3. Marcador en vivo y podio.
- **Supervivencia:** en equipo contra oleadas de bugs cada vez más rápidas y numerosas; cada 5 oleadas sale el Bug Rey.
  Los caídos reviven al empezar la siguiente oleada. Si cae todo el equipo termina y se muestra la oleada alcanzada.
- **Red:** cada jugador solo envía su posición cuando cambia (y una señal de vida por segundo) para no pasar el límite de
  mensajes de Realtime; los jugadores salen escalonados para no quedar pegados.
- **Chat:** tecla T (o el botón Chat) durante el nivel; también en la sala. Mensajes rápidos, texto libre (máx. 60, con filtro
  de groserías) y 9 caritas dibujadas por el juego (risa, llorón, burla, besito, enojado, sorpresa, fuego, corazón, bien).
