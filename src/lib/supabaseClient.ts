import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL || '',
);
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const activeSupabaseOrigin = supabaseUrl;

export function normalizeSupabaseStorageUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (!supabaseUrl) return trimmed;

  if (trimmed.startsWith('/storage/v1/object/')) {
    return `${supabaseUrl}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname.endsWith('.supabase.co') &&
      parsed.pathname.startsWith('/storage/v1/object/')
    ) {
      return `${supabaseUrl}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Keep non-URL relative asset paths intact
  }

  return trimmed;
}

let clientInstance: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = clientInstance;
