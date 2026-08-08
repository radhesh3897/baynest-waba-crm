import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced in the console during dev if the .env is missing.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env file.');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function signOut() {
  await supabase.auth.signOut();
}
