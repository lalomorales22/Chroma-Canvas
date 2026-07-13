import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PhoneCameraPage } from './components/PhoneCameraPage';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Phones scanning the "Phone as Camera" QR land on #phone=<session>
const phoneSession = window.location.hash.match(/^#phone=([\w-]+)/)?.[1];

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {phoneSession ? <PhoneCameraPage session={phoneSession} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
