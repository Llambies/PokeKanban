import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPersistence } from './store/persistence';
import { registerServiceWorker } from './lib/push';
import './styles/base.css';
import './styles/components.css';
import './styles/board.css';
import './styles/card.css';
import './styles/calendar.css';

void initPersistence();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
