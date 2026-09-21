import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import App from "./App";
import Agencia from "./Agencia";
import Admin from "./Admin";
import Box from "./Box";
import Web from "./Web";
import Casino from "./Casino";
import { getFrontendConfig } from "./config";
import { oscuro } from "./theme";

const path = window.location.pathname;
const host = window.location.hostname;

const { casinoHosts } = getFrontendConfig();
const esCasino = casinoHosts.includes(host);

const Component = path.startsWith('/admin')   ? Admin
                : path.startsWith('/agencia') ? Agencia
                : path.startsWith('/box')     ? Box
                : path.startsWith('/sitio')   ? Web
                : path.startsWith('/casino')  ? Casino
                : esCasino                    ? Casino
                : App;

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
