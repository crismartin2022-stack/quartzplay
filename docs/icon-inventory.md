# Emoji inventory

Every distinct emoji under `frontend/src`, what it is doing there, and which
of the prototype's 36 icons replaces it. The migration is driven by this
document rather than judged case by case while editing.

**1,019 uses, 120 distinct emoji, across five screens.** 56 of them have an
icon in the set. **64 do not** — five of those only for one of their two
roles — and they are listed as gaps rather than mapped to an approximation:
an honest gap is what tells us which icons still have to be drawn.

The icon set is `frontend/src/Icon.jsx`, the prototype's own
`html/assets/icons.js` ported verbatim.

## How this was counted

By scanning the files, not by reading them. The rule is Unicode: a match is an
`Extended_Pictographic` character with its optional variation selector, skin
tone and zero-width-joiner sequence, plus keycaps and flag pairs. Counts come
straight out of that scan and are not hand-tallied.

That rule deliberately leaves alone the typographic glyphs the screens also
use — `✓`, `✕`, `×`, `↑`, `♡`, `·`, `─`. They are not emoji, they are drawn
by the font that draws the text next to them, and they are out of scope here.
A few of them (`✕` as a close button) will want the `x` icon eventually, but
that is a separate pass.

## The screens, in migration order

Smallest first, so each PR stays reviewable. `Admin.jsx` is the big one: it is
half of everything below.

| Screen | Uses | Distinct | Status |
|---|---:|---:|---|
| `Box.jsx` | 23 | 21 | **migrated** — the proof for this change |
| `Web.jsx` | 74 | 38 | next, after the scanner change in flight merges |
| `App.jsx` | 137 | 51 | next, after the scanner change in flight merges |
| `Agencia.jsx` | 281 | 73 | then |
| `Admin.jsx` | 503 | 90 | last, and on its own |
| `CameraCapture.jsx` | 1 | 1 | fold into whichever PR touches it |

## Screen by screen

The emoji each screen uses, most used first. Cross-reference the mapping table
below for what each one becomes.

### `Box.jsx` — 23 uses, 21 distinct

📊 2 · 🔍 2 · ⏱ 1 · ⚖️ 1 · ⚠️ 1 · ✅ 1 · ✏️ 1 · 🌙 1 · 🎟️ 1 · 🎫 1 · 🎲 1 · 💰 1 · 📭 1 · 📸 1 · 🔁 1 · 🖼️ 1 · 🤝 1 · 🚀 1 · 🚫 1 · 🛠️ 1 · 🛡️ 1

### `Web.jsx` — 74 uses, 38 distinct

⚠️ 11 · ✅ 9 · 🤝 5 · 💬 4 · 📋 4 · 🎰 3 · ↗ 2 · ⚽ 2 · 🎥 2 · 📸 2 · 🔔 2 · 🛡️ 2 · ◀ 1 · ♥ 1 · ⚖️ 1 · ⚡ 1 · ✏️ 1 · ➕ 1 · 🎟️ 1 · 🎧 1 · 🎲 1 · 🏠 1 · 👀 1 · 👋 1 · 👤 1 · 💰 1 · 💸 1 · 📊 1 · 📡 1 · 📲 1 · 🔁 1 · 🔍 1 · 🔕 1 · 🔥 1 · 🔴 1 · 🖼️ 1 · 🪙 1 · 🚀 1

### `App.jsx` — 137 uses, 51 distinct

⚠️ 12 · ◀ 9 · ⚡ 8 · ✅ 7 · 📋 7 · 🤝 7 · 🔴 6 · ⚽ 5 · 🎰 5 · 📊 5 · 🎥 4 · 💬 4 · 🔗 4 · 🎟️ 3 · 🏪 3 · 🔍 3 · 🚀 3 · ↗ 2 · ✏️ 2 · ⬆️ 2 · ⬇️ 2 · 💸 2 · 📅 2 · 📸 2 · 🛡️ 2 · ⏳ 1 · ♥ 1 · ⚖️ 1 · ➕ 1 · 🌙 1 · 🎁 1 · 🎉 1 · 🎫 1 · 🎯 1 · 🎲 1 · 🏠 1 · 🏦 1 · 👀 1 · 👋 1 · 💡 1 · 💰 1 · 📲 1 · 🔁 1 · 🔄 1 · 🔔 1 · 🔕 1 · 🔥 1 · 🖼️ 1 · 🪙 1 · 🚧 1 · 🛠️ 1

