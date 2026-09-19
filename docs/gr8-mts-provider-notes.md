# GR8 Tech MTS — provider notes, grounded in the downloaded documentation

Status: this file replaces the earlier reconnaissance version. That version was written when
only the public `/mts/overview` page was reachable; everything else redirected to an Auth0
login. The MTS documentation is no longer gated — 43 pages were downloaded to
`local-docs/gr8-mts-docs/` and are the primary source for everything below.

**Scope of this pass, per product-owner decision**: the commercial direction is to start with
GR8's **feed** — the part that only supplies odds/domain data and leaves our own engine, our
agency tree, and our scanner untouched. The bulk of this document is therefore the domain
model, identifiers, event timing, markets/selections/odds, and transport — the questions that
decide whether a pull-based catalog like ours can even be built on top of this. MTS-as-a-service
(who accepts a bet, who settles it) is covered in one short section near the end, enough for a
commercial conversation, not an integration study. Console screens, Operation Tools monitors,
player limits, cashout, and the return-code catalogue were read but are intentionally
compressed to one line each — they belong to the MTS-as-a-service path, which is out of scope
for this pass.

Tagging discipline, unchanged from the previous version: **[DOCS]** = stated in the downloaded
documentation, page cited by filename; **[MARKETING]** = from GR8's public product page or
press coverage; **[INFERENCE]** = our own reasoning, not stated by either source.

---

## 0. A separate documentation section was found and NOT downloaded — read this first

**[DOCS]** `mts-api-overview.md` names a second GR8 product, **Sportsbook API / S2S API**, that
MTS's own docs lean on:

> "History API and Limits API are the same endpoints the Sportsbook S2S reference documents —
> both products use them, and both copies are generated from the same spec, so they cannot
> drift apart."

> "Ids of active events — served by the gateway, documented with the **S2S Line API**"

Neither the Sportsbook API nor the S2S API section (nor specifically the "S2S Line API" that
apparently documents "ids of active events") was downloaded — only the 43 `mts/*` pages are on
disk. Given that this pass is specifically about whether a **pull-based** catalog is possible,
and given that the one hint of a synchronous "give me the current active events" read sits in
that undocumented section, **this is the single most valuable next download** before concluding
anything final about transport. Section 4 below explains why, working only from what MTS itself
documents.

---

## 1. Domain model and identifiers

Every domain object below is confirmed from a page that shows the actual JSON schema, not from
a sidebar link name — a real improvement over the previous version of this file, which had only
endpoint slugs to go on.

### Sport

**[DOCS]** (`mts-domain-sports.md`) Sport JSON:
```
{ "Id": string, "Name": {lang: string}, "Timestamp": DateTime, "DataVersion": int }
```
`Id` is a **string**. The event example (`mts-domain-events.md`) shows the sport id in use:
`"sport": "Tennis"` — i.e. the id is the sport's canonical English-like name, not a short code.
The sports page also lists a parenthetical short code per sport (`Football (F)`,
`Tennis (T)`, `CyberSport (CS)`, 40 sports total), but no page we read shows that short code
being used as an actual `sport` field value anywhere in the domain/feed objects.

**Inconsistency worth flagging**: the Limits API documentation (`mts-api-other-limits-api-...`,
read but out of scope for this pass) describes `SportLimitDto.sport` as a **"Short sport
identifier (e.g., "FB", "BB", "CR")"** — a different vocabulary from the full-name string the
Events/Sports domain objects use. **[DOCS, internal inconsistency]** — two GR8 API surfaces
document two different sport-id shapes. Since this pass is feed-only, only the domain-model
form (`"Tennis"`, `"Football"`) matters; note it for later if the Limits/Bets side ever comes
into scope.

### Category and Tournament

**[DOCS]** (`mts-domain-categories.md`, `mts-domain-tournaments.md`) Both are `string` ids,
shown as 32-character hex-like strings in the examples: category `"d51986ee879f49e99e0597b820a34ff6"`,
tournament `"dacd14f5070b43b1b53d0382ff8567c7"`. A category is explicitly described as
"tournament group by country or championship type." A tournament carries its own `sport` (the
same string id as above), `gender`, `competitorType`, and an `isInternational` flag. Both carry
a `dataVersion` int that "increments when one of category fields are changed" — versioned, but
no explicit statement anywhere about long-term id permanence (e.g. across seasons).

