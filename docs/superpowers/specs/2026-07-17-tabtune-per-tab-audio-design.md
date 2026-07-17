# TabTune — Control de volumen por pestaña (Diseño)

- **Fecha:** 2026-07-17
- **Estado:** Diseño aprobado (pendiente revisión final del spec)
- **Nombre de trabajo:** TabTune *(placeholder; el nombre definitivo es una decisión aparte)*
- **Plataformas objetivo:** Chrome, Edge, Brave, Opera, Vivaldi (navegadores Chromium, Manifest V3)

---

## 1. Resumen

Extensión de navegador **trust-first** que da control de audio por pestaña. Auto-detecta qué pestañas están reproduciendo sonido, permite **silenciar cualquiera de forma gratuita e instantánea** (sin permisos de host), y ofrece **control fino de volumen (0–100%) por sitio** mediante un opt-in de permisos recordado. El foso competitivo es la **confianza**: 100% local, sin telemetría, sin afiliados, permisos mínimos y open source.

## 2. Problema y contexto

Los navegadores basados en Chromium (incluido Edge con su barra de medios) exponen controles de reproducción (play/pausa/siguiente vía Media Session API) pero **ningún control de volumen por pestaña**. La API `chrome.tabs` solo permite silenciar de forma binaria (mute on/off), no ajustar nivel. El dolor real del usuario tiene dos caras:

1. **"Algo está gritando y no sé cuál de mis 20 pestañas es."** → necesita identificar y silenciar rápido.
2. **"Este reproductor está muy fuerte/bajo respecto a los demás."** → necesita balancear niveles.

### Panorama competitivo (resumen de investigación)

- La categoría está dominada por **boosters de una sola pestaña** (p. ej. *Volume Master*, ~6M usuarios), no por mezcladores multi-pestaña.
- Los boosters líderes usan `chrome.tabCapture`, lo que provoca su queja #1: **barra azul de "grabando" + pantalla completa rota**.
- Los mezcladores multi-pestaña reales existen pero son diminutos (cientos de usuarios) y sin marca de confianza.
- La categoría está **dañada por escándalos** (inyección de afiliados "GiveFreely"; clúster de malware "Sleeper Sound" con ~1.5M usuarios). "Sound booster" es hoy una palabra sospechosa.
- **Límite duro conocido:** ninguna extensión puede amplificar audio con DRM Widevine (Netflix, Disney+, Prime). Sin embargo, **atenuar y silenciar sí funciona** en esos sitios vía la propiedad `.volume`.

### Huecos que explotamos

1. Eliminar la barra azul / fullscreen roto (no usar `tabCapture` en v1).
2. Confianza radical (local, open source, sin afiliados, permisos mínimos).
3. Un mezclador multi-pestaña pulido con memoria por sitio.

## 3. Objetivos y no-objetivos

### Objetivos (v1)
- Auto-detección en vivo de pestañas que reproducen audio, mostradas con nombre e ícono.
- Silenciar / reactivar cualquier pestaña, gratis, instantáneo, sin permisos de host.
- Botón "Silenciar todo".
- Control de volumen fino 0–100% por sitio, con opt-in de permiso por sitio.
- Memoria por sitio: el volumen sobrevive recargas y navegación dentro del mismo origen.
- Atajo de teclado opcional para la pestaña activa.
- Enlace de donación no invasivo ("☕ Invítame un café") en el pie del panel.

### No-objetivos (fuera de v1, decisiones conscientes)
- ❌ **Boost >100%** — es lo único que obligaría a `tabCapture` (barra azul, latencia, escrutinio de la tienda). Reservado para fase 2.
- ❌ Ecualizador y mejoras de audio (bass boost, etc.) — fase 2.
- ❌ Soporte a audio generado **solo** por Web Audio API sin elemento `<audio>`/`<video>` (algunos juegos) — el mute nativo queda como respaldo.
- ❌ Firefox — APIs y modelo de permisos distintos; evaluable después.
- ❌ Cuentas de usuario, sincronización en la nube, cualquier backend.

## 4. Comportamiento del producto