### `Agencia.jsx` — 281 uses, 73 distinct

✅ 58 · ⚠️ 33 · 💰 10 · 📲 10 · 🌟 9 · ⚡ 7 · 🔒 7 · 🏢 6 · 📸 6 · 🔑 6 · 🖨️ 6 · 🎁 5 · 🎟️ 5 · 💵 5 · 🔴 5 · 🌐 4 · 🎨 4 · 👤 4 · 📊 4 · 🔍 4 · 🤖 4 · ⚙️ 3 · 🏦 3 · 👉 3 · 💸 3 · 📋 3 · 🔥 3 · 🖼️ 3 · ⚽ 2 · ✈️ 2 · ⬇ 2 · ⭐ 2 · 🎥 2 · 🎫 2 · 🎰 2 · 💾 2 · 📝 2 · 🔄 2 · 🔔 2 · 🖥️ 2 · 🧾 2 · ✍️ 1 · ✏️ 1 · ➕ 1 · ➖ 1 · ⬆️ 1 · ⬆ 1 · ⬇️ 1 · 🌙 1 · 🎉 1 · 🎧 1 · 🎯 1 · 🏆 1 · 🏛️ 1 · 👑 1 · 💎 1 · 💪 1 · 📤 1 · 📨 1 · 📭 1 · 📷 1 · 🔇 1 · 🔊 1 · 🔐 1 · 🔕 1 · 🔗 1 · 🔵 1 · 🕓 1 · 🗑 1 · 🤝 1 · 🚀 1 · 🛠️ 1 · 🟡 1

### `Admin.jsx` — 503 uses, 90 distinct

⚠️ 105 · ✅ 100 · 🔒 12 · 🏢 11 · 🤖 11 · 💰 10 · 🔍 10 · ❌ 9 · ⭕ 9 · 🚫 9 · 🛡️ 9 · ⚡ 8 · 🌟 8 · 🎰 8 · ⚙️ 7 · 🌐 7 · 💵 7 · 📊 7 · 📋 6 · 🎉 5 · 📉 5 · 📱 5 · 📸 5 · 🔴 5 · ⏳ 4 · ⚽ 4 · 👥 4 · 💬 4 · 🔑 4 · 🖼️ 4 · ▶ 3 · 🎥 3 · 🎫 3 · 👁️ 3 · 👤 3 · 📅 3 · 📈 3 · 🔄 3 · 🖨️ 3 · 🟡 3 · ⚖️ 2 · ⬇ 2 · 🌳 2 · 🎁 2 · 🎚️ 2 · 🎧 2 · 🎮 2 · 🏛️ 2 · 🏪 2 · 💱 2 · 💸 2 · 📢 2 · 📣 2 · 🔌 2 · 🔔 2 · 🔗 2 · 🖥️ 2 · 🗓️ 2 · 🤝 2 · 🚀 2 · 🛠️ 2 · ✋ 1 · ✍️ 1 · ✏️ 1 · ➕ 1 · 🌲 1 · 🌿 1 · 🎡 1 · 🎯 1 · 🎲 1 · 🏆 1 · 🏦 1 · 💳 1 · 💾 1 · 📤 1 · 📥 1 · 📨 1 · 📭 1 · 🔇 1 · 🔊 1 · 🔥 1 · 🔧 1 · 🔬 1 · 🔵 1 · 🗑 1 · 🧪 1 · 🧾 1 · 🩺 1 · 🪙 1 · 🚨 1

### `CameraCapture.jsx` — 1 uses, 1 distinct

📸 1

## Every emoji, most used first

Role is **icon** when the emoji stands in for one, typically glued to a label
("🏠 Inicio"), and **copy** when it is punctuation or tone inside a sentence a
player reads. Copy is not replaced.

