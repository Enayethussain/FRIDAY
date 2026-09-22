import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { FirebaseAuthGate } from './components/FirebaseAuthGate';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { WebSite } from './web/WebSite';
import config from '../firebase-applet-config.json';

// Existing providers + FRIDAY app, reused unchanged as the dashboard.
const dashboard = (
  <GoogleOAuthProvider clientId={config.oAuthClientId}>
    <FirebaseAuthGate>
      <App />
    </FirebaseAuthGate>
  </GoogleOAuthProvider>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebSite dashboard={dashboard} />
  </StrictMode>,
);
