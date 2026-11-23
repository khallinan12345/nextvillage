import './lib/silenceProductionLogs';
import { installApiAuthFetch } from './lib/apiAuthFetch';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

installApiAuthFetch();

// Every deploy gives each lazy-loaded chunk a new hashed filename. A tab left open across a
// deploy still has the old filenames and gets the SPA's index.html back instead (the MIME-type
// error learners see as "Failed to fetch dynamically imported module"). Reload once to pick up
// the current build rather than leaving them stuck; the flag stops a reload loop if it happens
// again right away, and clears itself once the page has been stable for a few seconds.
const STALE_CHUNK_KEY = 'nv_reloaded_for_stale_chunk';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(STALE_CHUNK_KEY)) return;
  sessionStorage.setItem(STALE_CHUNK_KEY, '1');
  window.location.reload();
});
setTimeout(() => sessionStorage.removeItem(STALE_CHUNK_KEY), 5000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);