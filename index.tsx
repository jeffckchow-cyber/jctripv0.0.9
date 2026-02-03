
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Register Service Worker for Offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      // Fixed: changed to relative path and added explicit scope for iOS Safari
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then((registration) => {
          console.log('WanderSync: Service Worker registered. Scope:', registration.scope);
        })
        .catch((err) => {
          console.warn('WanderSync: Service Worker registration failed:', err.message);
        });
    } catch (e) {
      console.warn('WanderSync: Service Worker initialization failed.');
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