### Event

**[DOCS]** (`mts-domain-events.md`) Full JSON schema read. Key identifier fields:
```
"id": string,                // event id, e.g. "9688042"
"tournamentId": string,      // e.g. "e911171d55394b159d98c4cd6daa06f2"
"categoryId": string,
"competitors": [{ "id": string, "name": {lang: string}, "slug": string }],
"sport": string,              // e.g. "Tennis" — the Sport's Id, see above
"dataVersion": int, "eventDataVersion": int, "sourceDataVersion": bool(sic in doc)
```
`id` is a bare numeric string (`"9688042"`) with **no namespace prefix** — nothing like
Sportradar's `sr:sport_event:` convention. `eventDataVersion` "increments when one of event
fields are changed from Feed", which is the closest the docs come to a lifecycle-stability
statement — an event is expected to keep the same `id` while its data mutates. Indirect
confirmation: the `Postponed` status is described as "event's start-time was rescheduled"
(`mts-domain-event-statuses.md`) — a postponed event stays the same event, same id, with a
new `startTime`, not a new event.

**No mapping to a third-party id (Betradar, Sportradar, or any other) is documented anywhere**
in the Event, Competitor, Tournament, Category, Market, or Result JSON schemas we read. This
was the single biggest open question in the previous version of this file (when it could only
be inferred from an inaccessible page); it is now a **confirmed absence**, not a gap caused by
a login wall — we read the full schemas and the field simply is not there.

### Competitors and players

**[DOCS]** Competitor: `{ "id": string, "name": {lang: string}, "nameMobile": {lang: string},
"slug": string }`. Numeric-string id (`"169339"`), literal localized name map, and a short
`nameMobile` variant (e.g. `"Bondarenko M."`). This is a real, literal team/player name — the
part of the domain model closest to what our scanner already works with for `home`/`away`.

### Languages

**[DOCS]** (`mts-domain-languages.md`) Every name map (`event.name`, `competitor.name`,
`tournament.name`, `category.name`, `sport.Name`, market/selection translations) is keyed by an
ISO-639-1-ish code from a documented list (`en`, `es`, `ru`, `ar`, ...), plus two irregular
codes: `en_Mob` ("market, period and outcome names come back as `1/2` where `en` returns
`Winner`. Sport, category, tournament, event and competitor names are not available for this
code") and `kg` ("accepted, but it is not an ISO 639-1 code (`ky` is Kyrgyz). Check which
language it maps to before using it."). The page states plainly: "Translation coverage is data,
not contract: a language can be fully translated for one entity type and absent for another."

---

## 2. Event start time

**[DOCS]** (`mts-domain-events.md`) Field name, type, and a verbatim example:
```
"startTime": DateTime, // date and time when event starting
```
Example value: **`"startTime": "2023-02-27T15:33:00Z"`** — ISO-8601, UTC (the trailing `Z`).
Every other timestamp on the same object (`timestamp`, `aggregateTimestamp`) follows the same
convention with sub-second precision, e.g. `"timestamp": "2023-02-27T15:30:05.4282723Z"`.

This is the exact question the earlier provider burned us on (a display-string-only start time).
GR8's documentation shows a structured, UTC, machine-parseable field with a concrete example —
not a display string. This is the best-behaved field found across the whole domain model, and
it lines up directly with how `commence_time` is already parsed in our code
(`.replace("Z","+00:00")`, per `sportsbook-integration-analysis.md` §1.2).

---

## 3. Markets and selections — identification, odds, naming and translations

This is the section that matters most for the scanner, and it is the sharpest mismatch found
in this pass.

### How a market is identified

**[DOCS]** (`mts-domain-markets.md`) A market has **no single id field and no name field** in
its own JSON. It is identified by a **composite structural key**:
```
"key": {
  "eventId": string,
  "tradingType": int,   // e.g. 1
  "marketType": int,    // e.g. 145, 2, 3, 4 — the core "which market" code
  "period": int,        // e.g. 0, 2
  "subPeriod": nullable int,
  "layout": nullable string  // free-form template id, see below
}
```
An outcome (selection) within a market item is identified the same way — structurally, not by
name:
```
"outcomeType": int,             // id type of outcome
"outcomeValues": [string],      // e.g. handicap line value, "-1.5"
"selectionKey": string,         // e.g. "[145,[],[0],1,0,[]]" — outcome identifier for bet acceptance
```
`selectionKey` is a bracket-array-encoded string, not a human label. The docs are explicit that
this exact value is "required for bet acceptance" — it is a wire identifier, not a display
string.

### How odds are expressed

**[DOCS]** `"price": double` on each outcome, decimal-looking values throughout every example
we read (1.85, 1.89, 2.53, 12.0, 1.62, 1.96, 1.78, 1.42, 2.12...). Nowhere in the 43 pages does
the text explicitly say "decimal odds" — a search across the whole set for "decimal / american
/ fractional" found only unrelated matches (decimal-**places** rounding rules, the sport
"AmericanFootball"). **[INFERENCE]**: given every example value is a decimal coefficient ≥1.00
and the platform documents a "Low Odds Normalization" rule anchored at 1.00 (below), decimal
odds is the working assumption, but it is inferred from examples, not stated as a format
contract.

