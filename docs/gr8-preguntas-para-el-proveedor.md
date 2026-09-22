# Preguntas para GR8 Tech

Para enviar al proveedor en una sola consulta. Están ordenadas por **cuánto nos cuesta una
respuesta equivocada**. El detalle técnico de cada una está en `gr8-feed-notes.md` (sección
"What remains genuinely unanswered") y en el análisis de infraestructura.

Sirven para una primera integración de la **Line API** (REST, autenticada con `X-Api-Key`),
empezando por dos mercados de fútbol: resultado final (1X2) y total de goles.

---

## A. Sin esto no se puede empezar

**1. Acceso y entornos.** ¿Hay un entorno de pruebas (*sandbox*) separado de producción? ¿Cuáles
son las URLs de cada uno y cómo se piden las credenciales (`X-Api-Key`)? ¿Los datos del entorno
de pruebas se parecen a los reales?
*Por qué importa:* sin un entorno de pruebas, la primera prueba de verdad sería con dinero real.

**2. Lista de IPs autorizadas.**
- ¿Cuántas direcciones IP de origen aceptan en la lista?
- ¿Aceptan IPs **compartidas** con otros clientes de nuestro proveedor de nube, o tienen que ser
  dedicadas?
- ¿Solo IPv4, o también IPv6?
- ¿Necesitan, además, **llamarnos a nosotros** (por ejemplo, para avisar resultados)? En ese caso,
  ¿desde qué IPs?

*Por qué importa:* si aceptan IPs compartidas, alcanzan las de nuestro proveedor actual sin costo
extra. Si piden dedicadas, montamos un proxy de salida (~USD 20–45 al mes).

**3. ¿Cuál es el equipo local?** El competidor de un evento trae `id`, `name`, `icons` y `slug`,
pero ningún campo que diga si es local o visitante, y `Win1`/`Win2` están documentados por
posición. ¿`competitors[0]` es **siempre** el local, para todo deporte y todo tipo de evento?
¿Hay algún campo que lo diga explícitamente?
*Por qué importa:* si la suposición falla, **las cuotas del local y del visitante se muestran
invertidas** sin ningún error visible. El jugador apuesta al equipo equivocado.

**4. ¿Nos pueden dar el id del evento en Betradar/Sportradar?** La API expone
`hasBetradarMapping`, que demuestra que el mapeo existe, pero ningún campo trae el id. ¿Está
disponible en algún endpoint, en la API GraphQL de datos o por adenda de contrato?
*Por qué importa:* es lo que decide si **nuestra liquidación de apuestas funciona sin cambios**.
Si no está, hay que construir una liquidación propia contra los resultados de GR8.

**5. ¿Cuál es el límite de peticiones real?** La documentación dice que cada endpoint tiene el
suyo, pero no da los números. ¿Cuál es la cuota por `X-Api-Key` para `/line/events`,
`/line/events/markets` y `/localization/markets`, y es por segundo, por minuto o por día?
*Por qué importa:* define cada cuánto se actualizan las cuotas en pantalla. Pasarlo significa
errores 429 y cuotas desactualizadas en vivo.

## B. Para los dos primeros mercados

**6. ¿Cuál es la línea principal?** Un mismo mercado de totales trae varias líneas a la vez
(por ejemplo 6.5, 7.5 y 8.5). ¿`profile=main` deja una sola línea, o solo filtra tipos de
mercado? ¿Hay algún indicador de "línea principal" por ítem?
*Por qué importa:* es la cuota que mostramos por defecto en la pantalla del partido.

**7. "Market for FullTime".** En fútbol, ¿esa columna indica el **momento en que se resuelve**
el mercado (tiempo reglamentario, con alargue, con penales)?
*Por qué importa:* un "1X2" que incluye el alargue se liquida distinto que uno de 90 minutos.

**8. ¿El mapa `tradingTypes` está indexado por `resultKind`?** Lo inferimos de la documentación,
pero hay un ejemplo que lo contradice.
*Por qué importa:* sin esto, un total de **córners** podría mostrarse como un total de **goles**.
El precio sería creíble y la etiqueta, falsa.

**9. Tamaños de página (`size`).** "Solo se aceptan ciertos valores". ¿Cuáles, y cuál es el
predeterminado?

## C. Para crecer después

**10.** ¿Qué endpoint resuelve los marcadores `#player{p1}`, `#competitor{p1}` y
`{Team{p1}}`? La documentación dice que se resuelven "con una petición aparte" que no está
documentada. Hace falta para mercados de jugadores.

**11.** ¿`Statistic.typePlatformId` y `ResultKind` comparten la misma numeración?

**12.** La Line API tiene un aviso de BETA que decía "lanzamiento previsto a principios de 2026".
¿Sigue vigente? ¿Puede cambiar el contrato de la API sin aviso?

**13.** ¿Los ids de eventos, competidores y torneos se mantienen estables entre temporadas?

**14.** Cuatro endpoints de información de competidores y torneos documentan su respuesta como
`None`. ¿Cuál es el esquema real?
