import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Agencia from "./Agencia";
import Admin from "./Admin";
import Box from "./Box";
import Web from "./Web";
import Casino from "./Casino";

const path = window.location.pathname;
const host = window.location.hostname;

// iaqp.lat es la marca del casino: entrando por ahí se abre la mesa,
// sin tener que escribir /casino. Los demás dominios muestran la app.
const esCasino = host === "iaqp.lat" || host === "www.iaqp.lat";

const Component = path.startsWith('/admin')   ? Admin
                : path.startsWith('/agencia') ? Agencia
                : path.startsWith('/box')     ? Box
                : path.startsWith('/sitio')   ? Web
                : path.startsWith('/casino')  ? Casino
                : esCasino                    ? Casino
                : App;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Component />);