| Emoji | Uses | Where | Role | Icon that replaces it |
|---|---:|---|---|---|
| ✅ | 175 | Admin 100 · Agencia 58 · Web 9 · App 7 · Box 1 | icon | `circle-check` |
| ⚠️ | 162 | Admin 105 · Agencia 33 · App 12 · Web 11 · Box 1 | icon | `triangle-alert` |
| ⚡ | 24 | Admin 8 · App 8 · Agencia 7 · Web 1 | icon | **none** — no bolt in the set |
| 💰 | 23 | Admin 10 · Agencia 10 · App 1 · Box 1 · Web 1 | icon | `wallet-cards` |
| 📋 | 20 | App 7 · Admin 6 · Web 4 · Agencia 3 | icon | `clipboard-list` |
| 🔍 | 20 | Admin 10 · Agencia 4 · App 3 · Box 2 · Web 1 | icon | `search` |
| 📊 | 19 | Admin 7 · App 5 · Agencia 4 · Box 2 · Web 1 | icon | `chart-no-axes-combined` |
| 🔒 | 19 | Admin 12 · Agencia 7 | icon | **none** — no padlock |
| 🎰 | 18 | Admin 8 · App 5 · Web 3 · Agencia 2 | icon | `spade` |
| 🌟 | 17 | Agencia 9 · Admin 8 | icon | **none** — no star |
| 🏢 | 17 | Admin 11 · Agencia 6 | icon | **none** — `landmark` is the bank/till mark, not an agency storefront |
| 📸 | 17 | Agencia 6 · Admin 5 · App 2 · Web 2 · Box 1 · CameraCapture 1 | icon | `scan-line` (Escanear) · `camera` (Sacar foto) |
| 🔴 | 17 | App 6 · Admin 5 · Agencia 5 · Web 1 | icon | `circle-dot` |
| 🤝 | 16 | App 7 · Web 5 · Admin 2 · Agencia 1 · Box 1 | icon | **none** — no handshake |
| 🤖 | 15 | Admin 11 · Agencia 4 | icon | **none** — no robot |
| 🛡️ | 14 | Admin 9 · App 2 · Web 2 · Box 1 | icon | `shield-check` (seguro, responsable) · `shield-alert` (riesgo) |
| ⚽ | 13 | App 5 · Admin 4 · Agencia 2 · Web 2 | icon | `trophy` — the prototype's own mark for Eventos |
| 💬 | 12 | Admin 4 · App 4 · Web 4 | icon | `message-circle` |
| 💵 | 12 | Admin 7 · Agencia 5 | icon | `wallet-cards` |
| 📲 | 12 | Agencia 10 · App 1 · Web 1 | icon | **none** — no phone |
| 🌐 | 11 | Admin 7 · Agencia 4 | icon | **none** — no globe |
| 🎥 | 11 | App 4 · Admin 3 · Agencia 2 · Web 2 | icon | **none** — `camera` is a photo camera, not a live feed |
| ◀ | 10 | App 9 · Web 1 | icon | `arrow-left` |
| ⚙️ | 10 | Admin 7 · Agencia 3 | icon | `sliders-horizontal` |
| 🎟️ | 10 | Agencia 5 · App 3 · Box 1 · Web 1 | icon | `ticket` |
| 🔑 | 10 | Agencia 6 · Admin 4 | icon | **none** — no key |
| 🖼️ | 10 | Admin 4 · Agencia 3 · App 1 · Box 1 · Web 1 | icon | **none** — no image mark |
| 🚫 | 10 | Admin 9 · Box 1 | icon | `triangle-alert` (unreachable / error state) · **none** for the Bloquear-limitar action — no ban mark |
| ❌ | 9 | Admin 9 | icon | `x` |
| ⭕ | 9 | Admin 9 | icon | **none** — no off/empty-circle mark; `circle-dot` already means live |
| 🖨️ | 9 | Agencia 6 · Admin 3 | icon | **none** — no printer |
| 🎁 | 8 | Agencia 5 · Admin 2 · App 1 | icon | **none** — no gift |
| 👤 | 8 | Agencia 4 · Admin 3 · Web 1 | icon | `users` — the set has only the plural mark |
| 💸 | 8 | Agencia 3 · Admin 2 · App 2 · Web 1 | icon | **none** as one mark — the set draws movement as the `arrow-down-left` / `arrow-up-right` pair |
| 🚀 | 8 | App 3 · Admin 2 · Agencia 1 · Box 1 · Web 1 | icon | **none** — no rocket |
| 🎉 | 7 | Admin 5 · Agencia 1 · App 1 | icon / copy | **none** for the Súper Bono tab; tone inside result messages stays as it is |
| 🎫 | 7 | Admin 3 · Agencia 2 · App 1 · Box 1 | icon | `receipt-text` — the prototype's mark for Apuestas |
| 🔔 | 7 | Admin 2 · Agencia 2 · Web 2 · App 1 | icon | **none** — no bell |
| 🔗 | 7 | App 4 · Admin 2 · Agencia 1 | icon | **none** — no link |
| ✏️ | 6 | App 2 · Admin 1 · Agencia 1 · Box 1 · Web 1 | icon | **none** — no pencil |
| 🔄 | 6 | Admin 3 · Agencia 2 · App 1 | icon | **none** — no refresh |
| 🔥 | 6 | Agencia 3 · Admin 1 · App 1 · Web 1 | icon / copy | **none** for the Muro tab; tone inside the share text stays as it is |
| ⏳ | 5 | Admin 4 · App 1 | icon | `clock-3` |
| ⚖️ | 5 | Admin 2 · App 1 · Box 1 · Web 1 | icon | **none** — no scales |
| 🏦 | 5 | Agencia 3 · Admin 1 · App 1 | icon | `landmark` |
| 🏪 | 5 | App 3 · Admin 2 | icon | **none** — no storefront |
| 📅 | 5 | Admin 3 · App 2 | icon | **none** — no calendar |
| 📉 | 5 | Admin 5 | icon | **none** — no trending-down |
| 📱 | 5 | Admin 5 | icon | **none** — no phone |
| 🛠️ | 5 | Admin 2 · Agencia 1 · App 1 · Box 1 | icon | **none** — no tools |
| ↗ | 4 | App 2 · Web 2 | icon | `arrow-up-right` |
| ➕ | 4 | Admin 1 · Agencia 1 · App 1 · Web 1 | icon | `plus` |
| ⬇ | 4 | Admin 2 · Agencia 2 | icon | `arrow-down-left` |
| 🎧 | 4 | Admin 2 · Agencia 1 · Web 1 | icon | **none** — no headset |
| 🎨 | 4 | Agencia 4 | icon | **none** — no palette |
| 🎲 | 4 | Admin 1 · App 1 · Box 1 · Web 1 | icon | `spade` (casino providers) · **none** for Armar combinada — a parlay builder is not a card mark |
| 👥 | 4 | Admin 4 | icon | `users` |
| 🖥️ | 4 | Admin 2 · Agencia 2 | icon | **none** — no monitor/terminal |
| 🟡 | 4 | Admin 3 · Agencia 1 | icon | `circle-dot`, coloured `Q.gold` |
| ▶ | 3 | Admin 3 | icon | `play` |
| ⬆️ | 3 | App 2 · Agencia 1 | icon | `arrow-up-right` |
| ⬇️ | 3 | App 2 · Agencia 1 | icon | `arrow-down-left` |
| 🌙 | 3 | Agencia 1 · App 1 · Box 1 | icon | **none** — no empty-state mark |
| 🎯 | 3 | Admin 1 · Agencia 1 · App 1 | icon | **none** — no target |
| 🏛️ | 3 | Admin 2 · Agencia 1 | icon | `landmark` — same mark as 🏦; the label tells them apart |
| 👁️ | 3 | Admin 3 | icon | **none** — no eye |
| 👉 | 3 | Agencia 3 | copy | — |
| 💾 | 3 | Agencia 2 · Admin 1 | icon | **none** — no save/disk |
| 📈 | 3 | Admin 3 | icon | `chart-no-axes-combined` |
| 📭 | 3 | Admin 1 · Agencia 1 · Box 1 | icon | **none** — no empty-state mark |
| 🔁 | 3 | App 1 · Box 1 · Web 1 | icon | **none** — no repeat |
| 🔕 | 3 | Agencia 1 · App 1 · Web 1 | icon | **none** — no bell-off |
| 🧾 | 3 | Agencia 2 · Admin 1 | icon | `receipt-text` |
| 🪙 | 3 | Admin 1 · App 1 · Web 1 | icon | **none** — no coin |
| ♥ | 2 | App 1 · Web 1 | icon | **none** — no heart |
| ✈️ | 2 | Agencia 2 | icon | **none** — Telegram's own mark is not in the set |
| ✍️ | 2 | Admin 1 · Agencia 1 | icon | **none** — no pencil |
| ⭐ | 2 | Agencia 2 | icon / copy | **none** for “mi agencia”; the placa emoji pool stays as it is |
| 🌳 | 2 | Admin 2 | icon | `network` |
| 🎚️ | 2 | Admin 2 | icon | `sliders-horizontal` |
| 🎮 | 2 | Admin 2 | icon | **none** — no gamepad |
| 🏆 | 2 | Admin 1 · Agencia 1 | icon | `trophy` |
| 🏠 | 2 | App 1 · Web 1 | icon | `house` |
| 👀 | 2 | App 1 · Web 1 | icon | **none** — no eye |
| 👋 | 2 | App 1 · Web 1 | copy | — |
| 💱 | 2 | Admin 2 | icon | **none** — no currency exchange |
| 📝 | 2 | Agencia 2 | icon | **none** — no note |
| 📢 | 2 | Admin 2 | icon | **none** — no megaphone |
| 📣 | 2 | Admin 2 | icon | **none** — no megaphone |
| 📤 | 2 | Admin 1 · Agencia 1 | icon | `arrow-up-right` |
| 📨 | 2 | Admin 1 · Agencia 1 | icon | `message-circle` |
| 🔇 | 2 | Admin 1 · Agencia 1 | icon | **none** — no mute |
| 🔊 | 2 | Admin 1 · Agencia 1 | icon | **none** — no speaker |
| 🔌 | 2 | Admin 2 | icon | **none** — no plug |
| 🔵 | 2 | Admin 1 · Agencia 1 | icon | `circle-dot`, coloured `Q.cyan` |
| 🗑 | 2 | Admin 1 · Agencia 1 | icon | **none** — no bin |
| 🗓️ | 2 | Admin 2 | icon | **none** — no calendar |
| ⏱ | 1 | Box 1 | icon | `clock-3` |
| ✋ | 1 | Admin 1 | icon | **none** — no hand |
| ➖ | 1 | Agencia 1 | icon | **none** — the set has `plus` and no minus |
| ⬆ | 1 | Agencia 1 | icon | `arrow-up-right` |
| 🌲 | 1 | Admin 1 | icon | `network` |
| 🌿 | 1 | Admin 1 | icon | `network` — a branch of the same tree |
| 🎡 | 1 | Admin 1 | icon | **none** — no wheel |
| 👑 | 1 | Agencia 1 | copy | — |
| 💎 | 1 | Agencia 1 | copy | — |
| 💡 | 1 | App 1 | copy | — |
| 💪 | 1 | Agencia 1 | copy | — |
| 💳 | 1 | Admin 1 | icon | `wallet-cards` |
| 📡 | 1 | Web 1 | icon | `circle-dot` — the same live mark as 🔴 |
| 📥 | 1 | Admin 1 | icon | `arrow-down-left` |
| 📷 | 1 | Agencia 1 | icon | `camera` |
| 🔐 | 1 | Agencia 1 | icon | **none** — no padlock |
| 🔧 | 1 | Admin 1 | icon | **none** — no wrench |
| 🔬 | 1 | Admin 1 | icon | `scan-search` — the prototype's inspect mark |
| 🕓 | 1 | Agencia 1 | icon | `clock-3` |
| 🧪 | 1 | Admin 1 | icon | **none** — no flask |
| 🩺 | 1 | Admin 1 | icon | **none** — no diagnostics mark |
| 🚧 | 1 | App 1 | icon | **none** — no works/barrier mark |
| 🚨 | 1 | Admin 1 | icon | `shield-alert` |

