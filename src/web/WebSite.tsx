import { useSyncExternalStore } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { HomePage, FeaturesPage, AboutPage } from './pages-main';
import { PricingPage } from './pages-pricing';
import { ContactPage, PrivacyPage, TermsPage, RefundPage } from './pages-legal';
import { LoginPage, RegisterPage } from './pages-auth';
import { globalAuthManager } from '../services/AuthManager';

function useIsNative(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch { /* web */ }
  return false;
}

function useAuthState(): boolean {
  return useSyncExternalStore(
    (cb) => globalAuthManager.subscribe(() => cb()),
    () => globalAuthManager.getProfile().isAuthenticated
  );
}

function NativeRoot() {
  // Android APK keeps its existing behavior: straight into the FRIDAY app.
  return <Navigate to="/dashboard" replace />;
}

function ProtectedDashboard({ element }: { element: React.ReactNode }) {
  const authed = useAuthState();
  const location = useLocation();
  if (!authed) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{element}</>;
}

export function WebSite({ dashboard }: { dashboard: React.ReactNode }) {
  const native = useIsNative();
  return (
    <BrowserRouter>
      <Routes>
        {native ? (
          <>
            <Route path="/" element={<NativeRoot />} />
            <Route path="/dashboard" element={dashboard} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<HomePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/refund" element={<RefundPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<ProtectedDashboard element={dashboard} />} />
            <Route path="*" element={<HomePage />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