### Panel (popup del ícono de la barra)
- **Encabezado:** logo + nombre + botón "🔇 Silenciar todo".
- **Sección "Sonando ahora":** lista solo las pestañas actualmente audibles, con ícono, título y dominio. Se actualiza en vivo.
- **Por cada fila:**
  - Botón **mute/unmute** — siempre disponible, sin permisos.
  - Si el sitio tiene permiso concedido: **slider de volumen 0–100%** + porcentaje.
  - Si no tiene permiso: chip **"Controlar volumen aquí →"** que dispara el opt-in.
  - Indicador de estado (sonando / silenciado).
- **Pie:** línea de confianza ("🔒 Todo local · Sin recolección de datos · Open source") + enlace de donación.

### Flujo de opt-in por sitio
1. El usuario ve una pestaña audible con mute funcional + chip "Controlar volumen aquí".
2. Clic en el chip (gesto de usuario) → `chrome.permissions.request({origins:['*://<host>/*']})`.
3. Al conceder → se inyecta el content script, aparece el slider, y el permiso + preferencia quedan recordados.
4. Al denegar → el sitio permanece en modo solo-mute.

### Atajo de teclado (opcional)
- Comando para bajar/subir/silenciar la **pestaña activa** sin abrir el panel (usa el content script si el sitio tiene permiso; si no, ofrece mute).

## 5. Arquitectura

Tres componentes + almacenamiento local:

### 5.1 Service worker (background) — "el cerebro"
- Enumera pestañas audibles con `chrome.tabs.query({audible:true})` y mantiene la lista viva escuchando `chrome.tabs.onUpdated` (cambios en `audible` / `mutedInfo`) y `chrome.tabs.onRemoved`.
- Ejecuta mute/unmute con `chrome.tabs.update(tabId, {muted})`.
- Gestiona permisos por sitio (`chrome.permissions.request` / `chrome.permissions.getAll`).
- Registra/inyecta el content script en orígenes concedidos vía `chrome.scripting.registerContentScripts` (persistente entre recargas) y `chrome.scripting.executeScript` para aplicar de inmediato.
- Es el intermediario de mensajes entre popup y content scripts.

### 5.2 Popup — "el panel" (UI)
- Al abrir, pide al service worker la lista de pestañas audibles + su estado y renderiza.
- Envía comandos (mute, set-volume, request-permission) al service worker.
- Mientras está abierto, se suscribe directamente a `chrome.tabs.onUpdated` / `onRemoved` (tiene acceso directo a la API) para mantener la lista viva sin re-abrir el panel.
- Bundle deliberadamente pequeño (**Preact**) por confianza y rendimiento.

### 5.3 Content script — "volumen fino"
- Se inyecta **solo** en orígenes concedidos.
- Ajusta `HTMLMediaElement.volume` (rango 0.0–1.0) en todos los elementos `<audio>`/`<video>`.
- Observa nuevos reproductores con `MutationObserver` y re-aplica el volumen guardado al cargar/navegar.
- Se inyecta con `all_frames: true` para alcanzar iframes del mismo origen concedido (best-effort en iframes de otro origen).

### 5.4 Decisión técnica clave: sin boost ⇒ solo `.volume`
Como v1 no amplifica por encima del 100%, **solo** usamos `HTMLMediaElement.volume` (0–1). Esto:
- **Evita por completo** el "tainting" por CORS que silencia a `createMediaElementSource` en muchos sitios.
- **Funciona incluso para atenuar en sitios con DRM** (es solo la propiedad del elemento).
- Simplifica el content script (sin grafo de Web Audio, sin documento offscreen, sin `tabCapture`).

### 5.5 Stack técnico (decidido)

| Capa | Elección | Motivo |
|---|---|---|
| Framework de extensión | **WXT** | Best-in-class 2026: cross-browser de primera clase, Vite (HMR ~200ms), activamente mantenido, adopción en producción a gran escala. |
| Lenguaje | **TypeScript** | Correctness en el manejo de tabs/permisos. |
| UI del popup | **Preact** | ~4KB; API familiar tipo React; bundle diminuto acorde a la historia de confianza. |
| Estilos | CSS Modules / vanilla | Popup pequeño; Tailwind opcional y se evita por peso. |
| Almacenamiento | `wxt/storage` (tipado) | Wrapper tipado sobre `chrome.storage`, incluido en WXT. |
| Estado | Signals (Preact) | Sin librería de estado pesada; el popup es pequeño. |
| Tests | **Vitest** (unit) + **Playwright** (E2E con extensión cargada) | Estándar; integra con Vite/WXT. |

