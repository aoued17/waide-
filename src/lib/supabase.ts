import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'batigest_supabase_url';
const STORAGE_ANON_KEY = 'batigest_supabase_anon_key';

function readEnvValue(metaVal: unknown, procVal: unknown): string {
  const v1 = typeof metaVal === 'string' ? metaVal.trim() : '';
  if (v1) return v1;
  const v2 = typeof procVal === 'string' ? procVal.trim() : '';
  return v2;
}

const envUrl = readEnvValue(
  import.meta.env.VITE_SUPABASE_URL,
  typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : ''
);
const envAnonKey = readEnvValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : ''
);

function readLocalStorage(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return (window.localStorage.getItem(key) ?? '').trim();
  } catch {
    return '';
  }
}

const localUrl = readLocalStorage(STORAGE_URL_KEY);
const localAnonKey = readLocalStorage(STORAGE_ANON_KEY);

const hasValidEnv = Boolean(
  envUrl && envAnonKey && envUrl.startsWith('http') && !envUrl.includes('YOUR_SUPABASE')
);
const hasValidLocal = Boolean(localUrl && localAnonKey && localUrl.startsWith('http'));

const supabaseUrl = hasValidEnv ? envUrl : hasValidLocal ? localUrl : '';
const supabaseAnonKey = hasValidEnv ? envAnonKey : hasValidLocal ? localAnonKey : '';

export const supabaseConfigSource: 'env' | 'localStorage' | 'none' = hasValidEnv
  ? 'env'
  : hasValidLocal
  ? 'localStorage'
  : 'none';

export const isSupabaseConfigured = supabaseConfigSource !== 'none';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function saveLocalSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  if (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://')) {
    throw new Error("L'URL Supabase doit commencer par https://");
  }
  if (cleanKey.length < 20) {
    throw new Error('La clé Anon Supabase semble invalide ou trop courte.');
  }
  window.localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
  window.localStorage.setItem(STORAGE_ANON_KEY, cleanKey);
}

export function clearLocalSupabaseConfig(): void {
  window.localStorage.removeItem(STORAGE_URL_KEY);
  window.localStorage.removeItem(STORAGE_ANON_KEY);
}

export function formatDbError(err: unknown): string {
  if (!err) return 'Une erreur inconnue est survenue.';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const msg = (err as { message: string }).message;
    if (msg.includes('JWT')) return 'Session expirée. Veuillez vous reconnecter.';
    if (msg.includes('row-level security')) return 'Permission insuffisante pour cette opération.';
    return msg;
  }
  return 'Erreur lors de la communication avec la base de données.';
}