**[DOCS]** Low-odds normalization and restriction rules, quoted verbatim:
> "If price < 1.005 → price = 1.00" / "If 1.005 < price < 1.01 → price = 1.01" / "Outcomes with
> price = 1.00 must be automatically suspended" / "Bets must not be accepted if price = 1.00"

**[DOCS]** Brand-level odds customization: a market item carries `"oddsMultipliers": {brand:
multiplier}`, and the doc gives a worked example: price `1.48` × multiplier `0.98580885` =
`1.458997098`, rounded down to `1.45` — i.e. **the price in the base feed message is not
necessarily the price a given brand actually offers**; a brand-specific multiplier and rounding
rule must be applied. Relevant to a feed-only integration: "the odds GR8 publishes" and "the
odds a specific configured brand shows" can differ.

### How a market/selection gets a human name — the Translations API

**[DOCS]** Market names are **not** included in the markets-queue message. `GET
/v1/sport/v0/translation/markets` (`mts-api-line-translations-api-get-v1-sport-v0-translation-markets.md`)
returns, keyed by `marketType` id, an **array** of `{condition, translation}` pairs, not one
name per market type:
```json
{
  "markets": {
    "1": [{ "condition": "=H::=4::", "translation": "Winner" }],
    "2": [{ "condition": "=CS::!0::", "translation": "3-way betting in regular time" }],
    "translationVersion": "2025-04-04T12:11:38.3273642Z"
  }
}
```
The `condition` value is a small condition-DSL string that gates which translation applies to a
given market instance — the same numeric `marketType` can map to more than one label depending
on other fields of the market key. This is meaningfully more complex than "market id → name."

**[DOCS]** Selection (outcome) names come from a **separate** endpoint, `POST
/v1/sport/v1/translation/selections` (and a `/{language}` variant). It takes an array of
selection keys in the format `F_[14,[3],[0],66,11,[]]` (sport-prefixed version of the same
bracket-array `selectionKey` seen on the market outcome) and returns, per key, a **template**,
not a finished string:
```json
{
  "isTranslated": false,
  "item": {
    "competitor": [],
    "market": ["Shots on target. Race to N"],
    "text": "3: {Team1}",
    "textShort": "3: 1"
  },
  "key": "Football_[14,[3],[0],66,11,[]]"
}
```
`text` contains a placeholder (`{Team1}`) that a consumer must substitute at render/match time
using the actual competitor name from the Events feed. `translationVersion` (on the markets
endpoint) is the cache-invalidation token for this whole mechanism.

**[DOCS]** Score/period labels follow the same pattern via a third endpoint, `GET
/v1/sport/v0/translation/scores/{sport}` — numeric period codes to strings, e.g.
`"1": "1st half", "9": "Finished", "10": "Live"`.

