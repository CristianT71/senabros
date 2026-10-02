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
│   └── touch.js            Controles táctiles y ventana de ajustes (solo en celular)
├── assets/                 Lo que carga el juego (modelos e imágenes en base64)
│   ├── enemigos.js         Robot 404, Entrega Tardía, Archivo Corrupto, café y empanada
│   ├── fondo-yamboro.js    Fondo del nivel 1-1
│   ├── retratos.js         Retratos de los instructores para el menú
│   ├── personajes/         Un archivo por instructor (modelo 3D + 12 animaciones)
│   └── fondos/             Fondos de los niveles 1-2 a 1-6 (se cargan al entrar)
└── fuentes/                Originales para editar en Blender (no se suben a GitHub)
    ├── modelos/            .glb de Tripo y versiones optimizadas
    └── imagenes/           Fondos en alta resolución, retratos y referencias
```

## Probar un nivel directo

Agrega al final de la dirección:

- `#test=2-5` abre el nivel 2-5
- `#test=map2` abre el mapa del Mundo 2
- `#test=1-3;c=Juan` abre el 1-3 con Juan
