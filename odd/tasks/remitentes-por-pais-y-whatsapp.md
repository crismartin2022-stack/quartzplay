# Un remitente por país, y WhatsApp de verdad

## Objective

Que el sistema pueda tener **varios remitentes de SMS**, cada uno marcado
con los países que cubre, y que WhatsApp quede listo para encenderse
cuando lleguen la plantilla y el remitente aprobados.

## Who this is for

El **dueño**, que administra los remitentes, y el **jugador**, que hoy
depende de que su país esté cubierto por el único remitente que existe.

## Por qué ahora

Hoy hay un solo remitente: `DEXATEL_SMS_FROM`, un valor suelto.

Los trámites de habilitación no coinciden entre países, así que los
remitentes se van a multiplicar quiera uno o no. Ya pasó:

```
IAQP Col   Available   AR, CO, VE
IAQP EC    Pending     EC
```

Ecuador quedó afuera del primero y hubo que pedir uno propio. Con un solo
valor en el entorno, un jugador ecuatoriano se registra bien pero no puede
verificar su teléfono, y como el teléfono destraba los retiros, termina
pudiendo depositar y jugar pero no cobrar. La peor forma de fallar.

Los remitentes no cuestan: la cuenta los reporta con `monthly_cost: 0.0` y
`setup_cost: 0.0`. Lo que sí cuesta es tener uno solo: si una operadora lo
revoca, se caen todos los países a la vez.

## Decisión de diseño: los remitentes no son secretos

Las claves de API van cifradas en `credenciales_mensajeria`, como ya están.
Los **remitentes no**: son nombres que viajan en cada mensaje y que el
jugador ve en su teléfono. Cifrarlos no protege nada y hace imposible
diagnosticar por qué un envío eligió el remitente que eligió.

Van en su propia tabla, en texto plano, con su lista de países.

## Cómo se elige el remitente

Con el país del destino, que ya conocemos: el teléfono se normaliza con
`phonenumbers` antes de mandar nada.

1. El remitente activo de ese canal cuyo listado de países incluya al país.
2. Si no hay, el remitente por defecto del canal (listado de países vacío).
3. Si tampoco hay, la variable de entorno, como hoy.
4. Si no hay nada, falla cerrado con un mensaje que nombre el país.

Ese último punto importa: "no pudimos enviarte el código" no le dice nada
a nadie. "No tenemos remitente habilitado para Ecuador" le dice al dueño
exactamente qué hacer.

## WhatsApp no es el mismo endpoint

Estaba mal previsto. Hoy `mensajeria.py` manda WhatsApp por `/v1/messages`
con `channel: WHATSAPP`, que sirve para un mensaje común pero **no para un
OTP**.

Dexatel usa `POST /v1/verifications`, y exige:

- `sender` — el remitente de WhatsApp,
- `template` — el UUID de una **plantilla aprobada** que contenga `{code}`,
- `phone`, `channel: "whatsapp"`, y `code` (el nuestro, que ya generamos).

No se manda texto libre: el texto vive en la plantilla aprobada por Meta.
Por eso `texto_del_codigo()` no aplica a WhatsApp, y la plantilla es un
dato de configuración más, no una constante del código.

Mientras no haya plantilla ni remitente, WhatsApp **no se ofrece**:
`canales_disponibles()` lo omite y la pantalla ya sabe qué hacer con eso.

## Tasks

- [ ] **R1 — La tabla de remitentes.** Migración: canal, remitente, países,
      activo, quién y cuándo. Sin cifrar, a propósito.
- [ ] **R2 — Elegir por país.** La resolución de arriba, con el respaldo en
      el entorno y el error que nombra el país. Probada sin base.
- [ ] **R3 — WhatsApp por `/v1/verifications`.** Con plantilla, y omitido
      de los canales disponibles mientras falte.
- [ ] **R4 — La pantalla.** En *Configuración → Mensajería*, agregar y
      quitar remitentes, marcando los países de la lista de Latam que ya
      devuelve `GET /api/paises`.

## Checks

- `cd bot && python -m pytest tests -q` en verde.
- Un destino de un país cubierto usa su remitente; uno sin cobertura cae al
  por defecto; sin ninguno, el error nombra el país.
- Sin plantilla de WhatsApp, WhatsApp no aparece entre los canales.
- Las pruebas de `mensajeria.py` siguen sin tocar la base.

## Delivery

`ask-on-risk`. Cuatro unidades, **en serie**: primero el backend, después
la pantalla. Dos writers en paralelo sobre este repo comparten el índice de
git y se contaminan los commits; ya pasó el 2026-09-25.