**One partial exception**: free-form markets (`marketType` 900/901 and others, `mts-domain-freeforms.md`)
carry their own `freeFormTemplates` array with a `templateText` map **already embedded in the
freeform message itself** — that one market family does not need a round trip to the
Translations API. It is the exception, not the rule; the two documented freeform types
(`FreeFormYesNo`, `FreeFormTotal`) are a small slice of the market catalog.

### What this means, concretely

To get a matchable market/selection **string** for any given GR8 event, a consumer must: (1)
read the numeric `marketType`/`selectionKey` off the markets-queue message; (2) separately call
the Translations API to resolve a condition-gated market label and a templated selection text;
(3) substitute placeholders like `{Team1}` using the competitor names already held from the
Events feed; (4) keep all of this synchronized against `translationVersion`, which can advance
and invalidate a cached translation. **None of this exists as a literal string in the base
feed message.** This is a materially different shape from what `sportsbook-integration-analysis.md`
§1 documents for our two current providers — both The Odds API and Sportradar hand back an
already-resolved market key/label in the *same* message that carries the price
(`parse_markets()`, `_sr_mercados_formato_app()`). GR8 does not.

---

## 4. Transport — RabbitMQ vs Republishing API vs plain REST reads

This is the decisive question for the "keep our engine, take only the line" direction, so it
gets a direct answer, worked from what the MTS docs actually say.

### RabbitMQ (push)

**[DOCS]** (`mts-rabbitMQ-live-streaming-subscription.md`) Eleven documented queues (a twelfth,
`bet-resettled-queue`, is named on the Returns page but belongs to the bet-lifecycle side, out
of scope here):
```
markets-queue            Snapshots with markets by event
market-results-queue     Snapshots with market results by event
events-queue             Information about events
scores-queue             Information about scores by event
categories-queue         Information about categories
tournaments-queue        Information about tournaments
sports-queue             Information about sports
event-free-form-templates-queue   Information about free forms
line-items-dependency-pairs-queue Information about dependency pairs
```
Two explicit operational requirements, quoted verbatim:
> "Do not use auto-ack mode — We cannot guarantee RabbitMQ stability if auto-ack is used. When
> auto-ack is enabled, all pending messages in a queue are loaded into the broker's RAM. This
> can lead to Out-of-Memory (OOM) kills on the broker side... Any in-flight messages consumed
> with auto-ack and awaiting delivery will be lost in the event of a failure."
>
> "Use manual-ack with prefetchCount — You must use manual-ack with a reasonable prefetchCount
> value."

A consumer must therefore be a **long-lived, stateful process** that manually acknowledges
messages and bounds its own in-flight window — not a stateless periodic fetch. `markets-queue`
and the others deliver **snapshots per event/entity**, which simplifies the merge logic (replace
the entity wholesale rather than apply a diff), but the consumer still has to materialize and
hold its own local catalog (in memory or in a store) from this stream, because — see next
point — there is no REST call in this document set that hands back "current markets for event
X" synchronously.

### Republishing API — a replay trigger, not a pull

**[DOCS]** Three endpoints: `POST /v1/sport/v1/republish` (body: a JSON array of event ids),
`POST /v1/sport/v1/republish/active` (filters: `sport`, `startDate`/`endDate`), `POST
/v1/sport/v1/republish/taxonomy` (filter: `sport`). All three return **`202`/`200` with an
empty `{}` body** on success. `mts-api-overview.md` states this outright:

> "A run answers 200/202 once the data is on its way to **RabbitMQ**, and 400 on bad input."

This settles the question the previous version of this file could only guess at from an
endpoint name: republish is a **fire-and-forget instruction that re-emits messages onto the
same RabbitMQ queues**, not a synchronous catalog read. Calling it does not hand you a payload —
you have to already be consuming the queue to receive what you just asked to be republished. It
is a recovery/replay tool for a queue consumer (cold start, gap after a disconnect), not a
substitute for holding a live subscription.

### The few genuine pull-style reads that do exist

**[DOCS]** `GET /v1/sport/v0/score/history/{id}` (History API) returns one point-in-time score
snapshot **directly in the HTTP response** — a real pull, but scoped to score history only, not
markets or odds. The three Translations endpoints (markets/scores/selections) are also direct
pulls, but only for label resolution, not for prices or catalog membership.