<!-- distinct=120 total=1019 gaps=64 gapUses=361 -->
## What the set cannot draw yet

64 distinct emoji, 361 uses, have no equivalent. Grouped by the mark that is
missing, so the list can be handed to whoever draws the next batch. The count
is how many uses are waiting on it.

| Missing mark | Emoji | Uses |
|---|---|---:|
| bolt / fast / automatic | ⚡ | 24 |
| padlock, locked, key | 🔒 🔐 🔑 | 30 |
| star / featured | 🌟 ⭐ | 19 |
| storefront, agency, phone-as-a-device | 🏢 🏪 📱 📲 | 39 |
| handshake / head to head | 🤝 | 16 |
| robot / AI | 🤖 | 15 |
| globe / public site | 🌐 | 11 |
| video, live feed | 🎥 | 11 |
| image, gallery, palette | 🖼️ 🎨 | 14 |
| ban / block | 🚫 (the action) | 10 |
| off / inactive toggle | ⭕ | 9 |
| printer | 🖨️ | 9 |
| gift, celebration | 🎁 🎉 | 15 |
| money leaving, exchange, coin, minus | 💸 💱 🪙 ➖ | 14 |
| rocket / boost | 🚀 | 8 |
| bell, bell-off, speaker, mute | 🔔 🔕 🔊 🔇 | 14 |
| link | 🔗 | 7 |
| pencil / edit / note | ✏️ ✍️ 📝 | 10 |
| refresh, repeat | 🔄 🔁 | 9 |
| flame / hot | 🔥 (the Muro tab) | 6 |
| calendar | 📅 🗓️ | 7 |
| trending down | 📉 | 5 |
| tools, wrench, plug | 🛠️ 🔧 🔌 | 8 |
| scales / balance | ⚖️ | 5 |
| headset / support | 🎧 | 4 |
| dice / build a parlay | 🎲 (Armar combinada) | 4 |
| monitor / terminal | 🖥️ | 4 |
| empty state | 🌙 📭 | 6 |
| target | 🎯 | 3 |
| eye / watch | 👁️ 👀 | 5 |
| save / disk | 💾 | 3 |
| heart / like | ♥ | 2 |
| Telegram | ✈️ | 2 |
| gamepad | 🎮 | 2 |
| megaphone / announcement | 📣 📢 | 4 |
| bin / delete | 🗑 | 2 |
| hand / manual | ✋ | 1 |
| roulette wheel | 🎡 | 1 |
| flask, diagnostics | 🧪 🩺 | 2 |
| works / unavailable | 🚧 | 1 |

