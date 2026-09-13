import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { FirebaseAuthGate } from './components/FirebaseAuthGate';
import { GoogleOAuthProvider } from '@react-oauth/google';
import config from '../firebase-applet-config.json';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={config.oAuthClientId}>
      <FirebaseAuthGate>
        <App />
      </FirebaseAuthGate>
    </GoogleOAuthProvider>
  </StrictMode>,
);