### Answer to the decisive question

Based on everything in the 43 downloaded MTS pages: **a pull-based catalog exactly like
`all_markets()`'s `cache_swr`/TTL model cannot be built from documented MTS REST endpoints
alone.** There is no `GET` in this set that returns "current markets/odds for event X" or
"current active events with their markets" synchronously. The only path to a live catalog shown
here is to run a persistent, manually-acknowledged RabbitMQ consumer and materialize a local
snapshot store from `events-queue`/`markets-queue`/`scores-queue`/`market-results-queue`, then
serve reads from that local store — at which point the *read* side of the code could stay
pull-shaped (a local cache read, same as today), but a genuinely new always-on ingestion
component would have to sit in front of it, which nothing in the current codebase has an
equivalent of (`_sr_all_markets_cacheado()` and `cache_swr()` are both pull-on-demand with a
TTL, not queue consumers). **[DOCS + INFERENCE combining the quotes above]**

The one open door: the "Ids of active events" endpoint referenced from the S2S Line API
(§0) was not downloaded. If it returns full market/odds payloads synchronously, it would change
this answer; if it only returns event ids (as its name suggests), it would not. This should be
confirmed before treating the "requires a live subscription" conclusion as final.

---

## 5. Fit against our three constraints

Cross-referenced against `sportsbook-integration-analysis.md`, which maps our side with
`file:line` citations.

**1. Stored pick fields — `home`, `away`, `sel`, `odd`, `sport`, `event_id`, `sport_key`,
`market`, `commence_time`.**
- `home`/`away`: direct fit. GR8 competitors carry literal localized name strings
  (`competitor.name`), the same shape our `home`/`away` fields already expect.
- `commence_time`: best-behaved field of the whole domain model. GR8's `startTime` is ISO-8601
  UTC with a literal `Z` example, matching the `.replace("Z","+00:00")` parsing convention
  already in use for both current providers (§2 above).
- `event_id`: **[INFERENCE]** GR8 event ids are bare numeric strings with no namespace prefix —
  they do not start with `"sr:sport_event:"`. Under the settlement identity rule documented in
  `sportsbook-integration-analysis.md` §4, every GR8-sourced `event_id` would be treated as
  untrusted by default and routed to the Sportradar-schedule fuzzy-match fallback — which is
  meaningless for a GR8 event, since GR8 is not Sportradar. Without a code change, GR8 picks
  would not merely settle slowly; they would settle against the wrong schedule, or not at all.
  Giving GR8 ids a direct-trust path is a deliberate code change (a new prefix/tag convention),
  not a configuration toggle.
- `sport_key`: neither of GR8's two documented sport-id vocabularies (`"Tennis"`/`"Football"` on
  the domain objects, `"FB"`/`"BB"`/`"CR"` on the Limits API, §1) matches either of our existing
  `sport_key` namespaces (Odds-API's provider-native keys or Sportradar's `*_sr` aliases) — a
  new mapping is needed regardless of which GR8 vocabulary is used.
- `market`: cannot be stored as a plain string without the translation+templating pipeline in
  §3. Today `market` is not even persisted on a stored pick at all
  (`sportsbook-integration-analysis.md` §3) — adopting GR8 would force actually solving this for
  the first time, since GR8 offers no free-text market label to fall back on the way the current
  providers' market keys already do.

**2. Settlement trusts `event_id` only when prefixed `"sr:sport_event:"`; else fuzzy
team-name+date match.** Directly covered above: GR8 ids fail this check by construction. A
feed-only integration that stops here (never touching settlement) sidesteps this entirely, since
results/scores data is still part of the feed (`market-results-queue`, `scores-queue`, §4) and
could in principle feed our *own* settlement logic later — but that is future work, not
something the current identity rule handles today.

**3. Scanner matches a rival's screenshot against our catalog by team name and market name.**
Team-name matching is unaffected — GR8 gives literal names. Market-name matching is the sharpest
mismatch found in this whole pass: our scanner today matches against literal market/selection
strings already present in our own catalog. GR8 has no such string in the base feed message —
only after calling the Translations API and substituting template placeholders does a literal,
matchable market/selection string exist (§3). Until that resolution+caching layer is built, a
GR8-backed catalog has nothing for the scanner to match against.

