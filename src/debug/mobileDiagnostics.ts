const STORAGE_KEY = 'mobileDebug';

type Payload = Record<string, any> | undefined;

function normalizeFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function readFlag(): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const paramValue = params.get('mobileDebug') ?? params.get('mobiledebug');
  if (paramValue) {
    try {
      window.localStorage.setItem(STORAGE_KEY, paramValue);
    } catch {
      // Ignore storage failures (private mode / quota exceeded)
    }
  }

  const storedValue = (() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  })();

  return normalizeFlag(paramValue) || normalizeFlag(storedValue);
}

export const MobileDiagnostics = (() => {
  const enabled = readFlag();
  const prefix = '[mobile]';

  const emit = (level: 'log' | 'warn' | 'error', scope: string, message: string, payload?: Payload) => {
    if (!enabled) return;
    const formatted = `${prefix}[${scope}] ${message}`;
    if (payload !== undefined) {
      console[level](formatted, payload);
    } else {
      console[level](formatted);
    }
  };

  const measureElement = (scope: string, el?: Element | null) => {
    if (!enabled || !el) return;
    const rect = el.getBoundingClientRect();
    emit('log', scope, `layout rect: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)} @ (${rect.left.toFixed(1)}, ${rect.top.toFixed(1)})`);
  };

  const state = {
    enabled,
    log: (scope: string, message: string, payload?: Payload) => emit('log', scope, message, payload),
    warn: (scope: string, message: string, payload?: Payload) => emit('warn', scope, message, payload),
    error: (scope: string, message: string, payload?: Payload) => emit('error', scope, message, payload),
    layout: measureElement,
  };

  if (enabled && typeof window !== 'undefined') {
    (window as any).__MOBILE_DIAGNOSTICS__ = state;
    state.log('init', 'Mobile diagnostics enabled');
  }

  return state;
})();
