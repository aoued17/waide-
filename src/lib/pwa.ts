import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type SwStatus = 'unsupported' | 'idle' | 'registered' | 'updating' | 'ready' | 'error';

interface PwaStoreState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  swStatus: SwStatus;
  updateAvailable: boolean;
  lastCheckedAt: Date | null;
  registration: ServiceWorkerRegistration | null;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

export function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isClassicIOS = /iphone|ipad|ipod/i.test(ua);
  const isIPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOS;
}

const state: PwaStoreState = {
  deferredPrompt: null,
  isInstalled: detectStandalone(),
  swStatus: typeof window !== 'undefined' && 'serviceWorker' in navigator ? 'idle' : 'unsupported',
  updateAvailable: false,
  lastCheckedAt: null,
  registration: null,
};

const listeners = new Set<() => void>();
let listenersInitialized = false;
let swRegistrationStarted = false;

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

export function initPwaListeners(): void {
  if (typeof window === 'undefined' || listenersInitialized) return;
  listenersInitialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    state.deferredPrompt = null;
    state.isInstalled = true;
    notifyListeners();
  });

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  const onDisplayModeChange = () => {
    state.isInstalled = detectStandalone();
    notifyListeners();
  };
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onDisplayModeChange);
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    state.swStatus = 'unsupported';
    notifyListeners();
    return null;
  }

  initPwaListeners();

  if (swRegistrationStarted && state.registration) {
    return state.registration;
  }
  swRegistrationStarted = true;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    state.registration = registration;
    state.swStatus = registration.active ? 'ready' : 'registered';
    if (registration.waiting) {
      state.updateAvailable = true;
    }
    notifyListeners();

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      state.swStatus = 'updating';
      notifyListeners();

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            state.updateAvailable = true;
          }
          state.swStatus = 'ready';
          notifyListeners();
        } else if (installing.state === 'activated') {
          state.swStatus = 'ready';
          state.updateAvailable = false;
          notifyListeners();
        }
      });
    });

    return registration;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    state.swStatus = 'error';
    notifyListeners();
    return null;
  }
}

export async function triggerInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!state.deferredPrompt) return 'unavailable';
  const promptEvent = state.deferredPrompt;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  state.deferredPrompt = null;
  if (choice.outcome === 'accepted') {
    state.isInstalled = true;
  }
  notifyListeners();
  return choice.outcome;
}

export async function checkServiceWorkerUpdates(): Promise<
  'update-available' | 'up-to-date' | 'unsupported' | 'error'
> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  try {
    const reg = state.registration ?? (await navigator.serviceWorker.getRegistration('/'));
    if (!reg) {
      const created = await registerServiceWorker();
      state.lastCheckedAt = new Date();
      notifyListeners();
      return created ? 'up-to-date' : 'error';
    }

    await reg.update();
    state.lastCheckedAt = new Date();

    if (reg.waiting || reg.installing) {
      state.updateAvailable = Boolean(reg.waiting);
      notifyListeners();
      return 'update-available';
    }

    state.swStatus = reg.active ? 'ready' : 'registered';
    notifyListeners();
    return 'up-to-date';
  } catch (err) {
    console.warn('Service Worker update check failed:', err);
    return 'error';
  }
}

export function applyServiceWorkerUpdate(): void {
  const waiting = state.registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload();
  }
}

export function usePWA() {
  const [, setTick] = useState(0);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    initPwaListeners();
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      return await checkServiceWorkerUpdates();
    } finally {
      setCheckingUpdate(false);
    }
  };

  return {
    isInstallable: Boolean(state.deferredPrompt) && !state.isInstalled,
    isInstalled: state.isInstalled,
    isIOS: detectIOS(),
    swStatus: state.swStatus,
    updateAvailable: state.updateAvailable,
    lastCheckedAt: state.lastCheckedAt,
    checkingUpdate,
    installApp: triggerInstallPrompt,
    checkForUpdates,
    applyUpdate: applyServiceWorkerUpdate,
  };
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}

if (typeof window !== 'undefined') {
  initPwaListeners();
}