---

## 6. What the next step up would mean — MTS as a service, briefly

If the commercial conversation later moves from "just the feed" to actually placing bets through
MTS, three things change, all confirmed by the documentation (not inferred from marketing):

**[DOCS]** (`mts-operation-tools-bet-placement-process.md`) Acceptance is decided by GR8's own
system, not by an operator approving individual bets: "the system checks the request format...
creates a new 'bet' entity... checks the availability of bet elements for trading... checks the
rate against risk management criteria... [and] sends a request to withdraw funds from the
player's account." Operator control shows up as configuration (margin, max bet, delay per
`gr8.tech/sportsbook-mts/`, an `Overask` policy for above-limit bets) rather than per-bet manual
approval — worth flagging as a nuance against the marketing framing that operators "decide what
to accept... before risk becomes too high" **[MARKETING, `gr8.tech/sportsbook-mts/`]**, which
reads as more hands-on than the documented automated flow actually is.

**[DOCS]** (`mts-operation-tools-bet-settlement-process.md`) Settlement is computed entirely by
GR8 from its own results feed under a fixed rulebook — item statuses (`Win`/`Lose`/`Return`/
`Return025`/`Return075`/`DeadHeat`/`TechReturn`), bet-level combination rules for
single/multiply/combo bets, payout rounding (4 decimal places for odds, 2 for payout), and a
configurable max payout/max settlement odd. No operator override step is described in the
placement or settlement process pages; that confirms (rather than contradicts) the marketing
claim that MTS covers "the bet lifecycle from acceptance to settlement."

**The tension worth naming before any commercial conversation**: GR8's own Risk Management
Monitor documentation (`mts-operation-tools-risk-management-monitor.md`) describes real-time
bet scoring against "about 40 different algorithms that detect different types of fraud or
other risky activity," with a documented bet-quality classification that includes
**"Overpriced — a bet with overpriced odds among competitors"** and **"Arbitrage — a bet with
an arbitrage situation."** Our scanner's entire purpose is to read a rival's ticket and offer to
match or beat that odd — which, described in GR8's own vocabulary, is close to precisely the
pattern their anti-fraud layer is built to detect and flag. Whether that flag would translate
into an automatic rejection, an Overask review, or only an operator-visible risk score is not
stated in what we read — but it is a fact worth having on the table before MTS-as-a-service is
seriously discussed.

**Out of scope for this pass, read but intentionally not expanded**: Console (booking,
customization, history), Bets/Event monitors, player and fairplay-segment limits (Limits API),
forced/forced-partial cashout, and the full return-code/reject-reason catalogue (`mts-api-returns.md`,
a 1,260-line Avro schema for the bet-lifecycle RabbitMQ queues) all exist and were read at
least in part; they belong entirely to the MTS-as-a-service path and add nothing to the
feed-only question this pass is answering.

---

## Source index

Pages read from `local-docs/gr8-mts-docs/` (all originally `https://sport-docs.gr8.tech/mts/...`):

**Domain model** — `mts-domain.md`, `mts-domain-events.md`, `mts-domain-sports.md`,
`mts-domain-tournaments.md`, `mts-domain-categories.md`, `mts-domain-event-statuses.md`,
`mts-domain-dependency-pairs.md`, `mts-domain-languages.md`, `mts-domain-markets.md` (read in
full for schema/examples; the 62 KB file's long tail is repeated market examples, not new
schema), `mts-domain-freeforms.md`, `mts-domain-results.md`, `mts-domain-scores.md`,
`mts-domain-score-description.md` (read the shared `ScoreboardVm`/`ScoreVM`/`TimerVM` property
tables; the per-sport detail tables that follow were not read exhaustively),
`mts-domain-regulations.md`.

**Transport** — `mts-rabbitMQ-live-streaming-subscription.md`,
`mts-api-other-republishing-api-post-v1-sport-v1-republish.md`,
`mts-api-other-republishing-api-post-v1-sport-v1-republish-active.md`,
`mts-api-other-republishing-api-post-v1-sport-v1-republish-taxonomy.md`, `mts-api-overview.md`.

