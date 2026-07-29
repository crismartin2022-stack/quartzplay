import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Agencia from './Agencia';
import Admin from './Admin';
import Box from './Box';

const path = window.location.pathname;
const Component = path.startsWith('/admin') ? Admin
  : path.startsWith('/agencia') ? Agencia
  : path.startsWith('/box') ? Box
  : App;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Component/>);
