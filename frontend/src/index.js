import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Agencia from './Agencia';
import Admin from './Admin';

const path = window.location.pathname;
const Component = path.startsWith('/admin') ? Admin 
  : path.startsWith('/agencia') ? Agencia 
  : App;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Component/>);