**Markets/selections naming** — `mts-api-line-translations-api-get-v1-sport-v0-translation-markets.md`,
`mts-api-line-translations-api-get-v1-sport-v0-translation-scores-7Bsport-7D.md`,
`mts-api-line-translations-api-post-v1-sport-v1-translation-selections.md`,
`mts-api-line-translations-api-post-v1-sport-v1-translation-selections-7Blanguage-7D.md`,
`mts-api-line-history-api-get-v1-sport-v0-score-history-7Bid-7D.md`.

**MTS-as-a-service (read, compressed to §6)** — `mts-overview.md`,
`mts-operation-tools.md`, `mts-operation-tools-bet-placement-process.md`,
`mts-operation-tools-bet-settlement-process.md`, `mts-operation-tools-risk-management-monitor.md`,
`mts-operation-tools-bets-monitor-description.md`, `mts-operation-tools-event-monitor-description.md`,
`mts-api-bets-bet-placement-api-post-v1-sport-mts-v1-bet.md`,
`mts-api-bets-bet-placement-api-post-v1-sport-v0-mts-bet.md`,
`mts-api-bets-bet-placement-api-post-v1-sport-v0-bet-forced-cashout.md`,
`mts-api-bets-bet-placement-api-post-v1-sport-v0-bet-forced-partial-cashout.md`,
`mts-api-other-limits-api-get-v1-sport-v1-players-7Bplayerid-7D-limits.md`,
`mts-api-other-limits-api-put-v1-sport-v1-players-7Bplayerid-7D-limits.md`,
`mts-api-other-limits-api-get-v1-sport-v1-limits-risk-fairplay-7Bsegmentid-7D.md`,
`mts-api-returns.md` (read the field/queue description and roughly the first 220 of 1,260
lines of the Avro schema — not read exhaustively; no enumerated `RejectReason` value list was
found in the portion read), `mts-console-description.md` (read partially, for
environment/onboarding language only — no sandbox/credential process found there).

**Not read this pass** — `mts-console-booking.md`, `mts-console-customization.md`,
`mts-console-history.md` exist on disk but were not opened; they are Console UI walkthroughs,
squarely in the out-of-scope MTS-as-a-service area.

**Marketing** — `https://gr8.tech/sportsbook-mts/` (quoted in §6, carried over from the previous
version of this file; not re-fetched this pass).

---

## What remains genuinely unanswered

1. **The actual pull-catalog question may not be fully settled.** The "Ids of active events"
   endpoint (S2S Line API) and the broader Sportsbook API / S2S API documentation section were
   not downloaded (§0). If that section documents a synchronous full-catalog read, §4's
   conclusion changes. This is the one item worth resolving before treating "requires a live
   RabbitMQ subscription" as final.
2. **No stated data-retention or catch-up window for RabbitMQ.** The docs say to use manual-ack
   with `prefetchCount` but do not state how long a queue retains unconsumed messages, or what
   happens on a multi-hour consumer outage beyond "call Republish afterwards."
3. **No explicit odds-format statement.** "Decimal odds" is inferred from example values only
   (§3); never asserted as a contract.
4. **No id-stability statement across long timescales.** `dataVersion`/`eventDataVersion`
   counters confirm an id persists across in-lifecycle changes (including reschedules), but
   nothing states whether ids are ever reused, retired, or renumbered across seasons.
5. **The internal sport-id inconsistency (§1)** between the domain model (`"Tennis"`) and the
   Limits API (`"FB"`) is unresolved by anything we read — unclear which is authoritative or
   whether both are simultaneously valid in different contexts.
6. **No sandbox/staging data-parity statement.** `mts-api-overview.md` gives Stage
   (`apg-s2s.online`) and Prod (`apg-s2s.com`) hosts and says auth uses "the same access token
   as the Sportsbook S2S API — see Get access token," but that referenced page was not
   downloaded, so the actual credential/onboarding mechanics are unread.
7. **Everything under "MTS as a service" beyond the one paragraph in §6** — the full
   return/reject-reason catalogue, player-limit semantics, cashout economics, and console
   workflows — was read only enough to confirm scope, not analyzed in depth, per this pass's
   brief.
