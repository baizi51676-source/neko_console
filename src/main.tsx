import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProvider } from './astrbot/state';
import { Shell } from './astrbot/app';

const host = document.getElementById('root');
if (!host) throw new Error('#root element is missing');

createRoot(host).render(
  <StrictMode>
    <AppProvider>
      <Shell />
    </AppProvider>
  </StrictMode>,
);