# Las credenciales de SMS y correo, desde el panel de admin

## Objective

Que el dueño pueda cambiar el proveedor de SMS o de correo desde
**Configuración → Mensajería**, sin comandos, sin Railway y sin esperar a
nadie.

## Who this is for

El **dueño**. Hoy cambiar una credencial es un comando de Railway CLI o
entrar al panel de Railway a mano. En dos días esto ya pasó tres veces:
Twilio cerró la cuenta, se cargó Dexatel, y se corrigió el remitente.
Cada una de esas veces hubo que esperar a que alguien corriera algo.

No es comodidad: es que **el canal de verificación se cae y no hay forma
rápida de levantarlo**. Sin SMS no se retira; sin correo no se registra
nadie.

## Decisión de diseño: dónde viven los secretos

Hoy viven en variables de entorno de Railway, cifradas por la plataforma.
Moverlos a la base de datos, editables desde una pantalla web, **agranda la
superficie**: quien tenga admin, un volcado de la base o una inyección SQL
se lleva las claves del proveedor. Es exactamente la clase de riesgo que ya
costó un incidente en este proyecto.

Por eso, la forma es ésta y no "una tabla con un campo de texto":

1. **Cifrado en reposo con AES-GCM.** La llave maestra vive en el entorno
   (`SECRETOS_CLAVE`), nunca en la base. Quien se lleve la base sin esa
   llave no se lleva nada usable.
2. **El secreto no vuelve nunca al navegador.** La API devuelve una vista
   enmascarada (`e211…5194`), el proveedor, quién lo cambió y cuándo. No
   hay endpoint que devuelva el valor completo.
3. **El entorno sigue siendo el respaldo.** Si no hay fila en la base, se
   usa la variable de entorno. Nada se rompe, y producción puede seguir
   con variables si se prefiere.
4. **Cada cambio queda registrado**: quién, cuándo, qué campo. El valor no.
5. **Botón de probar.** Manda un mensaje real a un destino que escribe el
   admin, y muestra la respuesta cruda del proveedor. Hoy una credencial
   mala se descubre cuando un jugador no puede verificar.

Sin `SECRETOS_CLAVE` la pantalla no guarda nada y lo dice. Falla cerrado,
como el resto del sistema.

## Por qué se agrega `cryptography`

`bot/requirements.txt` es generado y agregar una línea cuesta regenerarlo
con docker contra tres versiones de Python. Se paga igual: la alternativa
es guardar claves de proveedor en texto plano, o escribir cifrado a mano,
que es peor que no cifrar. `cryptography` es la biblioteca estándar y
auditada para esto.

## Lo que ya existe y no hay que inventar

- **La pantalla tiene lugar**: `Admin.jsx` ya tiene la página
  *Configuración* con sub-pestañas (`TabLimites`, `TabRiesgo`, …). Esto es
  una sub-pestaña más, no una página nueva.
- **La puerta del proveedor ya existe**: `bot/mensajeria.py` y
  `bot/correo.py` leen sus credenciales con `credenciales_del_entorno()`.
  Es el único lugar que hay que tocar para que lean también de la base.
- **El guardia de admin ya existe**: `auth.require_admin`.

## Scope

Las credenciales de SMS (Dexatel) y de correo (Resend), con máscara,
bitácora y prueba de envío.

Fuera de alcance: credenciales del PSP, de Telegram y de Sportradar. Si
esto funciona, entran después por el mismo camino.

## Tasks

- [ ] **C1 — La caja fuerte.** `cryptography` en las dependencias
      (regeneradas con docker), migración con la tabla, y el módulo que
      cifra y descifra. Falla cerrado sin `SECRETOS_CLAVE`.
- [ ] **C2 — Leer de la base, con el entorno de respaldo.** `mensajeria.py`
      y `correo.py` prefieren la fila de la base y caen a la variable de
      entorno. Sin fila y sin variable, siguen fallando cerrado como hoy.
- [ ] **C3 — Los endpoints.** Listar enmascarado, guardar, y probar el
      envío. Solo admin. El valor completo no vuelve nunca.
- [ ] **C4 — La sub-pestaña.** *Configuración → Mensajería*, con el estado
      de cada proveedor, el campo para pegar la clave, y el botón de
      probar que muestra lo que contestó el proveedor.

## Checks

- `cd bot && python -m pytest tests -q` en verde.
- Sin `SECRETOS_CLAVE`, guardar falla con un mensaje claro y no escribe.
- Ningún endpoint devuelve el secreto completo: se prueba explícitamente.
- Con una fila cargada, el envío usa esa credencial y no la del entorno.
- Borrada la fila, vuelve a usar el entorno sin reiniciar.

## Delivery

`ask-on-risk`. Cuatro unidades. El dueño aplica la migración y mergea.
