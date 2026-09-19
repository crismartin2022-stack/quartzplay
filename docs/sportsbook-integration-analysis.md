# Sportsbook provider integration — map of our side of the boundary

Read-only analysis, written before the new provider's documentation arrived. Scope:
`bot/casino_api.py` (~27,000 lines) and `bot/config.py`. Every claim below is cited as
`file:line`. Where something could not be confirmed by reading the code, it is stated
as "not determined" rather than guessed.

This is a map, not a design. It does not recommend a provider or propose an adapter
shape.

---

## 1. What we have today

Two prematch providers coexist through `all_markets()`
(`bot/casino_api.py:18944`):

```python
async def all_markets():
```

Its docstring (`:18945-18958`) is explicit about why and about the risk:

- **Primary: Sportradar.** "La fuente principal es Sportradar: el event_id que se
  guarda al apostar es el mismo que consulta la liquidación, que era justamente lo
  que fallaba con The Odds API."
- **Fallback: The Odds API**, only if Sportradar's cache comes back with zero events
  (`:18963`, guarded by `sum(len(d.get("events") or []) for d in ...) > 0`). An empty
  `sports` list is not enough to skip the fallback — Sportradar can return a non-empty
  `sports` array with no events and the code still falls back
  (comment at `:18960-18962`).
- **Known consequence, stated in the docstring itself** (`:18955-18957`): "los
  event_id de las dos fuentes son distintos, así que los boletos tomados durante un
  respaldo pueden necesitar liquidación manual." When the fallback is active, tickets
  carry Odds-API identifiers, and (see §4) the settlement path that actually runs in
  production only understands Sportradar identifiers by direct lookup — everything
  else is settled by fuzzy name+date matching.

Production state today: **Sportradar answers HTTP 403 on the configured plan, so
production runs permanently on the fallback** (operator-confirmed; not something the
code itself can state, since the code has no awareness of the account's plan beyond
whatever status code the API returns at `:19963-19967`). This means the fallback path
described throughout this document is not a rare failure mode — it is the live catalog
source, which increases the importance of every catalog-shape/identity difference
documented below.

### The two catalog builders

`_armar_all_markets()` (`:18982`, The Odds API) and `_sr_armar_all_markets()`
(`:20298`, Sportradar) both populate the same top-level shape —
`{"sports": [{"key", "name", "icon", "events": [...]}]}` — so the frontend does not
need to know which provider answered. Field-by-field, per event:

| Field | The Odds API (`_armar_all_markets`, `:19022-19038`) | Sportradar (`_sr_armar_all_markets`, `:20341-20355`) |
|---|---|---|
| `id` | Odds API event id, `ev.get("id","")` | Sportradar `sport_event.id`, e.g. `sr:sport_event:...` |
| `event_id` | **Not set.** This key is absent from the dict. | `ev.get("id")` — same value as `id`, duplicated under this key |
| `sport_key` | Odds API sport key, e.g. `soccer_argentina_primera_division` | App-internal alias defined in `SR_DEPORTES_TODOS` (`:20224-20228`), e.g. `soccer_sr`, `basketball_sr`, `tennis_sr` — **not** a Sportradar id |
| `h`, `a` | `home_team`, `away_team` from the API | Competitor names from `competitors[qualifier=home/away]` |
| `time` | Localized `dd/mm HH:MM` string in `TZ_CASA`, derived from `commence_time` (`:19018-19019`) | Same derivation, from `start_time` (`:20335-20339`) |
| `commence_time` | Raw ISO-8601 string, `ev.get("commence_time","")` (`:19016`, `:19031`) | Raw ISO-8601 string, `ev.get("start_time")` (`:20348`) |
| `markets` | `{market_key: {outcome_name: price}}` via `parse_markets()` (`:17300-17329`), keys are Odds-API market keys (`h2h`, `totals`, `spreads`, ...) | Same shape, produced by `_sr_mercados_formato_app()` (`:20245-20295`), which normalizes Sportradar's market names into the app's expected keys (`h2h`, `totals`, `btts`, `spreads`, or a lower-cased passthrough) |
| `odds` | `{"L","E","V"}` shortcut for home/draw/away derived from `markets["h2h"]` | Same shortcut, same derivation |

**Confirmed differences that matter to a consumer:**

1. **`event_id` presence.** Sportradar events carry both `id` and an explicit
   `event_id` key with the same value (`:20343-20344`). The Odds API builder never
   sets `event_id` at all (`:19022-19038` — only `id` is set). Any code that reads
   `ev.get("event_id")` directly against an Odds-API-sourced catalog event gets `None`.
   Every call site found reads `ev.get("id")`, not `ev.get("event_id")`, when pulling
   from the catalog (`buscar_cuota_nuestra` doesn't read it directly; `candidatos_parecidos`
   at `:21954` reads `ev.get("id")`; `evento_opciones` at `:21986` reads `ev.get("id")`),
   so this asymmetry has not caused a visible bug in the catalog-read paths — but it is
   a landmine for new code that copies the Sportradar dict shape and assumes
   `event_id` is always populated.