Descartados: **CRXJS** (mantenimiento estancado 2025–2026) y **Plasmo** (superado por WXT; hay migraciones documentadas de Plasmo → WXT).

## 6. Modelo de datos (`chrome.storage.local`)

```
{
  "sitePrefs": {
    "youtube.com":  { "volume": 0.65 },
    "twitch.tv":    { "volume": 1.0 }
  }
}
```

- El nivel de volumen se guarda **por origen** (host), no por pestaña, para que se recuerde entre sesiones.
- Los orígenes concedidos también los reporta `chrome.permissions.getAll()` (fuente de verdad de permisos); `sitePrefs` guarda el nivel deseado.
- **Nota:** v1 solo guarda el volumen por sitio; un objeto `settings` (toggle de atajos, descarte de la donación) fue descartado como peso muerto hasta que exista un consumidor real.

## 7. Permisos (manifest MV3) y honestidad con el usuario

- `permissions`: `["tabs", "storage", "scripting"]`
- `optional_host_permissions`: `["*://*/*"]` — se solicitan **por sitio** en tiempo de ejecución, nunca en la instalación.
- Comandos de teclado declarados en `commands` (opcional).

**Aviso real en la instalación:** el permiso `"tabs"` hace que Chrome muestre **"Leer tu historial de navegación"** (necesario para ver nombre e ícono de las pestañas y así identificar cuál suena). Es intencionalmente mucho más suave que *"leer y cambiar todos tus datos en todos los sitios web"*, que **evitamos** al mover todos los permisos de host a opt-in por sitio. Se mitiga con transparencia: nada se envía a ningún servidor, todo es local, el código es público.

## 8. Manejo de errores y casos borde

| Caso | Comportamiento |
|---|---|
| Sitio sin reproductor detectable (Web Audio puro) | Cae a solo-mute + nota sutil "aquí solo puedes silenciar". |
| Usuario deniega el permiso | El sitio queda en modo solo-mute. |
| Sitio con DRM | `.volume` atenúa/silencia normal; sin boost (que de todos modos no existe en v1). |
| iframe de otro origen con media | Inyección `all_frames` best-effort; si falla, mute de toda la pestaña sigue disponible. |
| Pestaña cerrada o deja de sonar | Se retira de la lista (`onRemoved` / `onUpdated`). |
| Service worker suspendido (MV3) | Estado persistido en `storage`; se reconstruye al despertar por evento. |

## 9. Confianza y monetización

- **Confianza como característica:** 100% local, sin telemetría, sin afiliados, permisos mínimos, código open source verificable.
- **Donación (v1):** enlace no invasivo en el pie que abre una página externa (Ko-fi / Buy Me a Coffee). Sin popups molestos. Cumple políticas de la tienda (pago opcional, divulgado, sin engaño).
- **Cumplimiento tienda:** evitar el patrón "sound booster" en marca/marketing; declarar claramente que no funciona con DRM para prevenir reseñas de 1★ tipo "no sirve en Netflix".

## 10. Roadmap posterior a v1 (si hay apoyo de la comunidad)

- **Fase 2:** ecualizador y mejoras de audio; boost >100% (introduciría `tabCapture` + documento offscreen + nodos de ganancia, aislado y opt-in, asumiendo sus costos de latencia/indicador).
- **Decisión diferida:** si el EQ/boost fuese exclusivo para quienes donan, habría que resolver la tensión con el principio "sin cuentas / 100% local" (verificación de licencia). No se decide en este spec.

## 11. Pruebas

- **Unitarias:** lógica pura de estado y de almacenamiento (mapeo pestaña→sitio, resolución de nivel por origen, reducers del panel).
- **Manuales / E2E (extensión sin empaquetar):** validar sobre YouTube, Twitch, Spotify web, un `<video>` genérico, y Netflix (confirmar que **mute** funciona en DRM). Verificar: auto-detección en vivo, opt-in y persistencia tras recarga, "silenciar todo", atajos.

## 12. Decisiones diferidas (fuera del alcance de este spec)
- Nombre definitivo del producto.
- Modelo de monetización de la fase 2 (gratis vs. perk para quienes donan).
