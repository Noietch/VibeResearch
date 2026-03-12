import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ErrorBoundary } from './components/error-boundary';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './locales/en.json';
import zhTranslations from './locales/zh.json';
import './styles/globals.css';

// Global error handlers for uncaught errors
window.addEventListener('error', (event) => {
  console.error('[renderer] Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[renderer] Unhandled rejection:', event.reason);
});

// Initialize i18next synchronously to avoid first-frame flicker.
// Language priority: localStorage (fast, persisted from last session) → 'zh' (default Chinese)
const savedLang = localStorage.getItem('researchclaw-language');
const initialLang: 'en' | 'zh' = savedLang === 'en' ? 'en' : 'zh';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslations },
    zh: { translation: zhTranslations },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <RouterProvider router={router} />
  </ErrorBoundary>,
);

// After first render, sync language from main process (authoritative source).
// This reconciles with OS auto-detection on first launch or cross-profile changes.
async function syncLanguageFromMain() {
  try {
    const api = (
      window as unknown as { electronAPI?: { invoke: (channel: string) => Promise<unknown> } }
    ).electronAPI;
    if (!api) return;
    const result = (await api.invoke('settings:getLanguage')) as { data?: { language: string } };
    const lang = result?.data?.language;
    if (lang === 'zh' || lang === 'en') {
      localStorage.setItem('researchclaw-language', lang);
      if (i18n.language !== lang) {
        void i18n.changeLanguage(lang);
      }
    }
  } catch {
    // Electron not ready yet or test environment — ignore
  }
}

void syncLanguageFromMain();
