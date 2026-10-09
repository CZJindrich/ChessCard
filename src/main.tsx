import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './art/fonts';
import './ui/theme.css';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing <div id="root">');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