## Icons in the set that no emoji asks for

`arrow-right`, `chevron-right`, `circle-help`, `clubs`, `filter`,
`layout-grid`, `menu`, `scan-search`, `sliders-horizontal` (only two emoji
reach for it). They are the prototype's navigation and filtering furniture;
the product will need them when the shell is redrawn, not when the emoji go.

## Two things the migration has to carry

**`✅` and `⚠️` are not only icons — they are also state.** 337 of the 1,019
uses are these two, and a large share of them are prefixes on message strings
that the code then reads back: `msg.startsWith("✅") ? Q.green : Q.red`,
`liqMsg.startsWith("⚠️")`. Replacing the glyph with an icon means the message
has to carry its own status (`{ok: true, text: "…"}` or an equivalent) instead
of being sniffed. That is the one piece of real work hiding in this migration,
and it is concentrated in `Admin.jsx` and `Agencia.jsx`.

**A row of related buttons migrates as a row.** `Box.jsx` has
`🛡️ Seguro · ⚖️ Medio · 🚀 Fuerte`, and only the first has an icon. It was
migrated anyway — the rule is that an emoji with an icon gets the icon — so
that row now shows one drawn icon beside two emoji. It stays that way until
the scales and the rocket exist. The same trio appears in `App.jsx` and
`Web.jsx`.
