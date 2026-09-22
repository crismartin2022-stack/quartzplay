# La ruleta 3D está desactivada

**Desde:** 2026-09-22 · **Motivo:** decisión de negocio. Puede volver más adelante.

La ruleta 3D es la pantalla `frontend/src/Casino.jsx` (la rueda de `Rueda3D.jsx` con el
crupier), respaldada por el servicio IAQP (`api-casino.iaqp.lat`, código en el repositorio
`IAQP/`, con su propia base en Supabase).

**Se desactivó, no se borró.** El código de la pantalla, sus componentes y el servicio IAQP
quedan intactos. Volver a activarla está al final de este documento.

## Qué la apaga

1. **En el código** — `frontend/src/features.js`: `ROULETTE_ENABLED = false`. Las dos
   entradas a la ruleta —la ruta `/casino` y cualquier dominio listado en
   `REACT_APP_CASINO_HOSTS`— muestran un aviso con un enlace de vuelta a la app. Lo cuida
   `rouletteSwitch.test.js`, que falla si alguna de las dos entradas queda conectada directo
   a la mesa.
2. **En la infraestructura** — el servicio IAQP detenido en Railway, en staging y en
   producción. Es un paso del dueño, en el orden de abajo.

### Lo que NO la apaga

El interruptor de productos del panel de admin ("prender o apagar un producto en todo el
sistema", `POST /api/admin/productos/catalogo`) **no frena las apuestas de la ruleta**. Las
apuestas llegan del servicio IAQP a la billetera de QuartzPlay por un camino de servicio a
servicio (`requiere_servicio`, `bot/casino_api.py:19264`) que no consulta los permisos de
producto. Apagar "ruleta" ahí solo la saca de las pantallas de permisos de agencia.

## El orden importa: primero se vacía, después se apaga

La ruleta paga en dos tiempos. Si una llamada a la billetera falla, el movimiento queda
`pendiente` en `iaqp_movimientos` y un proceso lo reintenta cada minuto. **Si se detiene el
servicio con movimientos pendientes, un jugador que ganó se queda sin cobrar** hasta que el
servicio vuelva.

### Paso 1 — Código (este PR)

Merge a `staging`, verificar que `/casino` muestra el aviso. Después, release a `main`.

### Paso 2 — Staging

Mismo procedimiento que producción, sin jugadores reales. Sirve de ensayo.

### Paso 3 — Producción, después del despliegue del frontend

**a. Esperar.** Un jugador con la pestaña abierta puede seguir apostando hasta que recargue.
Dejar pasar al menos 30 minutos desde el despliegue.

**b. Control, en la base de IAQP, solo lectura:**

```sql
-- La última apuesta tiene que tener más de 30 minutos.
SELECT max(creada_en) AS ultima_apuesta FROM iaqp_apuestas;

-- Rondas todavía sin resolver que tengan apuestas adentro. Tiene que dar 0.
-- (Una ronda abierta sin apuestas es normal: el motor abre la siguiente solo.)
SELECT count(*) AS rondas_con_apuestas_sin_resolver
FROM iaqp_rondas r
WHERE r.estado IN ('abierta', 'cerrada')
  AND EXISTS (SELECT 1 FROM iaqp_apuestas a WHERE a.ronda_id = r.id);

-- Plata en tránsito. Tiene que venir vacío.
SELECT estado, count(*) FROM iaqp_movimientos
WHERE estado IN ('pendiente', 'trabado') GROUP BY estado;
```

- Si hay `pendiente`: esperar unos minutos; el reintentador los levanta solo.
- **Si hay `trabado`: no apagar.** Un `trabado` es plata de un jugador que el sistema no
  pudo resolver solo. Se resuelve primero, a mano.

**c. Detener el servicio IAQP en Railway:** Deployments → menú ⋮ del despliegue activo →
**Remove**. No borrar el servicio, sus variables ni su dominio. "Remove" detiene el servicio
sin eliminarlo; mientras está detenido no genera costo de cómputo, solo el de disco.

**d. Verificar:** `https://api-casino.iaqp.lat/salud` deja de responder y
`https://juego.iaqp.lat/casino` muestra el aviso.

### Paso 4 — Opcional: cerrar también la billetera de servicio

Con IAQP detenido nadie llama a la billetera de servicio, así que no hace falta. Si se quiere
cerrar la puerta igual: quitar `IAQP_SERVICE_KEY` de las variables de la API de QuartzPlay.
La billetera responde 503 "Billetera de servicio no configurada".

**Solo después del paso 3b.** Sin esa clave, los pagos pendientes no se pueden cobrar.

## La base de IAQP no se toca

No borrar el proyecto de Supabase de IAQP ni sus tablas. Guardan el historial de rondas,
apuestas y movimientos de dinero de los jugadores, y las semillas (`iaqp_semillas`) que
permiten demostrar que cada resultado fue justo. Si más adelante se decide bajar su costo, es
una decisión aparte, con el historial exportado antes.

Los cierres de admin y agencia **siguen mostrando la ruleta** en el histórico: esos datos
viven en la base de QuartzPlay, no en el servicio IAQP. Apagar el servicio no los rompe.

## Volver a activarla

1. `ROULETTE_ENABLED = true` en `frontend/src/features.js`, y actualizar la expectativa en
   `rouletteSwitch.test.js` en el mismo PR, a propósito.
2. En Railway: menú ⋮ del despliegue removido de IAQP → **Redeploy**.
3. Si se quitó `IAQP_SERVICE_KEY` de la API, restaurarla.
4. **Antes de escalar:** las mesas viven en la memoria del proceso (`IAQP/main.py:79`). Con dos
   copias, cada una gira su propia ruleta con su propio azar. Hace falta un motor único
   autoritativo, con otro en espera. Ver `analisis-infraestructura/infraestructura-escalado.md`.
