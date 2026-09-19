# GR8 Tech Sportsbook API — feed notes, grounded in the downloaded documentation

Source: 191 pages downloaded to `local-docs/gr8-sportsbook-api-docs/` (all originally under
`https://sport-docs.gr8.tech/sportsbook-api/...`). This is a different documentation section
from the one behind `gr8-mts-provider-notes.md`, which was written from 43 `mts/*` pages.

**Second download, 2026-09-18**: 123 further pages (592 KB) in
`local-docs/gr8-additional-docs/`, from `https://sport-docs.gr8.tech/additional/...` — the
`Additional` section this report previously named as "the single most valuable next download".
It contains `MarketTypes`, `Periods` and `ResultKinds` for 39 sports, the two Market
Translation schema pages, the Outcome Selection Key Structure page, and API Conventions.
**Open questions 1, 2, 5 (partially) and 10 below are now answered**; the new material is
worked through in §8, and §1 and §7.5 have been corrected where it contradicts them.

Tagging discipline, unchanged from the other two reports: **[DOCS]** = stated in the
downloaded documentation, page cited by filename; **[MARKETING]** = from GR8's public product
pages; **[INFERENCE]** = our own reasoning, not stated by the source.

**A caveat that applies throughout**: the scrape captured every property table verbatim, but
the documentation site renders most response examples behind a collapsed "JSON example"
toggle, and those toggles came down as the literal text `JSON example` with no body. Response
examples therefore exist for the Localization API, the DirectFeed schema/filters endpoints and
a handful of others, but **not** for the Line API's `Event`, `Market`, `Outcome` or
`FlatOutcome` objects. Field names, types and descriptions below are verbatim; where a
verbatim *value* example was unavailable, that is stated rather than invented.

---

## 0. The headline: pull versus push — the MTS report's conclusion does not hold here

**A pull-based catalog can be built from documented REST endpoints. The conclusion in
`gr8-mts-provider-notes.md` §4 was correct about the MTS surface and wrong as a statement
about GR8 as a provider.** That report said so itself — it flagged the undownloaded
Sportsbook/S2S section as "the single most valuable next download" and listed the question as
unresolved (`gr8-mts-provider-notes.md` §0 and "What remains genuinely unanswered" item 1).
This page set answers it.

The Line API is a plain REST catalog read, and the documentation opens with it as the very
first thing an integrator does — before authentication, before anything else:

**[DOCS]** `sportsbook-api-quick-start.md`:

> **Step 1: Read the line**
>
> The line endpoints work without a player session, so this is the fastest way to confirm your
> host and API key are live:
>
> ```
> curl "$API_HOST/v1/sport/v0/line/events" -H "X-Api-Key: $API_KEY"
> ```
>
> You get back the events your brand is configured to show, each with its markets and outcomes.

**[DOCS]** `sportsbook-api-gr8-api-get-started.md` gives the identical call as "Make your first
request". There is no queue, no subscription and no always-on consumer in that path.

### They do discourage polling — here is exactly what they say, and why

**[DOCS]** `sportsbook-api-overview.md`:

> For real-time line, market and score updates, connect the DirectFeed API (SignalR over
> WebSockets) rather than polling the line endpoints.

**[DOCS]** `sportsbook-api-gr8-api-line-get-started.md` states the choice as a genuine fork,
not a prohibition:

> In order to get data updates via GR8API there are two options
>
> - use DirectFeed API over WebSockets (well suited for browser applications)
> - use http short polling of Line API is suited for applications that do not need realtime
>   updates as rate of such requests can be limited

**[DOCS]** `sportsbook-api-gr8-api-line-line-api-get-started.md` is the most explicit:

> Line API is not intended to deliver near-realtime updates for scoreboards, markets etc. For
> these purposes and depending on your use cases better use:
>
> - DirectFeed API
> - MTS.
>
> Still, you can get updates from this Line API by periodic HTTP requests within your request
> rate limits and with lower update delivery latency cause by timer/caching etc

So the answer is **"yes, and polling is a documented supported mode"** — the reservation is
about latency and rate limits for a real-time trading UI, not about whether the data comes
back. A 10–60 second prematch catalog like ours sits squarely inside the use case they
describe as suited to short polling. **[DOCS + INFERENCE]**

### One warning that does apply, in their own words

**[DOCS]** `sportsbook-api-gr8-api-line-line-api-get-started.md`:

> **Note**
>
> Line API is in BETA and should be considered for integration/staging/testing purposes only.
> Release is expected at the start of 2026. You can get more info from Company's
> representatives.

