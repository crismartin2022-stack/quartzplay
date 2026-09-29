import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import "./base.css";
import App from "./App";
import Agencia from "./Agencia";
import Admin from "./Admin";
import Box from "./Box";
import Web from "./Web";
import PantallaTelegram from "./PantallaTelegram";
import Casino from "./Casino";
import RouletteOff from "./RouletteOff";
import { ROULETTE_ENABLED } from "./features";
import { getFrontendConfig } from "./config";
import { estaEnTelegram } from "./puertaTelegram";
import { oscuro } from "./theme";

const path = window.location.pathname;
const host = window.location.hostname;

const { casinoHosts } = getFrontendConfig();
const esCasino = casinoHosts.includes(host);

// Both ways in — the /casino path and a dedicated casino host — go through
// the same switch, so turning the roulette off cannot leave one door open.
const Roulette = ROULETTE_ENABLED ? Casino : RouletteOff;

const Component = path.startsWith('/admin')   ? Admin
                : path.startsWith('/agencia') ? Agencia
                : path.startsWith('/box')     ? Box
                : path.startsWith('/sitio')   ? Web
                : path.startsWith('/casino')  ? Roulette
                : esCasino                    ? Roulette
                // La raíz es la mini-app de Telegram. Fuera de Telegram no
                // hay identidad posible, así que en vez de dejar la pantalla
                // sin autenticar y sin explicación, se muestra la puerta con
                // las dos salidas. La decisión vive acá y no dentro de
                // App.jsx porque ahí habría que saltear hooks.
                : estaEnTelegram(window)      ? App
                :                               PantallaTelegram;

// The document's own colours, declared once for every screen.
//
// Without a colour here, anything that does not set its own inherits the
// browser default — black — on a near-black background. That is not a
// theoretical risk: it hid the cashier's "¡Tu apuesta está lista!" heading
// and rendered several drawn icons invisible, because `Icon` correctly
// defaults to `currentColor` and there was no current colour to take.
//
// It lives here rather than in each screen because there are six of them
// and only three ever had a place to put it. Fixing those three left the
// admin and agency panels still inheriting black, which is exactly the gap
// this replaces.
document.body.style.background = oscuro.void;
document.body.style.color = oscuro.text;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Component />);