2. **`commence_time` — the incident the task description points to.** The comment at
   `:19026-19031` in the Odds-API builder states explicitly: *"Hora cruda en ISO, bajo
   la misma clave que arma el catálogo de Sportradar: la usa `_inicio_mas_proximo`
   para decidir si una agencia puede anular. `time` ya perdió el año y quedó en huso
   local, así que no sirve para eso."* In other words: `commence_time` was **added
   after the fact** to the Odds-API builder specifically because `_inicio_mas_proximo`
   (`:13076`, used by the cancellation rule, see §3/§4) depends on that exact key
   existing and being a raw ISO string. Before that fix, an Odds-API-sourced pick
   would have had no usable start time for the anti-cancellation-near-kickoff check.
   This is the "already caused a production incident" the task description refers to;
   the fix is in place today, but it is fragile precisely because it lives as a
   parallel manual convention between two unrelated builders rather than a shared
   contract.
3. **`sport_key` namespace collision risk.** The Odds API uses provider-native league
   keys (`soccer_argentina_primera_division`, etc., listed at `:17640-17659` /
   `:17662-17697`). Sportradar uses three fixed app-internal aliases
   (`soccer_sr`, `basketball_sr`, `tennis_sr`, `:20224-20228`). These two namespaces
   never overlap today, but nothing enforces that — a new provider that reuses either
   convention risks silent misrouting in code that switches behavior by `sport_key`
   (e.g. `_armar_live`'s `es_futbol = sk.startswith("soccer")` at `:18267`).
4. **`status`.** `_sr_evento_a_app()` (used by a separate Sportradar odds-comparison
   path, `:20125-20156`) includes `"status": ev.get("status")`. Neither catalog
   builder used by `all_markets()` includes a `status` field on the event dict at all
   — event state (live/finished) is not part of the prematch catalog contract.

### Every other place a provider is called

- **Live odds**: `_armar_live()` (`:18228`) — **The Odds API only.** There is no
  Sportradar path for live odds; Sportradar is used only to backfill live **scores**
  (see below), never live prices. This means even when Sportradar is the prematch
  source of record, in-play odds always come from The Odds API, with `id` (not
  `event_id`) as the identifier (`:18280`).
- **Live scores (secondary, cosmetic)**: inside `_armar_live()`, scores are filled
  first from a third provider, RapidAPI's `free-api-live-football-data`
  (`FOOTBALL_API`/`FOOTBALL_HEADERS`, `:17195-17202`, call at `:18296-18300`), matched
  by team-name (`match_teams`, `:18310-18314`); then, for events still missing a
  score, from Sportradar via `_sr_live_cacheado()` (`:20716`, called at `:18332`),
  matched by normalized team-name pair (`_sr_normalizar`, `:20659`, keys built as
  `f"{ch}|{ca}"` at `:20338-20341`). Neither of these two score sources is keyed by
  the event id that the odds came from — both are name-matched.
- **Results/settlement feeds**: two independent, non-interoperable paths — see §4.
- **Sportradar-specific endpoints** used outside the main catalog:
  - `_sr_get()` (`:19953`) — Soccer API v4 (`SPORTRADAR_BASE`, `:19950`), used for
    match summaries/statistics (`_sr_resultado`, `:20727`; `partido_stats`, `:20803`;
    `partido_previa`, `:20832`) and schedule lookup by day
    (`_sr_buscar_partido`, `:20752`).
  - `_sr_odds_get()` (`:19974`) — Odds Comparison Prematch v2
    (`SR_ODDS_BASE`, `:19972`), a **separate Sportradar product** from the one used by
    `_sr_armar_all_markets`. It has its own event-shape converter
    (`_sr_evento_a_app`, `:20125`) and its own cache
    (`_sr_partidos_cacheados`/`_sr_partidos_cache`, `:20178-20195`, TTL
    `_SR_PARTIDOS_TTL = 180s`, `:20179`). It does not appear to feed `all_markets()`;
    it looks like an alternate/earlier integration surface. Not determined: which UI
    surface, if any, currently consumes `_sr_partidos_cacheados`/`_sr_evento_a_app` —
    no call site to a `/api/...` route was found for it in the sections read.
- **Cache wrappers and TTLs**:
  - `_football_cache` (`:17201`) — a plain `dict` of `{key: (data, timestamp)}`, used
    as the backing store for essentially every cached feed in the file (prematch,
    live, sports list, all-markets, ai_combos, etc.).
  - `cache_swr(clave, ttl, productor)` (`:17599`) — stale-while-revalidate wrapper:
    fresh → return cached; stale → return stale value immediately and refresh in the
    background (`asyncio.create_task`); empty → the caller waits once
    (`:17599-17634`). Used by the Odds-API fallback builder (key `"all_markets"`,
    TTL `ODDS_TTL_PREMATCH`) and by live-combined (key `"live_combined"`, TTL
    `ODDS_TTL_LIVE`).
  - `_sr_all_markets_cacheado()` (`:20366`) — Sportradar's own cache, **not** built on
    `cache_swr`; a hand-rolled cache that (a) only overwrites the cached value if the
    new fetch actually has events (`:20377-20382`, "mejor tener dos deportes
    cacheados que volver a pedir los seis"), and (b) on exception, returns the last
    good cache if one exists, else an explicit `{"sports": [], "fuente":
    "sportradar", "error": "..."}" (`:20387-20393`). TTL: `_SR_ALL_TTL`, env
    `SR_TTL`, default `2700` s / 45 min (`:20239`).
  - `_sr_partidos_cacheados()` (`:20181`) — separate cache for the Odds-Comparison-v2
    surface, TTL 180 s (`_SR_PARTIDOS_TTL`, `:20179`).
  - `_sr_odds_sports()` (`:19999`) — sports list cache for that same surface, TTL
    3600 s hardcoded (`:20003`).
  - Relevant TTL env vars (all read at `:17214-17217`, defaults shown):
    `ODDS_TTL_PREMATCH=180`, `ODDS_TTL_LIVE=45`, `ODDS_TTL_EVENTO=120` (`:17289`),
    `SR_TTL=2700` (`:20239`).

---

## 2. The seam — functions a provider (or an adapter) must satisfy

These are the functions the rest of the system actually calls to read provider data.
A new provider either has to be shaped so these keep working unchanged, or a
translation layer has to sit in front of them.

- **`all_markets()`** — `bot/casino_api.py:18944`. No arguments. Returns
  `{"sports": [{"key": str, "name": str, "icon": str, "events": [event, ...]}], "fuente"?: str}`.
  `event` shape as documented in §1 (differs slightly by source — see the diff table).
  This is the single top-level prematch catalog entry point; almost everything else
  in the file reads through it, directly or via one of the caches it populates.

- **`buscar_cuota_nuestra(home, away, market, selection)`** —
  `bot/casino_api.py:21845`. Reads `await all_markets()` (`:21852`), then matches the
  event by team name in both orientations (`match_teams` / `_mismo_club`,
  `:21863-21868`) and returns `(cuota, ev)` — either a numeric odd and the matched
  event dict, or `(None, ev)` if the match was found but not the market, or
  `(None, None)` if no event matched at all. **This function never uses `event_id` —
  identity here is entirely by team-name matching**, which is why the two-orientation
  and "same club, different spelling" (`_mismo_club`, `:18048`) logic exists.

- **`candidatos_parecidos(home, away, limite=4)`** — `bot/casino_api.py:21932`. Also
  reads `await all_markets()` (`:21940`) — same source as `buscar_cuota_nuestra`, and
  the docstring at `:21937-21939` explicitly calls out why that matters: *"Si cada una
  mira un catálogo distinto pasa lo peor: el escáner dice 'no encontrado' y el
  corrector muestra el evento enseguida."* Returns a list of up to `limite` dicts:
  `{"home", "away", "event_id": ev.get("id"), "sport_key", "opciones":
  opciones_de_evento(ev), "parecido": float 0..1, "commence_time"}`, ranked by fuzzy
  name similarity (`score_equipos`, `:17884`) against a 0.55 threshold (`:21949`).
  Note the returned key is called `event_id` but its value is `ev.get("id")` — i.e.
  this function papers over the very inconsistency documented in §1(1).

- **`opciones_de_evento(ev)`** — `bot/casino_api.py:21913`. Synchronous. Takes one
  catalog event dict (the same shape `all_markets()` produces) and returns a flat list
  of bettable options: `[{"sel": str, "odd": float, "mkt": str}, ...]`, built only
  from `ev["markets"]["h2h"]` and `ev["markets"]["totals"]`. It does not touch
  `spreads`/`btts`/anything else even though those keys can be present in `markets`.

- **`evento_opciones` (route `/api/evento-opciones`, `:21961`) and `buscar_eventos`
  (route `/api/buscar-eventos`, `:21992`)** — **read a different source than the three
  functions above.** Both read `_football_cache.get("all_markets")`, falling back to
  `cache_swr("all_markets", ODDS_TTL_PREMATCH, _armar_all_markets)`
  (`:21969-21974`, `:22001-22006`). That is **The Odds API fallback builder
  specifically**, not `all_markets()`'s Sportradar-first result. This is a real,
  confirmed inconsistency in the current seam: while Sportradar is the primary
  source, these two endpoints (used to correct a misread pick and to search events by
  team name) are working off a different, and in production largely stale/empty
  (since Sportradar is primary and the Odds-API cache only fills on a real fallback
  event, or from whatever last populated `_football_cache["all_markets"]`), catalog
  than the one the client actually saw. Not determined from static reading alone
  whether this is dead/legacy code, a deliberate choice, or an unnoticed bug — it
  should be an explicit question when the new provider's docs land and this seam gets
  redesigned, because a new provider adapter must decide whether these two endpoints
  are back-ported to `all_markets()` or left on their historical path.

- **`_buscar_resultado_evento(event_id)`** — `bot/casino_api.py:7612`. Also reads
  `await all_markets()`, matches by `str(ev.get("id")) == str(event_id)`
  (`:7618`), and returns a human-readable score string or `None`. This is a
  **display-only helper** (used to show "why can't I settle this" context), not part
  of the settlement transaction itself.

- **`validar_cuotas(picks)`** — `bot/casino_api.py:18161`. Not in the task's explicit
  list but part of the real seam: every stored-odd write path calls it
  (`create_betslip` at `:15717`, `crear_apuesta` at `:15858`). It builds its own index
  via `construir_indice_odds()` (`:17971`), which merges **five different cache
  buckets by team name** — Sportradar cache (`:17980-17988`), the legacy Odds-API
  `"all_markets"` cache (`:17991-18000`), `"prematch_all"` (`:18002-18006`),
  `"live_combined"` (`:18008-18011`), and `"ai_combos"` (`:18013-18016`) — none of
  this indexing uses `event_id` at all; it is keyed purely by
  `(normalize_name(home), normalize_name(away))` (`:17917`). A provider integration
  therefore also has to be compatible with **name-based odds cross-checking**, fully
  independent of whatever identifier scheme it uses for settlement.

---

## 3. The data contract — what a stored pick carries, and who reads each field

**Important correction to the task's assumed shape**: reading the actual
construction code for both write paths —
`create_betslip` (`bot/casino_api.py:15647`, pick assembly at `:15669-15695`) and
`crear_apuesta` (`bot/casino_api.py:15767`, pick assembly at `:15807-15833`) — the
per-pick dict that actually gets persisted (as `str(limpios)` in the `betslips.picks`
column, e.g. `:15752`, `:15895`) is:

```python
{"home": str, "away": str, "sel": str, "odd": float, "sport": str,
 "event_id": str|None, "sport_key": str|None, "commence_time": str|None}
```

**`market` is parsed from the request body (`p.get("market")`, `:15819`,
`:15834`) but is never written into the stored pick dict.** It is only appended to a
transient sibling list, `mercados` (`:15834-15835`), used solely for a same-market
bonus-eligibility check (`_validar_apuesta_bono(..., mercados[0] if len(mercados)==1
else None, ...)`, `:15925`) that only fires when the whole slip is a single pick.

This matters because several downstream readers do call `p.get("market")` (or
`p.get("mercado")`) **on the stored pick**, and will silently get `None` → default to
`"h2h"`, every time, for every bet placed through either endpoint:

- `_picks_bloqueados()` (`:5682`) — `mk = p.get("market") or p.get("mercado") or
  "h2h"` (`:5700`), used to check per-market blocks (`datos["mercados"]`,
  `:5717-5725`). In practice, market-level blocks can only ever match picks whose
  effective market is `"h2h"`, because that's what every stored pick defaults to.
- `_aplicar_ajuste()` call site in `crear_apuesta` — `p.get("market") or "h2h"`
  (`:15970`), used to look up an admin odds adjustment for that event/market/
  selection.
- `_registrar_exposicion()` (`:19272`) — writes `(p.get("market") or "h2h")[:40]`
  into `exposicion.mercado` (`:19285`), which is only used for the admin risk
  breakdown by market (`admin_exposicion`, `:19325-19341`) — display/reporting, not a
  gating check.

Confirmed **not** affected: `_controlar_riesgo()` (`:19300-19322`), the actual
same-selection exposure cap, groups strictly by `event_id` + `sel` text
(`:19312-19319`) — it never reads `market`, so the missing-market gap does not weaken
the risk-cap enforcement itself, only the per-market **block** feature and the
market-breakdown report.

**Per-field consumers, confirmed by reading:**

| Field | Written by | Read by (confirmed) |
|---|---|---|
| `home`, `away` | client-supplied team names, truncated to 80 chars (`:15674-15675`, `:15813-15814`) | `buscar_cuota_nuestra`, `candidatos_parecidos`, `_picks_bloqueados` (display label, `:5701`), `_inicio_mas_proximo` (indirectly, via `commence_time` only — not name), `resolver_pick`/`resolver_pick_sr` (settlement, needs home/away to interpret "X gana"), `_sr_buscar_partido` (settlement fallback match by name, `:20752`), `apuestas_del_evento` admin view (`:5770`) |
| `sel` | client-supplied selection text, truncated to 120 chars | `resolver_pick`/`resolver_pick_sr` (parses the text — "gana", "Más de", "Ambos anotan", etc. — this is a **text-matching settlement engine**, not a structured market/outcome code), `_exposicion_de`/`_controlar_riesgo` (risk cap key), `_registrar_exposicion` (reporting) |
| `odd` | client-supplied, validated `1.01 <= odd <= MAX_ODD_PICK=20.0` (`:15573`, `:15686`, `:15824`), cross-checked against the feed by `validar_cuotas` | combined into `odd_total`, used for potential-win / boost calculation, and — critically — **is not re-derived from the provider at settlement time**; only the outcome (win/lose) is computed from provider results, the payout is whatever `odd_total`/`potential_win` was frozen at bet time |
| `sport` | client-supplied free text, truncated to 60 chars | display only in the paths read (no gating logic found reading `sport` — sport-level blocking uses `sport_key`, not `sport`) |
| `event_id` | client-supplied, `p.get("event_id") or p.get("id")`, truncated to 64 chars (`:15680`, `:15817`) | `_picks_bloqueados` (event-level block match, `:5704`), `_registrar_exposicion`/`_controlar_riesgo`/`_exposicion_de` (risk-cap grouping key), `_inicio_mas_proximo` — **not directly**, it uses `commence_time`, not `event_id` — `auto_liquidar` (Odds-API settlement, grouping key, `:16672-16673`, `:16687`), `sportradar_liquidar` (Sportradar settlement, direct-lookup key when prefixed `sr:sport_event:`, `:20935`), `apuestas_del_evento` admin view (`:5766`) |
| `sport_key` | client-supplied, truncated to 60 chars | `_picks_bloqueados` (sport-level block, `:5711`), `auto_liquidar` (groups event ids to fetch by Odds-API sport key, `:16672-16677`) — **`sportradar_liquidar` does not use `sport_key` at all** |
| `commence_time` | client-supplied, from `p.get("commence_time") or p.get("start_time")`, truncated to 40 chars, or `None` | `_inicio_mas_proximo()` (`:13076`) — the **only** consumer, and it is a hard requirement for the anti-cancellation-near-kickoff rule in `_puede_anular` (§4) — also read informationally in `sportradar_liquidar`'s date hint for name-matching (`:20898`, `:20964-20965`) |

`market` is not part of this list as a stored field for the reason explained above —
it exists only transiently at request-parse time in `crear_apuesta`, never in
`create_betslip` even transiently (that endpoint doesn't collect a `mercados` list at
all — checked `:15669-15696`, no `market` handling present), and never in the
persisted pick dict in either endpoint.

---

## 4. Settlement and identity

**There are two separate, non-interoperable settlement paths**, and which one a given
pick can be settled by depends entirely on what identifiers it was stored with.

### Path A — `/api/agencias/me/auto-liquidar` (`:16641`), agency self-service

Pulls pending betslips for the calling agency (`:16651-16658`), groups pick event ids
by `sport_key` (`:16665-16677`), and calls `_traer_resultados()` (`:16617`), which
hits **The Odds API's `/v4/sports/{sk}/scores/` endpoint**, requesting exactly the
event ids collected (`eventIds` param, `:16628-16629`). It matches a pick's result
purely via `resultados.get(p.get("event_id") or p.get("id"))` (`:16687`) — a direct
dictionary lookup, no name matching at all. This only works when:

- `sport_key` on the pick is a valid Odds-API sport key, **and**
- `event_id` on the pick is a valid Odds-API event id for that sport.

Any pick whose `event_id`/`sport_key` came from Sportradar (`soccer_sr`, a
`sr:sport_event:...` id) will never be found by this path — `_traer_resultados` would
be asked for an Odds-API sport that doesn't exist, so it silently returns nothing for
that pick, and the pick ends up in `sin_resolver` (`:16703-16705`).

### Path B — `/api/admin/sportradar/liquidar` (`:20913`), admin-only

Pulls all pending betslips system-wide (`:20920-20926`, capped at 200), and for each
pick calls `_resultado_de(home, away, fecha, event_id)` (`:20933`), which:

1. **If `event_id` starts with the literal prefix `"sr:sport_event:"`** — looks the
   result up directly via `_sr_resultado(event_id)` (`:20938`, hits Sportradar's
   `/sport_events/{id}/summary.json`). This is a direct-id match, exactly analogous to
   Path A, but Sportradar-specific and hardcoded to that one id format.
2. **Otherwise** — falls back to `_sr_buscar_partido(home, away, fecha)`
   (`:20944`), which searches Sportradar's own daily schedule
   (`/schedules/{date}/summaries.json`) for a competitor pair matching the *stored
   pick's team names*, normalized (`_sr_normalizar`, exact match required after
   normalization — not fuzzy — `:20774`), within a `±3`-day window if no date is
   given (`:20758-20760`) or the exact date derived from `commence_time` if present.

So identity resolution for settlement is: **`event_id` by direct lookup only if it is
already a Sportradar id in Sportradar's own format; every other pick — including
Odds-API-sourced picks taken during a fallback window, and (this is the important
part for a new provider) any future third-provider id — falls through to a **team-name
+ date fuzzy match against Sportradar's own schedule**, never against the provider the
pick actually came from. There is no generic "ask the original provider for this
event_id" abstraction; the Sportradar-specific prefix check is the only
provider-discrimination logic that exists in the settlement path.

**Direct confirmation of the docstring's warning**: a pick placed while `all_markets()`
was serving the Odds-API fallback (i.e. `event_id` is an Odds-API id, not prefixed
`sr:sport_event:`) will, in `sportradar_liquidar`, skip the direct-id branch and be
resolved (if at all) purely by matching `home`/`away`/`commence_time` against
Sportradar's schedule — i.e. **exactly the "puede necesitar liquidación manual"**
scenario the `all_markets()` docstring describes, and it is not hypothetical: since
production runs on the Odds-API fallback permanently (Sportradar 403), **every single
pick currently placed in production has an Odds-API-shaped `event_id`, so every
settlement in production today goes through the name+date fallback path, never the
direct-id path.** Path A (agency self-service) is the one that would actually match
these picks directly by id (since they are Odds-API ids) — but only if `sport_key` is
also an Odds-API key, which it is in the current all-fallback state. There is a
diagnostic endpoint for exactly this failure mode:
`/api/admin/sportradar/diagnostico-liquidacion` (`:20874`), which reports per-pick
whether a Sportradar match was found and what score it has.

**For a new provider**, this means settlement identity is the single hardest
constraint to satisfy cleanly: either (a) the new provider's ids get their own
hardcoded-prefix branch added next to the `sr:sport_event:` check, (b) a generic
provider-tagged-id abstraction gets introduced (none exists today), or (c) the new
provider's picks settle purely by name+date matching against whichever provider's
schedule the settlement code queries — which today is always Sportradar's, regardless
of where the pick's odds came from.

**Payout on settlement** (`:20982-21004`): once all picks in a slip resolve
(none `None`), the slip wins only if every pick resolved `True`
(`gano = all(e is True for e in estados)`, `:20982`); the payout amount is
`potential_win`, which was frozen at bet-placement time from the client-submitted
`odd`/`stake` (see §3) — settlement never re-derives the payout from a live odd, it
only decides win/lose per pick via text parsing of `sel` against the final score
(`resolver_pick`/`resolver_pick_sr`, `:16568`/`:16512`), which understands **goals-based
1X2, totals, and BTTS from any provider's score**, plus (Sportradar-only, because it
needs live statistics that only Sportradar's summary endpoint provides today) corners,
cards, and shots (`resolver_pick_sr`, `:16537-16562`). Anything else (handicaps,
correct score, player props, first-half markets) is explicitly excluded from
auto-resolution (`NO_ES_GOLES` list, `:16591-16593`) and falls to manual settlement
regardless of provider.

---

## 5. Configuration and failure behaviour

- **Provider keys are read directly from `os.environ` inline in `casino_api.py`, not
  through the `bot/config.py` fail-closed settings boundary.** `bot/config.py`
  (`RuntimeSettings`, `:24-34`) validates database URL, allowed origins, Telegram
  identity, PSP webhook secret, and public URLs — it has no knowledge of
  `ODDS_API_KEY`, `SPORTRADAR_KEY`, `SPORTRADAR_ACCESS`, `SPORTRADAR_LANG`, or any of
  the odds-related TTL/limit env vars. Those are each read ad hoc with
  `os.environ.get(..., default)` at their point of use, e.g.
  `SPORTRADAR_KEY = os.environ.get("SPORTRADAR_KEY", "")` (`:19947`),
  `ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")` (re-read locally in at least 8
  different functions, e.g. `:16623`, `:18229`, `:18385`, `:18983`). A missing key is
  never a startup-time failure for the app as a whole — it degrades a specific
  provider call at request time (see next point). This is a real difference from how
  the rest of the app treats configuration (fail-closed, validated once, typed) and
  would be a design question for a new provider's key(s).
- **Sportradar failure behaviour**: `_sr_get()` (`:19953-19968`) — no key configured
  → `HTTPException(503, "Sportradar no configurado (falta SPORTRADAR_KEY)")`;
  HTTP 429 from the provider → `HTTPException(429, "Sportradar: límite de requests
  alcanzado")`; any other ≥400 → logs the body (truncated to 200 chars) and raises
  `HTTPException(502, ...)`. `_sr_all_markets_cacheado()` (`:20366-20393`) catches all
  of that at the catalog-build level: on any exception it logs, returns the last good
  cache if one exists, or an explicit empty catalog with an `"error"` field
  (`:20392-20393`). **This is exactly the 403 scenario in production**: `_sr_get`
  would raise `HTTPException(502, ...)` (403 falls into the generic ≥400 branch, not
  the dedicated 429 branch), `_sr_armar_all_markets` doesn't catch that per-day/per-sport
  fetch itself except around the network call at `:20308-20318` (which does catch and
  log, continuing to the next day/sport), so a full-scope 403 across all configured
  sports/days results in `_sr_armar_all_markets` returning `{"sports": [], "fuente":
  "sportradar"}` with no exception at all — which is exactly the condition
  `all_markets()` checks at `:18963` to trigger the Odds-API fallback.
- **The Odds API failure behaviour**: `odds_get()` (`:17566-17593`) never raises — it
  returns `None` on any transport error, non-200 status, or unparseable JSON, and logs
  a specific message for 422 (unsupported market), 401 (invalid key), 429 (quota
  exhausted), or a generic warning otherwise. Callers (`_armar_all_markets`,
  `_armar_live`) treat `None` as "skip this sport" and continue with whatever other
  sports succeeded.
- **Operator visibility**: three diagnostic endpoints exist, all admin-gated
  (`Depends(auth.require_admin)`):
  - `/api/admin/sportradar/estado` (`:20396`) — key configured?, sports/events
    currently cached, cache age, cumulative call count and first-call timestamp
    (`_sr_llamadas`, `:20242`), for tracking trial-quota consumption.
  - `/api/_diag/prematch` (`:18379`) — Odds-API-side diagnostic, what was requested
    and what came back, deliberately scoped small to avoid burning credits.
  - `/api/admin/sportradar/diagnostico-liquidacion` (`:20874`) — per-pending-ticket
    breakdown of whether each pick's teams were found in Sportradar's schedule and
    whether a result exists, i.e. a direct tool for diagnosing exactly the
    settlement-identity gap described in §4.
- **Sportradar request budget is a first-class concern in the code, not an
  afterthought.** The comment block at `:20211-20222` documents that the trial plan is
  1000 calls **total** (not per day) and 1 request/second, and that the default
  configuration (`SR_DEPORTES` defaulting to football only, `:20231-20232`;
  `SR_DIAS=1`, `:20236`; a `1.1`s sleep between calls, `:20314`) was deliberately tuned
  to make 1000 calls last roughly 30 days. Any new provider integration inherits this
  concern only if the new provider also has a hard call budget — worth confirming
  whether it does.

---

## 6. Risks the code already demonstrates (not proposals — observed facts)

1. **Two catalog builders share a schema by convention, not by any shared type or
   validator.** The `event_id` presence mismatch (§1.1) and the historical
   `commence_time` incident (§1.2) both stem from the same root cause: nothing
   enforces that `_armar_all_markets` and `_sr_armar_all_markets` emit identical key
   sets. A third builder for a new provider would inherit this risk unless a shared
   contract (dataclass, schema check, or at minimum a shared "assemble event" helper)
   is introduced.
2. **Settlement identity is provider-specific and not generalized.** The only
   discriminator between "trust the id" and "fuzzy-match by name" is a hardcoded
   Sportradar id-prefix string check (`:20935`). A third provider gets no direct-id
   path unless the same kind of check is added for it explicitly.
3. **`market` is read by three downstream consumers but is never actually stored on a
   pick** (§3). This silently degrades per-market blocking and market-level
   exposure reporting to "everything defaults to h2h" today, for both existing
   providers — this is not provider-specific, but a new provider integration is a
   natural moment to either fix or explicitly document/accept this gap, since new
   market-naming conventions will interact with it.
4. **`evento_opciones` / `buscar_eventos` read a different catalog cache than
   `buscar_cuota_nuestra` / `candidatos_parecidos`** (§2), despite a comment in the
   latter explicitly warning against exactly this class of bug. Not confirmed whether
   this is currently causing visible symptoms in production, but it is a structural
   inconsistency in the seam as it stands today.
5. **Settlement only auto-resolves goals-based 1X2/totals/BTTS (plus Sportradar-only
   corners/cards/shots via stats)** (§4). Any market type outside that set — handicaps,
   correct score, player props, first-half markets — always requires manual
   settlement, regardless of which provider sourced the odds. A new provider that
   emphasizes markets outside this set does not get auto-settlement "for free" no
   matter how good its results feed is; the resolver logic (`resolver_pick`,
   `resolver_pick_sr`) would need to grow new cases.
6. **Provider configuration is unvalidated and read ad hoc at many call sites**, unlike
   the rest of the app's configuration (§5). A missing/invalid key degrades quietly at
   request time rather than failing closed at startup.
7. **The odds shown to a client are not re-verified against the provider at
   settlement time** (§4) — only the win/lose outcome is derived from the provider's
   final score/stats; the payout multiplier is whatever was validated (with a 5%
   tolerance, `ODDS_TOLERANCIA`, `:17902`) and frozen at bet-placement time. A
   provider that only supplies a results feed but not live/prematch odds snapshots
   would not by itself change this design, but it is worth knowing that "the odds we
   paid out on" and "the odds the provider has on record right now" are never
   cross-checked after the bet is placed.

---

## 7. Open questions for the new provider's documentation

Grouped by the constraints found above, roughly in the order they'd block adapter
design:

**Identifiers**
- Does the provider give a single, stable event id per fixture, usable for the full
  lifecycle (odds → live → settlement), the way Sportradar's `sport_event.id` is
  intended to be (§1, §4)? Or do prematch/live/results use different ids the way our
  own Odds-API/Sportradar split effectively forces a fallback+manual-settlement
  scenario?
- Is there a stable, documented id *format/prefix* we could branch on the way the
  code already branches on `sr:sport_event:` (§4), or would identity have to go
  through name+date fuzzy matching by default?
- Does the provider expose team/competitor ids in addition to names, which would let
  us skip the `match_teams`/`_mismo_club`/`_sr_normalizar` fuzzy-name layer entirely
  for this provider's own settlement?

**Market naming**
- What are the provider's market/outcome key and label conventions, and do they map
  cleanly onto our existing internal keys (`h2h`, `totals`, `spreads`, `btts`, per
  `_sr_mercados_formato_app`, §1) or would they need a new normalization layer?
- Does the provider label markets/outcomes with structured codes, or only free-text
  labels — our current settlement resolver (`resolver_pick`, §4) parses `sel` as
  **free text** (Spanish phrases like "gana", "Más de X", "Ambos anotan"), which is
  inherently provider-and-language-coupled. A structured outcome code from the new
  provider would be far more robust than another free-text convention to add.

**Event timing**
- What timezone and format does the provider use for event start time — is it always
  UTC ISO-8601 the way both existing sources are treated (`.replace("Z","+00:00")`
  parsing at `:19018`, `:20335`)? Confirm this explicitly; `_inicio_mas_proximo`
  (§3/§4) is a hard dependency for the anti-cancellation-near-kickoff rule and a
  parsing failure there silently makes a pick's cancellation always fall through to
  "no start time known" handling (`:13131-13134`).

**Odds format**
- Decimal odds, as both current providers use (`oddsFormat: decimal` for The Odds
  API `:18988`; `odds_decimal` field for Sportradar `:20066`, `:20278`)? If not,
  where does the conversion happen and what precision/rounding rules apply (existing
  code rounds to 2 decimals in most places, e.g. `:20121`, `:17324`)?

**Update frequency / rate limits**
- What is the provider's rate limit and/or total-call budget? Sportradar's trial
  budget (1000 calls total, 1 req/s, §5) directly shaped this codebase's caching and
  polling design (45-minute TTL, single-sport default, explicit inter-call sleep).
  The new provider's limits will similarly determine cache TTLs and whether SWR
  (`cache_swr`, §1) or the hand-rolled Sportradar-style cache is more appropriate.
- Does the provider support push/webhook updates for odds or results, or is polling
  the only option? None of the current integrations use webhooks for odds/results
  (the only webhook-shaped consumer in the file is the unrelated PSP payment
  integration, `:21015-21048`).

**Results/settlement feed**
- Does the provider deliver final scores per market outcome, or only the raw
  score line (as both current providers effectively do)? Our settlement resolver
  needs, at minimum, final score for goals-based markets, and (only via Sportradar
  today) match statistics for corners/cards/shots (§4). Does the new provider expose
  statistics at all, and in what shape?
- Does the provider flag a match as "closed"/"final" explicitly, the way Sportradar's
  `sport_event_status.status in ("closed","ended")` gate works (`:20736`), to avoid
  settling on an in-progress score?
- What markets does the provider consider auto-settleable from its own feed (if any),
  versus requiring manual resolution?

**Sandbox / environment**
- Is there a sandbox/trial credential separate from production, and does its data
  differ meaningfully from production (the way Sportradar's trial plan currently
  returns 403 in this deployment, forcing permanent fallback, §1)? Confirm the
  concrete failure mode (HTTP status, error body) for invalid/expired/quota-exhausted
  credentials so the failure-handling pattern in §5 can be extended correctly.

**Not determined from the code alone (needs the provider docs or an operator to
confirm)**
- Whether the Sportradar Odds-Comparison-v2 surface (`_sr_odds_get`/
  `_sr_evento_a_app`/`_sr_partidos_cacheados`, §1) is still live/used anywhere in the
  current frontend, or is dead code from an earlier integration attempt.
- The exact commercial/plan reason Sportradar returns 403 in production (trial
  expired vs. wrong plan vs. account issue) — the code only distinguishes "some
  ≥400 error", it does not surface the specific cause beyond logging the raw response
  body.

---

## Where to start reading — anchor index

| Anchor | Location | What it is |
|---|---|---|
| `all_markets()` | `bot/casino_api.py:18944` | Prematch catalog entry point; Sportradar-first, Odds-API fallback; docstring documents the identity risk |
| `_armar_all_markets()` | `bot/casino_api.py:18982` | The Odds API catalog builder |
| `_sr_armar_all_markets()` | `bot/casino_api.py:20298` | Sportradar catalog builder |
| `_sr_all_markets_cacheado()` | `bot/casino_api.py:20366` | Sportradar's hand-rolled cache with error-state passthrough |
| `cache_swr()` | `bot/casino_api.py:17599` | Generic stale-while-revalidate cache used by the Odds-API side |
| `parse_markets()` | `bot/casino_api.py:17300` | Merges multiple Odds-API bookmakers into best-price-per-outcome |
| `_sr_mercados_formato_app()` | `bot/casino_api.py:20245` | Normalizes Sportradar market names into the app's internal market keys |
| `buscar_cuota_nuestra()` | `bot/casino_api.py:21845` | Seam: find our live odd for a pick, by name matching |
| `candidatos_parecidos()` | `bot/casino_api.py:21932` | Seam: fuzzy event suggestions when a pick doesn't match |
| `opciones_de_evento()` | `bot/casino_api.py:21913` | Seam: flattens an event's h2h/totals into bettable options |
| `evento_opciones` / `buscar_eventos` routes | `bot/casino_api.py:21961` / `:21992` | Seam functions reading a different (Odds-API-only) cache than the three above |
| `validar_cuotas()` / `construir_indice_odds()` | `bot/casino_api.py:18161` / `:17971` | Odds cross-check against a name-keyed index built from five cache buckets |
| `create_betslip()` | `bot/casino_api.py:15647` | Counter-ticket write path; pick sanitization (no `market` stored) |
| `crear_apuesta()` | `bot/casino_api.py:15767` | App/web bet write path; same pick sanitization, plus risk/adjustment logic |
| `_picks_bloqueados()` | `bot/casino_api.py:5682` | Event/sport/market blocking check, reads `market` (always defaults to h2h) |
| `_registrar_exposicion()` / `_controlar_riesgo()` | `bot/casino_api.py:19272` / `:19300` | Exposure write and cap check; capped by `event_id`+`sel`, not `market` |
| `_inicio_mas_proximo()` | `bot/casino_api.py:13076` | Earliest `commence_time` across a slip's picks |
| `_puede_anular()` | `bot/casino_api.py:13095` | Cancellation eligibility; depends on `commence_time` and `paid_by` |
| `auto_liquidar()` | `bot/casino_api.py:16641` | Settlement path A: Odds-API scores, direct `event_id`/`sport_key` lookup |
| `sportradar_liquidar()` | `bot/casino_api.py:20913` | Settlement path B: Sportradar id-prefix direct lookup, else name+date fallback |
| `resolver_pick()` / `resolver_pick_sr()` | `bot/casino_api.py:16568` / `:16512` | Free-text `sel` parsing against final score/stats to decide win/lose |
| `bot/config.py` | whole file | Fail-closed settings boundary — does **not** cover provider keys |