That release date has passed as of this writing and `sportsbook-api-changelog.md` shows Line
API entries running to `02-07-2026` ("Added `note` field to the Event response... available in
API starting from 1.18.0 version") — a 1.x version number, where the BETA note dates from an
0.x era. **[INFERENCE]**: the BETA note is probably stale, but it is still on the page and it
is the sort of thing to get confirmed in writing by the company representative before building
a production catalog on it.

### What a full catalog costs

**Endpoints involved** (all `X-Api-Key` only, no player session):

| Call | Page |
|---|---|
| `GET /v1/sport/v0/line/sports` | `...line-api-get-v1-sport-v0-line-sports.md` |
| `GET /v1/sport/v0/line/events` | `...line-api-get-v1-sport-v0-line-events.md` |
| `GET /v1/sport/v0/line/events/markets?ids=…` | `...line-api-get-v1-sport-v0-line-events-markets.md` |
| `GET /v1/sport/v0/line/events/{id}/markets` | `...line-api-get-v1-sport-v0-line-events-7Bid-7D-markets.md` |
| `POST /v1/sport/v0/line/events/outcomes` | `...line-api-post-v1-sport-v0-line-events-outcomes.md` |
| `GET /v0/sport/feed/localization/markets` | `...localization-api-get-v0-sport-feed-localization-markets.md` |
| `GET /v0/sport/feed/localization/market-translation-version` | `...localization-api-get-v0-sport-feed-localization-market-translation-version.md` |

**Pagination.** **[DOCS]** `...line-events.md` — cursor-based, not offset:

> `nextToken` — Pagination token for the next page. If you request the first page, it should be
> empty. All subsequent requests should include the token returned in the response for the
> previous page. Example: "eyJrZXkiOiJ2YWx1ZSIsImlkIjoiMTIzIn0="
>
> `size` — Number of items to return per page. Only specific values are supported. If not
> specified, returns the default page size. Example: 100

The set of "specific values" supported for `size`, and the default, are **not stated
anywhere** in these 191 pages. The response wrapper is `ListResponseOfEvent`
(`items` + `nextToken`, "If this is the last page, it will be null").

**Batching markets.** `ids` is **required** on `/line/events/markets`. **[DOCS]**
`...line-api-api-integration-recommendations.md` gives the arithmetic:

> When making requests with multiple IDs (e.g., querying events), use comma-separated format
> (e.g., ids=1,2,3) which allows approximately 740 IDs (for 10-character numeric IDs) compared
> to ~540 IDs with repeated parameters. Longer IDs significantly reduce this limit (e.g., ~220
> for UUIDs). For larger ID sets, split requests into batches.

**[DOCS]** `sportsbook-api-gr8-api-api-integration-recommendations.md`: "The GR8 API enforces a
maximum URL length of 8KB (8,192 bytes) for all requests."

**Call count, concretely.** **[INFERENCE]**, arithmetic from the documented parameters: for a
catalog of ~2,000 prematch events, one full refresh is
1 sports call + ~20 events pages (at `size=100`) + ~20 markets batches (at 100 ids per batch,
well under the URL cap but a sane response size) ≈ **41 HTTP calls**, plus one cheap
`market-translation-version` check and, only when that string changes, one
`localization/markets` call per language. Filtering narrows this sharply: `sport`,
`tournament`, `category`, `from`/`to`, `stage` and `type` are all query parameters on
`/line/events`, and `profile=main` on the markets endpoints returns "only the main markets
from this profile".

**Rate limits.** **[DOCS]** `sportsbook-api-gr8-api-api-integration-recommendations.md`:

> From our side requests rate limiting is applied per ApiKey depending on agreement with client.

That is the whole statement. **No number, quota or per-second figure appears anywhere in these
191 pages.** The page-level "API conventions — ...and rate limiting" referenced from
`sportsbook-api-overview.md` was **not downloaded** (it moved to a shared API Conventions
section per `sportsbook-api-changelog.md` 09-09-2026). This is materially better than
Sportradar's hard 1000-calls-total trial budget only if the negotiated number is generous —
it is a commercial variable, not a documented constant. **[DOCS + INFERENCE]**

**Staleness — their own recommended cache durations.** **[DOCS]**
`...line-api-api-integration-recommendations.md`:

> - **Sports and Categories** — Recommended cache duration: Minutes to hours
> - **Tournaments** — Recommended cache duration: Minutes
> - **Prematch Events** — Recommended cache duration: Seconds to tens of seconds
> - **Live Events** — Recommended cache duration: Very short (seconds)
> - Markets and Odds — Prematch markets: Short cache (e.g., 10-30 seconds); Live markets: Very
>   short cache (e.g., 3-10 seconds)
>
> Note: Prematch and live events can be cached differently. While prematch events can be cached
> for longer periods (10-60 seconds), live events require much shorter cache durations (3-10
> seconds)...

> **TTL-Based Cache Invalidation** — The simplest and recommended approach is TTL
> (Time-To-Live) based invalidation... This approach is simple, predictable, and works well for
> most scenarios

That is, almost word for word, the design our `cache_swr()` already implements
(`sportsbook-integration-analysis.md` §1). GR8's own recommended architecture for a
server-side consumer is a TTL cache in front of their REST endpoints — the thing the MTS
report concluded could not be built.

**Conditional requests.** **[DOCS]** every Line API read documents an `ETag` response header:

> ETag for conditional requests... Returned if 'If-None-Match: ' is passed. For first time pass
> '*' as value

**[INFERENCE]**: 304s would cut bandwidth on a polling loop but almost certainly still count
against a per-ApiKey request limit; nothing in the docs says otherwise.

### The correction, stated plainly

`gr8-mts-provider-notes.md` §4 concluded: *"a pull-based catalog exactly like `all_markets()`'s
`cache_swr`/TTL model cannot be built from documented MTS REST endpoints alone."* Scoped to the
MTS surface that sentence remains true — republish still answers `202` with an empty body and
still re-emits onto RabbitMQ. **As a statement about GR8 as a provider it is wrong.** The
Sportsbook API's Line API is a synchronous REST catalog read that returns events, markets and
odds in the HTTP response, works with an API key and no player session, is cursor-paginated,
carries ETags, and comes with a GR8-authored TTL-caching guide aimed at exactly this pattern.
**No new always-on ingestion component is required for a pull-based catalog.** The MTS report's
single most expensive finding does not survive contact with this page set.

---

## 1. Market and selection naming — the MTS finding survives in structure, but the round trip is far cheaper

### The base feed still carries no market name

**[DOCS]** `...line-api-get-v1-sport-v0-line-events-markets.md` — `Market` has exactly four
properties, and **none of them is a name**:

> | Name | Type | Description |
> |---|---|---|
> | key | MarketDto.MarketKey | Unique identifier for the market. |
> | items | [MarketItem] | Array of market items. |
> | tabs | [integer] | Array of tabs for the market (configurable). |
> | sortOrder | integer(int32) | Sort order for the market. |

`MarketDto.MarketKey`:

> | period | integer(int32) | Period of market. See "Market description" section for specific sport |
> | subPeriod | integer(int32)¦null | Type of market. See "Market description" section for specific sport |
> | marketType | integer(int32) | Type of market. See "Market description" section for specific sport |
> | resultKind | integer(int32) | Kind of market. See "Market description" section for specific sport |
> | layout | string¦null | Use for market splitting on site and for free form markets... Please refrain from using this field, as we will be removing it. |

`Outcome` and its key:

> | key | MarketDto.OutcomeDto.OutcomeKey | Unique identifier for the outcome, which is a combination of market type and values. |
> | odd | integer(int32) | Odd is multiplied by 100 (e.g. 1.35 = 135) |
> | status | string | Possible values: Opened, Suspended, Removed |
>
> `OutcomeKey`: `type` integer(int32) — "Type of the outcome..."; `values` [string] — "Parameters of the outcome."

`MarketItem` carries `values [string]` — "Market specific array of values (e.g. ["3", "1"]".

So the structural finding from `gr8-mts-provider-notes.md` §3 is confirmed on this surface:
**a market is identified by a composite numeric key and nothing in the markets payload is
human-readable.** The key shape differs slightly from MTS's — MTS had
`{eventId, tradingType, marketType, period, subPeriod, layout}`; the Line API has
`{period, subPeriod, marketType, resultKind, layout}` with `eventId` on the enclosing
`EventMarkets` object. Whether `resultKind` here is the same concept MTS called `tradingType`
is **not stated**; the DirectFeed main-market filters endpoint uses `tradingType` while the
DirectFeed `MarketKey` uses `resultKind`, which suggests they are the same field renamed, but
that is **[INFERENCE]**, and the two vocabularies coexist in this one page set.

### What is genuinely different and better: one bulk dictionary, not a per-selection round trip

This is the second place the MTS report needs qualifying. MTS resolved selection names via
`POST /v1/sport/v1/translation/selections`, taking an array of `selectionKey` strings and
returning **templates** with placeholders (`"text": "3: {Team1}"`) that a consumer had to
substitute per selection. The Sportsbook surface does not work that way.

**[DOCS]** `...localization-api-get-v0-sport-feed-localization-markets.md` —
`GET /v0/sport/feed/localization/markets`:

> Returns all market, outcome, period, trading type, and prompt translations for the given
> language. Used for localizing market names, outcomes, and related texts in the sportsbook UI.

Parameters are just `lang` (default `en`), `prompt` (default `false`) and `X-Api-Key`. The
response example is captured verbatim in the scrape:

```json
{
  "markets": {
    "1": [
      {
        "condition": "=F::=1::",
        "translation": "Match Winner",
        "shortTranslation": "Winner"
      }
    ]
  },
  "outcomes": {
    "1": [
      {
        "condition": "=F:=1:::::",
        "translation": "Team 1",
        "shortTranslation": "T1"
      },
      {
        "condition": "=F:=1:::::",
        "translation": "Team 2",
        "shortTranslation": "T2"
      }
    ]
  },
  "periods": {
    "1H": [
      {
        "condition": "",
        "translation": "First Half",
        "shortTranslation": "1H"
      }
    ]
  },
  "tradingTypes": {
    "101": {
      "condition": "",
      "translation": "Total Goals",
      "shortTranslation": "Goals"
    }
  },
  "stages": {
    "Prematch": {
      "1": "Match Winner"
    }
  },
  "translationVersion": "20250915-001",
  "prompts": {
    "1": [
      {
        "condition": "",
        "translation": "Select the winner of the match.",
        "shortTranslation": "Winner?"
      }
    ]
  },
  "marketItems": {
    "2": [
      {
        "condition": "",
        "translation": "Over 2.5",
        "shortTranslation": "O2.5"
      },
      {
        "condition": "",
        "translation": "Under 2.5",
        "shortTranslation": "U2.5"
      }
    ]
  }
}
```

Three things matter here, all **[DOCS]**:

1. **It is one call for the entire dictionary, per language.** Not per event, not per
   selection. `markets`, `outcomes`, `marketItems`, `periods`, `tradingTypes` and `stages` all
   come back in the same body.
2. **The strings in the example are finished, literal text** — `"Match Winner"`,
   `"Over 2.5"`, `"Under 2.5"`, `"Team 1"`, `"First Half"`, `"Total Goals"`. There is no
   `{Team1}`-style placeholder anywhere in this example, and no templating mechanism is
   described on the page. This is a materially different shape from the MTS selections
   endpoint. **[INFERENCE]**: whether *some* market families still return placeholders on this
   surface cannot be ruled out — the "Market Translation" page that explains the schema in
   detail was not downloaded (see §7).
3. **`translationVersion` is the cache key**, and there is a dedicated one-line endpoint to
   poll it cheaply: `GET /v0/sport/feed/localization/market-translation-version` — "Returns the
   version string of the market translation dataset."
   (`...localization-api-get-v0-sport-feed-localization-market-translation-version.md`)

### ~~The part that is still unresolved~~ — RESOLVED by the `Additional` download, see §8

*(This subsection is kept as written because it states the problem correctly. Both pages it
names as missing are now on disk: `additional-market-translation-condition-format.md`,
`additional-market-translation-translation-format.md` and the 117 per-sport
`additional-markets-description-*` pages. The `condition` DSL is transcribed in §8.3 and the
marketType catalogue in §8.1–8.2. One thing below is now **wrong** and is corrected in §8.3:
the claim that the bulk dictionary returns finished literal text with no placeholders.)*

**[DOCS]** `TranslationItemVm.condition` is described as:

> Colon-separated string encoding context/rules for translation application. Supports operators
> and wildcards.

Each numeric market-type id maps to an **array** of `{condition, translation}` — same as MTS.
Picking the right entry requires evaluating that condition against the market's other key
fields. The page that documents how (`Market Translation`, referenced from
`sportsbook-api-overview.md`, `...line-localization-api-get-started.md` and
`...line-api-get-v1-sport-v0-line-events-markets.md`) is **not among the 191 downloaded
pages**; `sportsbook-api-changelog.md` 26-08-2026 records that it moved to a top-level
`Additional` section:

> Market translation moved out of the Sportbook API's Additional Resources into the top-level
> Additional section, alongside Markets Description. The same condition / translation schema is
> returned by the Sportsbook localization endpoint and the MTS translations endpoint, so it is
> documented once for both...

Note that last clause: **GR8 states the Sportsbook and MTS translation schemas are the same
thing.** So the `condition` mechanism our MTS report described is confirmed to apply here too;
only the delivery shape (bulk dictionary vs. per-key POST) differs.

Equally missing: the per-sport **Markets Description** page that enumerates what `marketType`
`1`, `2`, `145` etc. actually mean. Every Line API field description points at it
("See 'Market description' section for specific sport") and it is not on disk —
`sportsbook-api-changelog.md` 21-08-2026 records it moving out of MTS into the same
`Additional` section. **Without it, no marketType→`h2h`/`totals`/`spreads`/`btts` mapping can
be written.** This is the single most important missing download for the scanner question.

**[Update, second download]** It is on disk now. The mapping is written in §8.2.

### Does the scanner work?

**Yes, in principle, and by a much shorter path than the MTS report implied.** The scanner
matches a rival's screenshot against literal market-name strings in our own catalog
(`sportsbook-integration-analysis.md` §2, `buscar_cuota_nuestra` / `opciones_de_evento`). On
this surface a literal string such as `"Match Winner"` or `"Over 2.5"` is obtainable by joining
our cached copy of one dictionary against the numeric keys on each market — an in-memory join,
refreshed only when `translationVersion` moves, not a per-event or per-selection API call.

**But**: the join itself cannot be specified from these 191 pages, because the two pages that
define it (Market Translation, Markets Description) were not downloaded. **[DOCS + INFERENCE]**

**[Update, second download]** The join *can* now be specified — and the answer is more
qualified than "yes". See §8.5 for the verdict with the new evidence: the in-memory join is
real, but the localization dictionary alone does not produce a finished string for every
market family, and two of the three joins the scanner needs can be short-circuited without the
dictionary at all.

---

## 2. Identifiers

All **[DOCS]** from `...line-api-get-v1-sport-v0-line-events.md`,
`...line-api-get-v1-sport-v0-line-events-7Bid-7D.md`,
`...line-api-get-v1-sport-v0-line-sports.md`,
`...line-api-get-v1-sport-v0-line-tournaments.md`,
`...line-api-get-v1-sport-v0-line-events-markets.md`.

| Object | Field | Type | Verbatim description |
|---|---|---|---|
| Event | `id` | string | "Unique identifier for the event." |
| Event | `rev` | string¦null | "Token that identifies revision of the entity." |
| Event | `sport` | string | "Sport of the event (short code), such as "F" for football, "T" for tennis, etc." |
| Event | `slug` | string | "Slug of the sport. This is a URL-friendly version of the name..." |
| Event competitor | `id` | string | "Unique identifier for the competitor." |
| Event competitor | `name` | string | "Name of the competitor, such as "Team A" or "Player B"." |
| Event tournament | `id` | string | "Unique identifier for the tournament." |
| Event category | `id` | string | "Unique identifier for the category." |
| Event player | `id` | string | "Unique identifier for the player." |
| Sport | `id` | string | "For example, Cricket" |
| Tournament | `id` / `sport` | string / string | "Unique identifier for the tournament." / "Sport of the tournament (short code), such as "F"..." |
| Market | `key` | MarketKey | `{period, subPeriod, marketType, resultKind, layout}` — composite, no id |
| Outcome | `key` | OutcomeKey | `{type, values[]}` |
| FlatOutcome | `key` | FlatOutcomeKey | `{eventId, marketType, resultKind, period, subPeriod, values[], outcomeType, outcomeValues[]}` |

**No namespace prefix anywhere.** Event ids are opaque strings; no example value survived the
scrape for the Line API, but the MTS domain pages showed bare numeric strings (`"9688042"`) for
the same platform. **[DOCS + INFERENCE]**

### Two sport-id vocabularies, in one page set

`Event.sport` and `Tournament.sport` are documented as the **short code** ("F", "T"), and the
`sport` query filter's own example is `"F"`. But `Sport.id` on the sports list is documented as
"For example, Cricket" — the full name. The Results Page carries both on one object:
**[DOCS]** `...results-page-api-get-v0-sport-summary-page-7Beventid-7D.md`, `Sport`:

> `id` string — Unique identifier for the sport.
> `name` string — Name of the sport.
> `platformShortName` string — Short name of the sport for the platform, such as "F" for Football or "T" for Tennis.
> `slug` string — Slug of the sport...
> `metadataSportType` integer(int32) — Metadata type of the sport, such as 1 for Football, 2 for ESport, 3 Basketball

**[INFERENCE]**: `Sport.id` is the long form ("Cricket", "Football"), `platformShortName` is
the short code, and `Event.sport` carries the short code. This resolves — but does not remove —
the same "two sport-id shapes" inconsistency `gr8-mts-provider-notes.md` §1 flagged between the
MTS domain model and the Limits API. Any adapter must know which vocabulary each endpoint
expects; the `sport` query filter on `/line/events` and `/line/tournaments` documents `"F"`,
while the DirectFeed schema example shows `"sport": "Football"` on `TournamentVm`
(`...directfeed-api-get-v0-sport-feed-schema.md`). **They are not interchangeable.**

### Betradar/Sportradar mapping: a boolean, and nothing more

**[DOCS]** The string `hasBetradarMapping` appears on 11 DirectFeed event pages (e.g.
`...directfeed-api-get-getricheventsbysportandtimerange.md`,
`...directfeed-api-get-geteventsbyids.md`), documented as:

> `hasBetradarMapping` boolean — Whether event has Betradar mapping

**That is the only mention of Betradar or Sportradar in all 191 pages.** There is **no field
anywhere carrying a Betradar/Sportradar event id, competitor id or any third-party id.** The
flag tells you a mapping exists on GR8's side; it does not hand you the value. The Line API
`Event` object does not even carry the boolean.

**[INFERENCE]**: this is the most commercially interesting single finding after the pull/push
answer. If GR8 will expose the Betradar id behind that boolean — via a contract addendum, a
field on the S2S surface, or the undocumented Data API GraphQL interface
(`sportsbook-api-changelog.md` 28-08-2026) — then GR8 events could carry
`sr:sport_event:`-shaped identity and our entire settlement path would work unchanged
(`sportsbook-integration-analysis.md` §4). That is worth asking in the commercial conversation
as a specific, answerable question. Nothing in these pages says it is possible.

### Stability

`rev` is "Token that identifies revision of the entity" and ETags are offered on the same
endpoints, so the platform clearly versions entities. **Nothing in these 191 pages states
whether event, competitor, tournament or category ids are stable across seasons, ever reused,
or retired.** Same gap as the MTS pass.

---

## 3. Event start time

**[DOCS]** `...line-api-get-v1-sport-v0-line-events.md` and `...-events-7Bid-7D.md`, `Event`:

> `startTime` — `string(date-time)` — "Start time of the event in UTC format (ISO 8601). This
> is the time when the event is scheduled to begin."

The response example was collapsed in the scrape, so no verbatim `startTime` *value* is
available. The nearest verbatim values are the documented formats of the `from`/`to` filters on
the same endpoint:

> **from**: Filters events that start on or after the specified date and time. If omitted, no
> lower time bound is applied. Example: "2024-02-05T12:00:00Z" for UTC or
> "2024-02-05T12:00:00+01:00" for a specific timezone (ISO 8601)

So both `Z` and explicit-offset forms are accepted on input; `startTime` on output is
documented as UTC ISO 8601. **[DOCS + INFERENCE]**: this is a direct fit for our
`commence_time`, which is parsed with `.replace("Z","+00:00")`
(`sportsbook-integration-analysis.md` §1.2, `:19018`, `:20335`). An explicit `+01:00` offset
would also parse correctly through `datetime.fromisoformat`, but it is worth confirming the
output never uses one.

**A hard difference between the two transports, and a trap:** **[DOCS]**
`...directfeed-api-get-getricheventsbysportandtimerange.md`, `RichEvent`:

> `startTime` integer — Event start time (Unix timestamp)

**Line API `startTime` is an ISO 8601 string; DirectFeed `startTime` is an integer Unix
timestamp.** Any code that consumes both surfaces must normalize. The two transports also
disagree on enum representation throughout: Line API `stage`/`status`/`tradingStatus` are
strings ("prematch", "finished", "Opened"), DirectFeed's are integers
(`stage` "0=Default, 1=Prematch, 2=Live"; `status` "0=Created, 1=Started, 2=Paused,
3=Finished, 4=Retired, 5=Abandoned, 6=Interrupted, 7=Cancelled, 8=Postponed").

---

## 4. Odds — the format is stated, not inferred

**[DOCS]** `...line-api-get-v1-sport-v0-line-events-markets.md`, `Outcome`:

> `odd` — `integer(int32)` — "Odd is multiplied by 100 (e.g. 1.35 = 135)"

Identical wording on `FlatOutcome` in `...line-api-post-v1-sport-v0-line-events-outcomes.md`.
DirectFeed's `MarketOutcome` carries `odd` integer ("Odd value") plus
`originalOdd integer¦null` ("Original odd value") and `isFrozen`/`isRemoved` booleans
(`...directfeed-api-get-getmainmarketsbysportandtimerange.md`).

This is a **stated wire format with a worked example** — strictly better than the MTS surface,
where `gr8-mts-provider-notes.md` §3 had to infer decimal odds from example values because
"nowhere in the 43 pages does the text explicitly say 'decimal odds'". Here the mapping
`135 → 1.35` is unambiguous. **[INFERENCE]**, and it is a small one: these are decimal
(European) odds at two-decimal precision, and an adapter divides by 100. Our code already
rounds to 2 decimals in most places (`sportsbook-integration-analysis.md` §7).

**Outcome status.** **[DOCS]** `status` string — "Possible values: Opened, Suspended, Removed".
`MarketItem.isOpen` boolean — "Shows that market is open for trading". `Event.tradingStatus` —
"Opened (market open for trading), Suspended (market is not ready for trading, but coefficients
still changing)". A catalog builder must filter on these; a `Suspended` price is explicitly
documented as still moving.

**The line you get is the brand's line, not a raw line.** **[DOCS]**
`sportsbook-api-architecture.md`:

> The APIs described here are designed to serve a frontend application under a user context:
> they return personalized, ready-to-display data, without exposing how it was produced or the
> original raw data. If you need raw data and want to apply your own processing on your
> backends, consider MTS integration instead.

> All data provided by GR8API are in ready to use for specific user (customized according to
> user and brand). If you need more raw data - consider other type of integrations

**[INFERENCE]**: this is the mirror image of MTS's `oddsMultipliers` finding
(`gr8-mts-provider-notes.md` §3). On MTS you get the raw price and must apply the brand
multiplier yourself; on the Sportsbook API the multiplier is already applied and you cannot see
the raw price. For a feed-only consumer that wants "the odds we will show", the Sportsbook API
is the *more* convenient surface, not the less.

---

## 5. What else this surface offers that is relevant to a feed-only integration

**Results / settlement data — a real synchronous read.** **[DOCS]**
`...results-page-api-get-v0-sport-summary-page-7Beventid-7D.md`,
`GET /v0/sport/summary-page/{eventId}`:

> Endpoint is used to retrieve a summary page by event id. The response includes information
> about the event itself, its category, tournament, scoreboard, sport, upcoming events involving
> the competitors, other upcoming events from the same tournament, and link with highlight.

`ScoreboardV2` carries:

> `mainScore` string — Main score of the event, such as "0:2", "1:1" or etc.
> `periodScore` string — Score by period, such as first half, second half, or etc. Example: "(2:0, 2:3)"
> `mainScores` [Score] — Array of main scores.
> `statistics` [Statistic] — Array of statistics.
> `pointInfos` [PointInfo] — Array of point information.

`Score` is `{typePlatformId, period, subPeriod, score1, score2}` — **numeric per-competitor
scores**, not a string to parse. `Statistic` is `{typePlatformId, score1, score2}`.

It has an explicit finished-gate:

> `returnNotFinished` query boolean, default `false` — Specifies whether to return summary page
> for the event that has not yet finished
>
> 204 No Content — Returns an empty response, likely due to event was not found or event has not
> finished yet and param returnNotFinished=false

**[DOCS]** `...results-page-api-get-started.md`, under Best Practices:

> When to request a summary page? When the event is complete, this information can be obtained
> from the DirectFeed API subscription or from the Line API, in the entity "Event" and field
> "Status"

**[INFERENCE]**: `Event.status == "finished"` plus a `summary-page` read is a direct analogue of
our Sportradar `sport_event_status.status in ("closed","ended")` gate
(`sportsbook-integration-analysis.md` §4) and of `_sr_resultado()`. The catch is
`Statistic.typePlatformId` — the numeric statistic-type catalogue lives on the Domain "Scores
description" page, which is **not in this download**, so corners/cards/shots resolution
(`resolver_pick_sr`) cannot be specified from what we have.

**Live scoreboard inside the catalog read.** `?include=scoreboard` on `/line/events` returns
`{stage, subStage, timer{currentTimeSeconds,isTimerOn,isTimerDirectionUp}, scores[], server,
serverNumber}` with `score` as a string "in format "1:0", "0:1", "0:0"". **[INFERENCE]**: this
would replace both of our current live-score backfill providers (RapidAPI football-data and
Sportradar, `sportsbook-integration-analysis.md` §1), and — unlike them — it is keyed by the
same `event_id` the odds came from, not name-matched. That is a real simplification.

**Competitor info and head-to-head.** **[DOCS]**
`...competitor-info-api-get-v0-sport-competitors-info-head-2-head-statistics.md` —
`GET /v0/sport/competitors-info/head-2-head-statistics`, "Gets historic results of the two
competitor meetings", parameters `competitor1Id`, `competitor2Id`, `locale`, `subsport`.
`...competitor-info-api-get-v0-sport-competitors-info-7Bcompetitorid-7D-results.md` —
`GET /v0/sport/competitors-info/{competitorId}/results`, "Gets last event results for
competitor", `size` "ranging from 1 to 20". Both pages document the response schema as
**`None`** with `"no example"` — the endpoints exist, their payloads are undocumented here.
Same for `GET /v0/sport/tournaments-info/{tournamentId}/results` and
`.../competitors` and `.../events`.

**Event Content API is URLs, not data.** **[DOCS]**
`...event-content-api-get-started.md`: it returns "URLs for embedding this content in your
site" (video, pitch animation, statistics) for iframe embedding — availability checks and
embed links, not structured statistics. Not useful as a settlement source.

**Tournament standings.** `GET /v0/sport/tournament-standings/{tournamentId}` exists
(`...results-page-api-get-v0-sport-tournament-standings-7Btournamentid-7D.md`).

**Bet building and wallet exist and are out of scope for this pass.** Bet Builder API
(`/v0/sport/bet-builder/events/{eventId}/...`: availability, check-outcome,
customized-outcomes, customized-price-result) lets a client price a custom same-event parlay.
Bet placement, free bets, cashout, express boost, bet history, favourites, personalization,
user settings, recommender (18 endpoints), win-feed, lock-screen notifications, auto-banners
and custom pages all exist in this page set; the wallet contract is a separate top-level
section that was not downloaded. None of it is needed for a feed-only integration.

---

## 6. Authentication and environments

**[DOCS]** For the line, a consumer needs exactly two things, and no player session.
`sportsbook-api-quick-start.md`:

> You need two values from your company representative before you begin:
>
> ```
> API_HOST="https://api.example.com"   # your platform host
> API_KEY="YOUR_API_KEY"               # identifies your brand
> ```

Every Line, Localization and Results-Page endpoint documents `X-Api-Key` header `required`.
The markets endpoints additionally accept `X-Apg-At` (optional) — "Access token for user...
**If missing then operation is executed under anonymous user**" — and `X-Channel`.
`/line/events`, `/line/sports`, `/line/tournaments` and `/line/categories` accept `X-Language`;
the markets endpoints do **not** (consistent with markets carrying no text at all).

**[DOCS]** `sportsbook-api-quick-start.md` also warns:

> If the response says your brand or API key is not allowed, the endpoint is additionally
> protected for your brand — contact your company representative.

Player authentication (not needed for a feed) is an RSA/RS256 JWT exchange:
**[DOCS]** `...auth-get-started.md` — the client hosts a public key URL, mints a short-TTL JWT
(`{externalUserId, defaultCurrency, selectedLanguage, iat, exp}`, "recommended maximum TTL - 30
seconds"), POSTs it to `/v0/identity/login/with-token`, and receives HTTP-only cookies
`apg_at` (10 min) and `apg_rt` (14 days). "The refresh step is NOT OPTIONAL."

**Sandbox: not documented in these 191 pages.** There is no environment table, no stage/prod
host pair, and no credential-request process. `API_HOST` is simply "provided to you by company
representative". This is a regression from the MTS section, which at least named Stage
(`apg-s2s.online`) and Prod (`apg-s2s.com`) hosts. `sportsbook-api-changelog.md` 09-09-2026
records that "the platform-wide path versioning, version headers and rate-limit rules moved to
API Conventions" — a page that was not downloaded and is the likely home of any environment
statement. **[DOCS + INFERENCE]**

**Versioning.** `Api-Version` header ("Supported are 1,2, if not passed then current version is
used") and an `X-Endpoint-Version` deployment version referenced in the changelog
("Starting from "X-Endpoint-Version>=0.21", header "Api-Version: 2" is supported with updated
StageFilter enum values"). A Postman workspace is referenced from several Get Started pages.

---

## 7. The fit against our system

Cross-referenced against `sportsbook-integration-analysis.md`, which maps our side with
`file:line` citations.

### 7.1 Stored pick fields

Our persisted pick is
`{"home", "away", "sel", "odd", "sport", "event_id", "sport_key", "commence_time"}`
(`sportsbook-integration-analysis.md` §3 — note `market` is parsed but never stored).

| Field | What GR8's Line API gives | What it would mean |
|---|---|---|
| `home`, `away` | `competitors[].name` — literal strings, "such as "Team A" or "Player B"" | Direct fit for the *strings*. **But see the home/away problem below.** |
| `commence_time` | `startTime`, "UTC format (ISO 8601)" | Direct fit. Parses through the existing `.replace("Z","+00:00")` convention unchanged. Best-behaved field on this surface, same verdict as the MTS pass. |
| `odd` | `odd` integer, "multiplied by 100" | Divide by 100. Trivial, and the format is *stated*, so no guessing. |
| `event_id` | `id`, opaque string, no prefix | **Breaks settlement.** See §7.2. |
| `sport_key` | `sport`, short code `"F"` | New mapping needed; collides with nothing today but see §7.4. |
| `sport` | `Sport.name` (free text, localized via `X-Language`) | Direct fit — it is display-only in our code. |
| `sel` | Nothing directly. Built by joining `OutcomeKey{type, values}` + `MarketItem.values` against the localization dictionary. | New work; see §7.5. |
| `market` | Nothing directly. Same join, on `MarketKey.marketType`. | New work, and the first time we would actually have to solve the never-stored-`market` gap. |

**A concrete problem nobody has flagged yet: which competitor is home?**
`EventDto.EventCompetitor` has exactly four properties — `id`, `name`, `icons`, `slug`. **There
is no `qualifier`, `isHome`, `side` or `homeAway` field.** Sportradar gives us
`competitors[qualifier=home/away]` and our builder relies on it (`:20341-20355`); The Odds API
gives us `home_team`/`away_team` explicitly. GR8's Line API gives an unlabelled array.
`Event.type` has a `"homeaway"` value and `Event.competitorType` is `"pair"`/`"team"`, and
`Event.name` is "Human-readable name of the event" (**[INFERENCE]**: probably "A vs B"), and
`ScoreboardV2.mainScore` is "0:2" — all of which imply a stable ordering where index 0 is the
first/home side. **But the documentation never says so.** For a system whose settlement and
whose scanner both depend on knowing which team is home
(`resolver_pick` parses "X gana" against home/away, `sportsbook-integration-analysis.md` §3),
this must be confirmed before anything is built. **[DOCS: confirmed absence + INFERENCE]**

### 7.2 Settlement identity — `event_id` and the `sr:sport_event:` rule

Our settlement trusts `event_id` directly **only** when it starts with `"sr:sport_event:"`
(`bot/casino_api.py:20935`); everything else falls through to
`_sr_buscar_partido(home, away, fecha)` — a normalized-exact team-name match against
**Sportradar's own daily schedule** (`sportsbook-integration-analysis.md` §4).

GR8 event ids are opaque strings with no prefix. A GR8-sourced pick would therefore:

1. **Fail the prefix check by construction**, and
2. **Be resolved against Sportradar's schedule** — a provider that has no relationship to the
   GR8 event at all. Where the names happen to match (a major-league football fixture) it would
   accidentally settle correctly; where they do not, it settles wrongly or not at all.

This is the same verdict as `gr8-mts-provider-notes.md` §5, and this page set does not change
it — with one new lead: `hasBetradarMapping` (§2) proves GR8 *holds* a Betradar mapping
internally. If that id can be obtained, the problem evaporates. If not, adopting this feed
requires one of:

- a second hardcoded-prefix branch beside the `sr:sport_event:` check (the smallest change, and
  the one the code's existing shape invites); or
- a generic provider-tagged-id abstraction (none exists today, §6.2 of the other report); or
- replacing `_resultado_de`'s Sportradar fallback with a **GR8-native** results lookup — which
  this surface actually supports, via `Event.status == "finished"` +
  `GET /v0/sport/summary-page/{eventId}` (§5). That is the cleanest option and the only one
  that makes GR8 self-consistent end to end, but it means writing a third `resolver_pick`
  variant against `ScoreboardV2`.

**What would break, concretely**: Path A (`auto_liquidar`, `/api/agencias/me/auto-liquidar`)
would silently return nothing for every GR8 pick, because it asks The Odds API's
`/v4/sports/{sk}/scores/` for a `sport_key` that does not exist there — every GR8 pick lands in
`sin_resolver`. Path B (`sportradar_liquidar`) would route every GR8 pick to the name+date
fallback. **Neither path settles a GR8 pick correctly today without code changes.**

### 7.3 Payout and odds freezing

Unchanged. Our payout is frozen at bet time from the client-submitted `odd`
(`sportsbook-integration-analysis.md` §4/§7) and never re-derived. GR8's line being
brand-adjusted rather than raw (§4) makes `validar_cuotas`'s 5%-tolerance cross-check
(`ODDS_TOLERANCIA`, `:17902`) *more* meaningful, not less — we would be comparing against the
same number GR8 would have shown the player.

### 7.4 `sport_key` and the sport-namespace collision

`es_futbol = sk.startswith("soccer")` at `bot/casino_api.py:18267` is the concrete landmine.
GR8's `"F"` starts with neither `soccer` nor anything else our code recognizes, so an adapter
must either map `"F"` → an existing `soccer_*`-shaped key (safe for existing logic, ambiguous
for settlement routing) or introduce a third namespace and audit every `sport_key`-switching
site. This is exactly risk 6.1 in the other report ("two catalog builders share a schema by
convention, not by any shared type or validator") arriving for the third time.

### 7.5 The scanner

Our scanner reads a rival's ticket screenshot and matches it against our own catalog by team
names **and market names**, then offers to match or beat the odd. Team names: direct fit
(`competitors[].name`). Market names: **obtainable, at the cost of a translation-dictionary
join that does not exist in our codebase today.**

Concretely, what would have to be written:

1. A cached fetch of `GET /v0/sport/feed/localization/markets?lang=es`, invalidated on
   `GET /v0/sport/feed/localization/market-translation-version`.
2. A resolver that, given a `MarketKey{marketType, resultKind, period, subPeriod}` plus
   `MarketItem.values` plus `OutcomeKey{type, values}`, picks the correct entry from the
   `condition`-gated arrays in `markets`, `marketItems` and `outcomes`. **The rules for
   evaluating `condition` are not in this download.**
3. A mapping from GR8 numeric market types onto our internal `h2h`/`totals`/`spreads`/`btts`
   keys, so that `opciones_de_evento()` (which reads only `markets["h2h"]` and
   `markets["totals"]`, `:21913`) keeps working. **The numeric catalogue is not in this
   download.**
4. Substitution of the localized label into the `{market_key: {outcome_name: price}}` shape
   both existing builders emit, so `buscar_cuota_nuestra` / `candidatos_parecidos` /
   `validar_cuotas` keep working unchanged.

Steps 1 and 4 are specifiable today. Steps 2 and 3 are blocked on two pages that GR8 moved to a
shared `Additional` section and that were not captured in this download. **That is the single
highest-value next download**, exactly as the S2S/Line section was for the previous pass.

One point in our favour that the MTS report could not see: because the dictionary is one bulk
call per language, the scanner's matching can run entirely against an in-memory catalog, with
**no per-event or per-selection API call on the hot path**. The MTS shape would have required a
`POST .../translation/selections` round trip per unseen key. **[DOCS + INFERENCE]**

### 7.6 What our existing seam keeps for free

- `validar_cuotas()` / `construir_indice_odds()` (`:18161`, `:17971`) are keyed purely by
  `(normalize_name(home), normalize_name(away))` — provider-agnostic, works unchanged.
- `cache_swr()` (`:17599`) is exactly the TTL-with-background-refresh pattern GR8's own
  recommendations page prescribes. No new cache machinery is needed for the pull path.
- `_inicio_mas_proximo()` / `_puede_anular()` depend only on `commence_time` being raw ISO —
  satisfied directly.
- `opciones_de_evento()`'s h2h/totals-only view keeps working **if and only if** step 3 above
  can be written.

### 7.7 What would have to be written, in one list

1. A third catalog builder emitting the `{"sports":[{"key","name","icon","events":[…]}]}` shape,
   fed by `/line/sports` + paginated `/line/events` + batched `/line/events/markets`.
2. A localization-dictionary cache keyed on `translationVersion`, plus the `condition` resolver.
3. A `marketType`/`outcomeType` → `h2h`/`totals`/`spreads`/`btts` mapping table.
4. An `odd / 100` conversion and an `Opened`-only filter on outcome `status` / `MarketItem.isOpen`.
5. A `sport` short-code → `sport_key` mapping.
6. A home/away determination rule (once GR8 confirms competitor ordering).
7. A settlement branch: either a GR8 id prefix/tag beside `sr:sport_event:`, or a GR8-native
   `summary-page` resolver.

None of that requires an always-on process. All of it is request-time code, which is what makes
this a materially cheaper integration than the MTS report concluded.

**[Update, second download]** Items 2 and 3 are now specifiable — §8.2 gives the mapping table
and §8.3 gives the `condition` grammar. Item 3 turns out to be much smaller than it looked,
because our vocabulary is much smaller than it looked (§8.0).

---

## 8. The `Additional` section — the numeric catalogue, and how little of it we can use

Source for this whole section: the 123 pages in `local-docs/gr8-additional-docs/`, downloaded
2026-09-18. Every GR8 claim below cites its page filename; every claim about our code cites
`file:line` in `bot/casino_api.py`.

### 8.0 Our market vocabulary, established from the code

This has to be settled first, because the size of the mapping problem is set by our side, not
by GR8's.

**The primary catalog builder is Sportradar's.** `_sr_mercados_formato_app`
(`bot/casino_api.py:20251`) is the only place where a provider's market names become our
market keys. It classifies by substring on the provider's market name (`:20269-20278`):

```python
if "3way" in nombre or nombre in ("1x2", "match result"):
    clave = "h2h"
elif "total" in nombre and "corner" not in nombre:
    clave = "totals"
elif "both teams" in nombre or "btts" in nombre:
    clave = "btts"
elif "handicap" in nombre or "spread" in nombre:
    clave = "spreads"
else:
    clave = (m.get("name") or "otros")[:40]
```

**Four canonical keys, and a fall-through that is not a key at all** — anything unclassified is
filed under the provider's own name truncated to 40 characters, which nothing downstream ever
looks up.

Outcome labels are produced in the same function (`:20290-20296`):

```python
if tipo in ("home", "1"):   etiqueta = home
elif tipo in ("away", "2"): etiqueta = away
elif tipo in ("draw", "x"): etiqueta = "Draw"
else:                        etiqueta = (o.get("name") or tipo or "?")[:40]
```

So a 1X2 market becomes `{"<home team name>": 2.10, "Draw": 3.40, "<away team name>": 3.10}`.
The draw key is the **literal ASCII string `"Draw"`**, not a localized one.

The fallback builder, `parse_markets` (`:17306`), does not classify at all: it keeps the
provider's own market key verbatim (`key = mkt.get("key")`, `:17318`) and differs in one
important way — it appends the line to the outcome name when the provider supplies one
(`:17326-17328`):

```python
punto = o.get("point")
if punto is not None:
    nombre = f"{nombre} {punto}"
```

which is what produces `"Over 2.5"` / `"Under 2.5"`. The Sportradar builder has no equivalent;
it depends on Sportradar's own outcome `name` already carrying the line.

`MERCADOS_VALIDOS = {"h2h", "spreads", "totals", "outrights"}` (`:17216`) constrains only the
Odds API request, not our internal vocabulary.

**And the consumer is narrower still.** `buscar_cuota_nuestra` (`:21851`) — the function the
scanner calls — reads exactly two keys off a catalog event:

- `markets.get("h2h", {})` at `:21880`, reached when
  `"1x2" in mkt_low or "gana" in sel_low or "winner" in mkt_low or "h2h" in mkt_low` (`:21879`);
- `markets.get("totals", {})` at `:21904` and `:21909`, reached when
  `"over" in sel_low or "más" in sel_low or "mas" in sel_low`, respectively
  `"under" in sel_low or "menos" in sel_low`.

Anything else hits `return None, ev` at `:21914` — "found the match, did not find the market".
`opciones_de_evento` (`:21919`), which feeds the pick corrector, is the same two keys and
nothing more: `h2h` labelled `"1X2"` (`:21925-21927`) and `totals` labelled `"Más/Menos"`
(`:21928-21934`).

| Our market key | Where it is produced | Where it is consumed by the scanner | Outcome labels |
|---|---|---|---|
| `h2h` | `:20270`, `:17318` | **yes** — `:21880` | home team name / `"Draw"` / away team name |
| `totals` | `:20272`, `:17318` | **yes** — `:21904`, `:21909` | `"Over <line>"` / `"Under <line>"`, matched by `k.lower().startswith("over"/"under")` |
| `btts` | `:20274` | no | `"Yes"` / `"No"` (raw provider name) |
| `spreads` | `:20276` | no | raw provider name |
| *(anything else)* | `:20278` — raw name, 40 chars | no | raw provider name |

**Our system understands four market kinds in the catalog and two in the scanner.** That is the
whole vocabulary. **[DOCS: our code]**

### 8.1 What GR8 documents — the size of their line

`additional-markets-description-overview.md` lists 39 sports, each with a `MarketTypes`,
`Periods` and `ResultKinds` page (and offers a `MarketsDescriptionCSV.zip` bundle). Counting
the rows of every `MarketTypes` table in the download:

| Sport | Documented `marketType` rows | Sport | Rows | Sport | Rows |
|---|---|---|---|---|---|
| Football | **250** | MMA | 38 | Futsal | 21 |
| Cricket | 135 | UFC | 38 | AmericanFootball | 19 |
| CyberSport | 92 | Baseball | 35 | MotorSport | 19 |
| IceHockey | 81 | Kabaddi | 33 | Floorball | 17 |
| Tennis | **53** | Boxing | 30 | Handball | 15 |
| Basketball | **52** | Volleyball | 24 | BeachFootball | 14 |
| | | Biathlon | 23 | Darts | 12 |

…plus Rugby 12, Badminton 11, Bandy 10, Squash 10, TableTennis 10, BeachVolleyball 9, Bowls 9,
FieldHockey 9, WaterPolo 9, Snooker 8, AustralianRulesFootball 7, Olympics 7, Curling 6,
Chess 5, Politics 4, HorseRacing 3, AnyOther 2, Entertainment 2, Golf 1.
**1,135 market types across 39 sports.** **[DOCS]**, counted from the
`additional-markets-description-*-MarketTypes.md` pages.

A `marketType` is *not* the market identity on its own. The full key is
`{marketType, MarketItem.values, period, subPeriod, resultKind}` plus the outcome's
`{type, values}` — so 250 football market types multiply out across 7 base periods, 3 special
minute-range period forms and 24 result kinds. The 250 is a floor, not a ceiling.

### 8.2 The mapping table

Read as: **GR8 code → documented name → its outcome codes → the key our catalog would file it
under, or nothing.** "—" in the last column means we have no equivalent and the market would be
dropped or, at best, parked under an unreadable 40-character fall-through key (`:20278`).

#### Football — `additional-markets-description-Football-MarketTypes.md` (250 types)

| `marketType` | `Name` | `Outcomes` | Our key | Note |
|---|---|---|---|---|
| `2` | `MatchResult` | `0 - Win1`, `1 - Draw`, `3 - Win2` | **`h2h`** | The exact fit, and the only one. Requires `period = 0` and `resultKind = 1`. GR8's own worked example: `"[2,[],[0],1,1,[]]"` = "Draw by goals in main time" (`additional-markets-description-Outcome-Selection-Key-Structure.md`). |
| `1` | `Winner` | `0 - Win1`, `3 - Win2` | `h2h`, **but not the same market** | Flagged `Market for FullTime = yes`. Two-way, no draw: this is the knockout-tie winner after extra time/penalties, not the 90-minute result. Filing it under `h2h` next to `2` would put two different questions under one key. |
| `5` | `Total` | `4 - Over`, `5 - Under` | **`totals`** | `MarketItem.values` = "total value - numeric". Only safe when `resultKind = 1` (Goals) — see §8.4. |
| `4` | `Handicap` | `86 - HandicapWin1`, `87 - HandicapWin2` | `spreads` | Carried in the catalog, never read by the scanner. |
| `28` | `BothToScore` | `14 - Yes`, `15 - No` | `btts` | Carried, never read. |
| `3` | `DoubleChance` | `8 - Win1X`, `9 - WinX2`, `10 - Win12` | — | |
| `7` | `TeamTotal` | `37 - OverTeam`, `38 - UnderTeam` | — | Distinct outcome codes from `5`, so no collision — but our `totals` is match-total only. |
| `403` | `DrawNoBet` | `0 - Win1`, `3 - Win2` | — | Same outcome codes as `1`. |
| `141` | `WinNoBet` | `0 - Win1`, `1 - Draw`, `3 - Win2` | — | **Same outcome codes as `2`.** Distinguishable only by `marketType`. |
| `255` | `NumberOfVictoriesComparison` | `0 - Win1`, `1 - Draw`, `3 - Win2` | — | Third market with the 1/X/2 outcome triple. |
| `153` | `Total3Ways` | `4 - Over`, `5 - Under`, `25 - Exact` | — | Over/Under codes identical to `5`. |
| `195` | `AsianTotal` | `4 - Over`, `5 - Under` | — | Ditto. |
| `10` | `HalfTimeAndMainTime` | `16 - Win1_Win1` … `24 - Win2_Win2` | — | |
| `16` | `CorrectScore` | `102 - Score {s1}-{s2}` | — | Outcome name is a template, not text. |
| `20` | `ResultAndTotal` | `27 - Win1_Over` … `34 - WinX2_Under` | — | |
| `31` | `WillBeRedCard` | `14 - Yes`, `15 - No` | — | |
| `39` | `WinningMargin` | `1 - Draw`, `300`–`303` | — | |
| `69`, `70`, `100`–`104`, `197`, `198`, `223`, `412`–`415`, `418`–`420`, `477`, `484`–`486`, `491`, `496`–`498`, `555`, `570`, `1200` | 28 further `…Total` families (red cards, penalties, home/away aggregates, highest-scoring team, …) | `4 - Over`, `5 - Under` | — | **31 football market types share the `4`/`5` outcome pair.** Keying `totals` on outcome codes alone merges all of them. |
| the remaining 205 | goal-method, goal-interval, come-from-behind, 5-minute-interval, tournament-progression, player markets, … | — | — | No equivalent anywhere in our code. |

**Coverage, stated plainly: of 250 documented football market types we can file 5, and the
scanner can read 2 of those 5.** In percentage terms the catalog would carry 2% of GR8's
documented football line and the scanner would match against 0.8% of it.

#### Basketball — `additional-markets-description-Basketball-MarketTypes.md` (52 types)

| `marketType` | `Name` | `Outcomes` | Our key | Note |
|---|---|---|---|---|
| `2` | `Winner3Ways` | `0 - Win1`, `1 - Draw`, `3 - Win2` | **`h2h`** | Not flagged `Market for FullTime` → regulation time, draw possible. |
| `145` | `Winner2Ways` | `0 - Win1`, `3 - Win2` | **`h2h`** | Also not FullTime-flagged. Two market types compete for one key. |
| `5` | `Total` | `4 - Over`, `5 - Under` | **`totals`** | `Market for FullTime = yes` — includes overtime, unlike `2`. |
| `4` | `Handicap` | `86 - HandicapWin1`, `87 - handicapWin2` | `spreads` | `Market for FullTime = yes`. Note GR8's own lowercase `handicapWin2` typo in this table. |
| `7` | `TeamTotal` | `37 - OverTeam`, `38 - UnderTeam` | — | |
| `20` | `MatchResultAndTotal` | `27 - Win1_Over` … `30 - Win2_Under` | — | |
| `258`, `259`, `417`, `801`, `901`, `1023`, `1163` | quarter/player/free-form totals | `4 - Over`/`5 - Under` or `37`/`38` | — | |
| the remaining 39 | first/last point, rebound, steal, block, foul, double-double, … | — | — | |
| *(none)* | — | — | `btts` | **Basketball has no both-teams-to-score market.** Our `btts` key is simply unused here. |

**4 of 52.** Scanner-readable: 3 (`2`, `145`, `5`) — and `2` vs `145` must be disambiguated
before either becomes `h2h`.

#### Tennis — `additional-markets-description-Tennis-MarketTypes.md` (53 types)

| `marketType` | `Name` | `Outcomes` | Our key | Note |
|---|---|---|---|---|
| `1` | `Winner2Ways` | `0 - Win1`, `3 - Win2` | **`h2h`** | Two-way. Our `"Draw"` label never appears, and `opciones_de_evento`'s `h2h.get("Draw")` (`:21926`) simply yields nothing. |
| `5` | `GamesTotal` | `4 - Over`, `5 - Under` | **`totals`** | Total *games*. |
| `235` | `SetsTotal` | `4 - Over`, `5 - Under` | `totals` — **collision** | Total *sets*. Same outcome codes, incompatible unit. |
| `264` | `PointsTotal` | `4 - Over`, `5 - Under` | `totals` — **collision** | Total *points*. |
| `1102`, `1105`, `1117`, `347`, `348` | aces / double faults / tiebreaks / match points / set points totals | `4 - Over`, `5 - Under` | — | Five more `4`/`5` families. |
| `4` | `GamesHandicap` | `86 - HandicapWin1`, `87 - handicapWin2` | `spreads` | |
| `260` | `SetsHandicap` | `86 - HandicapWin1`, `87 - handicapWin2` | `spreads` — **collision** | |
| `1111`, `1113` | aces / double-faults handicap | `86`, `87` | — | |
| the remaining 40 | tie-break, deuce, correct score, serve percentages, break markets, … | — | — | |

**2 usable, and `totals` is ambiguous unless `marketType` is carried through.** Eight tennis
market types emit `4 - Over` / `5 - Under`; three emit `86`/`87`.

**The general finding.** Outcome codes are *not* unique per market — `4`/`5` (Over/Under),
`14`/`15` (Yes/No), `0`/`1`/`3` (Win1/Draw/Win2), `11`/`12`/`13` (Team1/None/Team2) and
`86`/`87` (Handicap) recur across dozens of market types within a single sport. **A mapping
keyed on outcome type alone is wrong by construction; the key must be `marketType` first.**
This is the opposite of how both our builders work today, which classify on the provider's
market *name* string (`:20269`) and then label outcomes by their type string (`:20291`).
**[DOCS + INFERENCE]**

### 8.3 How a GR8 outcome becomes our `sel` — and the three places it goes wrong

Our stored pick carries `sel` as a human string (`sportsbook-integration-analysis.md` §3);
`market` is parsed but never stored. The scanner matches `sel` by `_mismo_club(selection,
nombre)` against `h2h` keys (`:21888`) or by `startswith("over"/"under")` against `totals` keys
(`:21906`, `:21911`).

**The mechanism GR8 documents.** `additional-market-translation-overview.md`:

> Markets, outcomes and periods are returned by the line endpoints as numeric ids. To display
> them in a player's language you fetch a translation schema and resolve those ids against it.

> Each entity is a map of entity id to an array of entity translations. All entities (except
> trading types) have complex rules for translation. These rules are compactly encoded in
> `condition` property. Client code should check every condition in array and **first matching
> should be used** for translation.

**The `condition` grammar**, verbatim from
`additional-market-translation-condition-format.md` — this is the page that was missing:

> The condition consists of several parts separated by a colon… Each condition part is either a
> simple expression… or not set.
>
> | Operator | Meaning |
> |---|---|
> | `=` | Value should be equal to the provided constant |
> | `!` | Value should not equal to the provided constant |
> | `>` | Value should be greater than the provided constant |
> | `<` | Value should be less than the provided constant |

with the per-entity slot layouts:

| Entity | Colon-separated slots |
|---|---|
| `Market` | `sportCondition : tradingTypeCondition : periodCondition : value1Condition : marketParameter2` |
| `Outcome` | `sportCondition : marketTypeCondition : marketValue1Condition : outcomeValue1Condition : … : outcomeValuesCountCondition` |
| `Period` | `periodCondition : subPeriodCondition : periodsCountCondition` |
| `TradingType` | "Conditions are not used" |
| `Prompt` | `sportCondition : tradingTypeCondition : periodCondition : subPeriodCondition` |

Worked example from the page: `"=H:::"` matches "if sport (event schema) is Hockey"; `":1::"`
matches "if trading type is 1"; `":::>4:"` matches "if market value is greater than 4"; and
`"=CK:=1::!null"` shows that `null` is a literal the grammar has to handle for `subPeriod`.
**This is implementable — it is five string comparisons, not an expression language.**

**Correction to §1.** §1 recorded, from the localization response example, that the returned
strings were "finished, literal text" with "no `{Team1}`-style placeholder anywhere". That was
true of the example and **false of the format**.
`additional-market-translation-translation-format.md` documents the full placeholder set:

> | Format | Replaced with |
> |---|---|
> | `{p1}`, `{p2}`, `{p3}` | First / second / third market item value |
> | `{s1}`, `{s2}` | First / second outcome value |
> | `{r1}`, `{r2}` | Period value / SubPeriod value |
> | `{Team1}`, `{Team2}` | First team name / second team name |
> | `{TeamID1}`, `{TeamID2}` | "Name of the competitor whose ID is specified in the first/second market parameter" |
> | `{Team{p1}}` | Market item value 0 "translated as first or second team name in the pair competitor1 - competitor2 based on the parameter value (1 or 2)" |
> | `#competitor{p1}`, `#player{p1}`, `#player{s1}` | "…that will be translated by a **separate request**" |

The `#competitor` / `#player` / `{Team{p1}}` forms carry a `requestToStrapi` step in GR8's own
examples — **a second lookup against a different service, per placeholder**. The MTS report's
"templates with placeholders" finding therefore survives intact; the bulk dictionary is a
cheaper delivery of the same substitution problem, not a replacement for it. **[DOCS]**

**The concrete path for the two markets we can actually use.**

| Our target | GR8 inputs | Substitution | Result |
|---|---|---|---|
| `h2h` key for home | `marketType 2`, `outcome.key.type = 0` (`Win1`) | outcome translation for type `0` is `{Team1}` → `competitors[0].name` | `"<home name>"` |
| `h2h` key for away | `outcome.key.type = 3` (`Win2`) | `{Team2}` → `competitors[1].name` | `"<away name>"` |
| `h2h` key for draw | `outcome.key.type = 1` (`Draw`) | dictionary text, e.g. `"Draw"` at `lang=en`, `"Empate"` at `lang=es` | **must be pinned to `"Draw"`** |
| `totals` key | `marketType 5`, `MarketItem.values = ["2.5"]`, `outcome.key.type = 4`/`5` | `{p1}` → `"2.5"` | `"Over 2.5"` / `"Under 2.5"` |

**Where it goes wrong — three specific places, all in our code, not GR8's.**

1. **The draw.** `_sr_mercados_formato_app` writes the literal `"Draw"` (`:20295`),
   `_armar_all_markets` reads `markets.get("h2h",{}).get("Draw")` (`:19041`),
   `_sr_armar_all_markets` reads `markets["h2h"].get("Draw")` (`:20358`), and
   `opciones_de_evento` reads `h2h["Draw"]` (`:21926`). If a GR8 adapter fetched
   `localization/markets?lang=es` and used the returned string, the draw key becomes
   `"Empate"` and **all four of those lookups return `None`** — the front-end `odds.E` goes
   blank and the corrector stops offering the draw. `buscar_cuota_nuestra` would still find it,
   because it has a separate `("Draw", "Empate", "X")` fallback at `:21892`. The catalog must
   therefore be built in English and localized only at display time, or the four call sites
   must change.

2. **Team-name orientation.** GR8's `Win1`/`Win2` are positional, and `EventCompetitor` has no
   `qualifier` field (§7.1) — so `competitors[0]` is home only by assumption. The scanner
   survives this, because `buscar_cuota_nuestra` looks the selection up by name across
   `h2h.items()` (`:21887-21889`) and tries both orientations of the fixture (`:21869-21872`).
   **The display does not**: `odds.L` / `odds.V` are built with `markets["h2h"].get(home)` /
   `.get(away)` (`:20357`, `:20359`), so a wrong guess swaps the local and visitor columns on
   the prematch screen while the scanner keeps working. A silent, plausible-looking error.

3. **Over/under thresholds.** GR8 returns the line on the parent `MarketItem.values`, not on
   the outcome, and returns **several `MarketItem`s per market** — GR8's own example in
   `additional-markets-description-Outcome-Selection-Key-Structure.md` shows one `marketType 5`
   market carrying `values ["6.5"]`, `["7.5"]` and `["8.5"]` side by side. Our `totals` is a
   flat `{label: price}` dict, so every line has to be folded into the label
   (`"Over 6.5"`, `"Over 7.5"`, …). Then `buscar_cuota_nuestra` matches with
   `if k.lower().startswith("over")` and **returns the first match it finds** (`:21906-21907`)
   — with three lines in the dict it returns an arbitrary one, ignoring the threshold the rival
   ticket actually named. This is already latent today; a GR8 feed, which supplies many more
   lines per market than Sportradar's main-market view, makes it routine rather than rare.

**One field worth noting that our pick has nowhere to put.**
`additional-markets-description-Outcome-Selection-Key-Structure.md` documents a compact, stable
outcome identity:

> `"[marketType,[marketParam1,marketParam2],[period,subperiod],resultKind,outcomeType,[outcomeParam1,outcomeParam2]]"`
> — *No spaces within selection key are allowed*

e.g. `"[5,[6.5],[0],4,4,[]]"`. This is exactly what a stored pick should carry instead of a
human string, and our persisted pick has no field for it
(`sportsbook-integration-analysis.md` §3). **[DOCS + INFERENCE]**

### 8.4 Periods and ResultKinds — and why ignoring them is silently wrong

**`period` / `subPeriod` is *when*.** `additional-markets-description-Football-Periods.md`:

> If Period and subperiod are filled then Period contains "from minute" and Subperiod contains
> "to minute", if subperiod is empty then period corresponds this table:

| `Period` | Football | Basketball (`…-Basketball-Periods.md`) | Tennis (`…-Tennis-Periods.md`) |
|---|---|---|---|
| `0` | `Main Time` | `Main Time/Full Time` — "Period 0 could be main time or full time **depending on market type**" | `Match` |
| `1`–`2` | `Half1`, `Half2` | `Quarter 1`, `Quarter 2` | `Set1`, `Set2` |
| `3`–`6` | `Overtime`, `Penalties`, `Extra Time, Half1`, `Extra Time, Half2` | `Quarter 3`, `Quarter 4` | `Set3`, `Set4`, `Set5` |
| `4010` / `4011` | — | `Half 1` / `Half 2` | — |
| `90` | `From {subperiod} minute to the end of the match` | — | — |
| `888` | `After {subperiod} minute` | — | — |
| `6000` | `{subperiod}-Minute` | — | — |

Tennis adds its own rule: "If Period and subperiod are filled then Period contains 'Set' and
Subperiod contains 'Game'".

**`resultKind` is *what is being counted*.** `additional-markets-description-Football-ResultKinds.md`
documents 24 values for football alone:

| `ResultKind` | `Name` | | `ResultKind` | `Name` |
|---|---|---|---|---|
| `1` | `Goals` | | `67` | `Offsides` |
| `2` | `Fouls` | | `94` | `Goal kicks` |
| `4` | `Corners` | | `95` | `Saves` |
| `8` | `Yellow cards` | | `96` | `Throw-ins` |
| `14` | `Shots all` | | `97` | `Substitutions` |
| `16` | `Red cards` | | `98`–`103` | `Successful dribbles`, `Tackles`, `Passes`, `Interceptions`, `Aerial duels won`, `Crosses` |
| `32` | `Penalties` | | `105`, `108` | `Ball clearance`, `Distance covered (km)` |
| `65` | `Ball possesion (%)` *(sic)* | | `114`, `118` | `Personal fouls`, `Successful passes` |
| `66` | `Shots on target` | | | |

Basketball has 9 (`1 Scores`, `23 3-pointers`, `30 Steals`, `33 2-pointers`, `35 Turnovers`,
`78 Block shots`, `79 Rebounds`, `82 Assists`, `114 Personal fouls`); tennis has exactly one
(`1 Scores`).

**Is taking only full-time, main-result safe? No — it is safe for `period`, and unsafe for
`resultKind`.** GR8's own worked example makes the trap concrete
(`additional-markets-description-Outcome-Selection-Key-Structure.md`, "Total:"):

```json
"key": { "eventId": "12550185", "resultKind": 4, "marketType": 5,
         "period": 0, "subPeriod": null },
"marketItems": [ { "values": ["6.5"], … }, { "values": ["7.5"], … }, { "values": ["8.5"], … } ]
```

`marketType 5` is `Total`, `period 0` is main time, and `resultKind 4` is **`Corners`** — and
the totals are 6.5 / 7.5 / 8.5, which are corner numbers, not goal numbers. **A filter of
`marketType == 5 && period == 0` alone files a corners market into our `totals` key as if it
were goals.** Nothing downstream would notice: the label reads `"Over 6.5"`, the price is
plausible, the scanner matches it against a rival's goals ticket, and we quote a price for the
wrong question. `resultKind == 1` must be pinned explicitly. **[DOCS]**

**A second, smaller trap: `Market for FullTime`.** Each `MarketTypes` table carries a
`Market for FullTime` column. For football only `1 Winner`, `18 ToQualify` and
`151 MethodOfQualifying` are flagged `yes`; for basketball `4`, `5`, `6`, `7`, `9` and `10` are
flagged and `2 Winner3Ways` / `145 Winner2Ways` are not. So at `period = 0`:

- football `marketType 2` = the 90-minute result; football `marketType 1` = the tie winner
  after extra time and penalties;
- basketball `marketType 5` (Total) includes overtime, while basketball `marketType 2`
  (Winner3Ways) does not.

**Full time versus main time is decided by the market type, not by the period value.** Two
markets with identical `period 0` resolve on different clocks. For settlement this matters more
than for display. **[DOCS]**

### 8.5 The scanner verdict

**The scanner can work on a GR8-sourced catalog. It matches by team names, which GR8 gives
directly as `competitors[].name`, and by two market kinds whose GR8 identity is now fully
documented — `marketType 2` with `resultKind 1` for `h2h` and `marketType 5` with
`resultKind 1` for `totals` — so the market-name join our code needs is a small, closed,
testable table, not an open-ended translation problem.** The cost is that it would be matching
against roughly 2% of GR8's documented football line, because our vocabulary is four keys wide
and theirs is 250 market types deep for football alone.

What has to be built, revised against the new pages:

1. **A `marketType` allow-list, not a name classifier.** Five football entries, four basketball,
   two tennis (§8.2), each gated on `resultKind` and `period`. This replaces the substring
   matching at `:20269-20278`, which has nothing to match on — GR8 markets carry no name at
   all (§1).
2. **A localization dictionary cache**, keyed on `translationVersion`, invalidated via
   `GET /v0/sport/feed/localization/market-translation-version`, plus a `condition` evaluator
   (§8.3 — five slot comparisons with `=`, `!`, `>`, `<`) and a placeholder substituter
   (`{p1}`, `{s1}`, `{Team1}`, `{r1}`). **This is needed for display, not for the scanner.**
   For the five market types we can file, the outcome→label mapping is a hardcoded table
   (`0 → home`, `1 → "Draw"`, `3 → away`, `4 → "Over {p1}"`, `5 → "Under {p1}"`) and the
   dictionary adds nothing the table does not already give. The dictionary becomes necessary
   the moment anyone wants to show a sixth market kind, and the `#player` / `#competitor`
   placeholders require a further per-entity request GR8 documents but does not specify here.
3. **An over/under threshold fix in `buscar_cuota_nuestra`** (`:21902-21912`). The current
   `startswith("over")`-returns-first behaviour is wrong against any feed carrying more than
   one line per market, and GR8 carries several by design.
4. **A home/away rule.** Unchanged from §7.1 and still unanswered by this download: the
   `Additional` pages describe `Win1`/`Win2` as positional (`{Team1}`/`{Team2}`) and never say
   which position is home. The scanner tolerates this; the prematch display does not (§8.3).
5. **Nothing else.** The `condition` DSL is implementable, the dictionary is one cached call
   per language, and the whole join runs in memory with no per-event or per-selection request
   on the hot path.

**The deciding sentence: the blocker is no longer documentation, it is scope.** Every question
that made the scanner unspecifiable is now answered on disk; what remains is that our two-market
vocabulary would leave 98% of GR8's line unrepresented, and that the one market we would most
want — over/under — has both a correctness bug on our side and a `resultKind` trap on theirs.
**[DOCS + INFERENCE]**

---

## Source index

Pages read in full from `local-docs/gr8-sportsbook-api-docs/`:

**Top level** — `sportsbook-api-overview.md`, `sportsbook-api-quick-start.md`,
`sportsbook-api-architecture.md`, `sportsbook-api-changelog.md`,
`sportsbook-api-gr8-api-get-started.md`,
`sportsbook-api-gr8-api-api-integration-recommendations.md`.

**Line API** — `sportsbook-api-gr8-api-line-get-started.md`,
`sportsbook-api-gr8-api-line-line-api-get-started.md`,
`sportsbook-api-gr8-api-line-line-api-api-integration-recommendations.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-events.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-events-7Bid-7D.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-events-markets.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-events-7Bid-7D-markets.md`,
`sportsbook-api-gr8-api-line-line-api-post-v1-sport-v0-line-events-outcomes.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-sports.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-tournaments.md`,
`sportsbook-api-gr8-api-line-line-api-get-v1-sport-v0-line-categories.md`,
`sportsbook-api-gr8-api-line-line-api-market-overview.md`.

**DirectFeed API** — `sportsbook-api-gr8-api-line-directfeed-api-get-started.md`,
`sportsbook-api-gr8-api-line-directfeed-api-info.md`,
`sportsbook-api-gr8-api-line-directfeed-api-api-integration-recommendations.md`,
`sportsbook-api-gr8-api-line-directfeed-api-get-v0-sport-feed-schema.md`,
`sportsbook-api-gr8-api-line-directfeed-api-get-v0-sport-feed-main-markets-filters-7Bprofilename-7D.md`,
`sportsbook-api-gr8-api-line-directfeed-api-get-getricheventsbysportandtimerange.md`,
`sportsbook-api-gr8-api-line-directfeed-api-get-getmainmarketsbysportandtimerange.md`,
`sportsbook-api-gr8-api-line-directfeed-api-get-getoutcomesv2.md`. The remaining ~55
DirectFeed method pages were checked by search (`hasBetradarMapping`, schema shape) and confirmed
to repeat the same `RichEvent` / `Market` / `MarketOutcome` schemas under different subscription
filters; they were not each read in full.

**Localization API** — `sportsbook-api-gr8-api-line-localization-api-get-started.md`,
`...-get-v0-sport-feed-localization-markets.md`,
`...-get-v0-sport-feed-localization-market-translation-version.md`,
`...-get-v0-sport-feed-localization-market-tabs.md`,
`...-get-v0-sport-feed-localization-content-by-event-ids.md`.

**Competitor / results / content** —
`sportsbook-api-gr8-api-line-competitor-info-api-get-v0-sport-competitors-info-head-2-head-statistics.md`,
`sportsbook-api-gr8-api-line-competitor-info-api-get-v0-sport-competitors-info-7Bcompetitorid-7D-results.md`,
`sportsbook-api-gr8-api-event-content-results-page-api-get-started.md`,
`sportsbook-api-gr8-api-event-content-results-page-api-get-v0-sport-summary-page-7Beventid-7D.md`,
`sportsbook-api-gr8-api-event-content-event-content-api-get-started.md`,
`sportsbook-api-gr8-api-other-tournament-info-api-get-v0-sport-tournaments-info-7Btournamentid-7D-results.md`.

**Auth / other** — `sportsbook-api-gr8-api-auth-get-started.md`,
`sportsbook-api-gr8-api-other-navigation-api-get-v0-navigation-v5-search.md`.

**Read only by targeted search, not in full** — the Bets, Free Bets, Cashout, Bet Builder,
Express Boost, Overasks, Shared Bet, Favorites, Personalization, Recommender, Top Expresses,
Win-Feed, User Settings, Auto Banners, Custom Pages and Lock-Screen Notification pages. They
belong to the betting/wallet path, not the feed, and are noted in §5 in one line each.

**Referenced by these pages and NOT present in this download** (in rough order of value):
~~*Market Translation*, *Markets Description* (per-sport market/outcome id catalogue), *API
Conventions* (path versioning, version headers, rate limits)~~ — **downloaded 2026-09-18, see
below** — the entire *S2S API* section including "Get ids of active events", the
*Domain / Scores description* pages, *Wallet integration*, the *Data API* GraphQL interface,
and the *KnowledgeHub Direct-Feed Protocol*.

### Second download — `local-docs/gr8-additional-docs/`, 123 pages, 2026-09-18

**Markets Description** — `additional-markets-description-overview.md`,
`additional-markets-description-Outcome-Selection-Key-Structure.md`, plus
`additional-markets-description-<Sport>-MarketTypes.md`,
`additional-markets-description-<Sport>-Periods.md` and
`additional-markets-description-<Sport>-ResultKinds.md` for 39 sports: AmericanFootball,
AnyOther, AustralianRulesFootball, Badminton, Bandy, Baseball, Basketball, BeachFootball,
BeachVolleyball, Biathlon, Bowls, Boxing, Chess, Cricket, Curling, CyberSport, Darts,
Entertainment, FieldHockey, Floorball, Football, Futsal, Golf, Handball, HorseRacing,
IceHockey, Kabaddi, MMA, MotorSport, Olympics, Politics, Rugby, Snooker, Squash, TableTennis,
Tennis, UFC, Volleyball, WaterPolo. Read in full: Football, Basketball and Tennis (all three
pages each); the other 36 `MarketTypes` tables were parsed for row counts (§8.1) and spot-read.

**Market Translation** — `additional-market-translation-overview.md`,
`additional-market-translation-condition-format.md`,
`additional-market-translation-translation-format.md`. All three read in full.

**API Conventions** — `additional-api-conventions.md`, read in full.

---

## What remains genuinely unanswered

### Closed by the 2026-09-18 `Additional` download

- ~~**1. The numeric market/outcome catalogue.**~~ On disk: 1,135 market types across 39 sports
  (`additional-markets-description-*-MarketTypes.md`). Mapping written in §8.2.
- ~~**2. How `condition` is evaluated.**~~ On disk:
  `additional-market-translation-condition-format.md` gives the four operators and the
  per-entity slot layout; transcribed in §8.3.
- ~~**10. `resultKind` vs `tradingType`.**~~ Effectively answered, though never stated in one
  sentence: `getMarketName()` is documented as taking `marketId.resultKind` together with
  `translations.tradingTypes` and receives nothing named `tradingType`
  (`additional-market-translation-overview.md`), while the `Market` condition's second slot is
  `tradingTypeCondition` (`additional-market-translation-condition-format.md`). They are one
  field under two names. **[INFERENCE]**, now a short one — but see question 8 below for the
  one piece of contrary evidence.

### The list to put to GR8

Ordered by how much a wrong answer costs us.

1. **Which competitor is home?** `EventCompetitor` carries `id`, `name`, `icons`, `slug` and no
   `qualifier` / `isHome` / `side` field (§7.1), and the `Additional` pages only deepen the
   problem: `Win1`/`Win2` and `{Team1}`/`{Team2}` are documented as positional
   (`additional-market-translation-translation-format.md`) without ever saying which position
   is the home side. **Is `competitors[0]` always the home/first-named competitor, guaranteed,
   for every sport and every event type — and is there any field that states it?** Our prematch
   display builds `odds.L` / `odds.V` from `markets["h2h"].get(home)` / `.get(away)`
   (`bot/casino_api.py:20357`, `:20359`), so a wrong assumption swaps the two columns silently.

2. **Can we have the Betradar/Sportradar event id, not just the boolean?**
   `hasBetradarMapping` is exposed on the DirectFeed event objects and is the only mention of
   Betradar in 314 pages; **no field anywhere carries the mapped id**. Our settlement trusts
   `event_id` only when it starts with `"sr:sport_event:"` — three separate call sites,
   `bot/casino_api.py:20813`, `:20842` and `:20941`; everything else falls back to a name+date
   match against Sportradar's own schedule. **Is the
   id available — on any endpoint, any surface, by contract addendum, or via the Data API
   GraphQL interface?** This single answer decides whether our settlement path works unchanged
   or needs a new branch (§7.2).

3. **What is the actual rate limit?** `additional-api-conventions.md` now documents the failure
   mode but not the number:

   > If you have received `429 Too Many Requests` - you are facing with rate limiting or
   > throttling from our side. Such failed requests should be retried with some backoff pattern.
   >
   > **Different endpoints have different rate limits.** For details read endpoint
   > documentation, otherwise contact company representative.

   No Line API, Localization API or Results Page endpoint page in either download states a
   number. **What is the per-ApiKey quota for `/line/events`, `/line/events/markets` and
   `/localization/markets`, and is it per second, per minute or per day?** Our refresh interval
   is a direct function of it (`ODDS_TTL_PREMATCH`, `bot/casino_api.py:17220`).

4. **Which `MarketItem` is the main line?** GR8's own example shows one `marketType 5` market
   carrying `values ["6.5"]`, `["7.5"]` and `["8.5"]` simultaneously
   (`additional-markets-description-Outcome-Selection-Key-Structure.md`). `profile=main` exists
   as a query parameter on the markets endpoints, described only as returning "only the main
   markets from this profile". **Does `profile=main` reduce a market to one `MarketItem`, or
   only filter which market types are returned? Is there any per-item main/primary flag?**

5. **What endpoint resolves the `#player{p1}`, `#competitor{p1}` and `{Team{p1}}` placeholders?**
   `additional-market-translation-translation-format.md` says these are "translated by a
   separate request" and its examples show a `requestToStrapi` step with `{"teamId": 1000}` /
   `{"playerId": 1000}`. **No such endpoint is documented in either download.** Not needed for
   the two markets we would ship first, needed for anything player-related.

6. **Does the `Market for FullTime` column mean the resolution clock?** For football only
   `marketType` `1`, `18` and `151` carry `yes`; for basketball `4`, `5`, `6`, `7`, `9` and
   `10` do, while `2 Winner3Ways` does not. **Confirm that at `period = 0` a flagged market
   resolves including overtime/extra time and an unflagged one resolves on regulation time**
   (§8.4). This is a settlement question, and nothing in the download states it in words.

7. **`size` — the supported page sizes and the default.** "Only specific values are supported"
   with no list, on all three paginated endpoints. Unchanged.

8. **Is the `tradingTypes` map keyed by `resultKind`?** The localization response example shows
   `"tradingTypes": {"101": {"translation": "Total Goals", "shortTranslation": "Goals"}}`
   (`...localization-api-get-v0-sport-feed-localization-markets.md`), but football
   `resultKind 101` is documented as `Interceptions`
   (`additional-markets-description-Football-ResultKinds.md`). Either the example is synthetic
   or the two numberings are different. **Which?** This is the one piece of evidence against
   the `resultKind == tradingType` conclusion above.

9. **Do `Statistic.typePlatformId` and `ResultKind` share a numbering?** The per-sport
   `ResultKinds` tables give football `4 = Corners`, `8 = Yellow cards`, `66 = Shots on target`.
   `ScoreboardV2.statistics[].typePlatformId` on the summary page is undocumented in both
   downloads. **If they are the same vocabulary, our corners/cards settlement path
   (`resolver_pick_sr`) is specifiable today; if not, we still need the Domain "Scores
   description" page.**

10. **Sandbox and environments.** No host pair, no credential process, no data-parity
    statement anywhere in 314 pages. Unchanged.

11. **Is the Line API BETA notice current?** "Release is expected at the start of 2026" on a
    page whose sibling changelog runs to mid-2026 with 1.x version numbers. Unchanged.

12. **Id stability across seasons.** `rev` and ETags version entities in-lifecycle; nothing
    states whether event, competitor, tournament or category ids are reused, retired or
    renumbered. Unchanged.

13. **Competitor-info and tournament-info payloads.** Four endpoints document their response
    schema as `None` with `"no example"`. Unchanged.
