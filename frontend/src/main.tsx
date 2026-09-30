import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initOfflineNetworkSeam } from './offline/networkMode';

// Explicitly initialize local E2E offline control seam for Docker/local testing
initOfflineNetworkSeam();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
