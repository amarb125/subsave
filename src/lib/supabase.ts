import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkSupabaseConfig } from './supabaseConfig';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfig = checkSupabaseConfig(url, anonKey);
export const isSupabaseConfigured = supabaseConfig.ok;

/** null when credentials are missing or unsafe: the UI then shows the setup screen or demo mode. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!.trim(), anonKey!.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
