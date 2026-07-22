import { createClient } from '@supabase/supabase-js';

// LOCAL DEMO MODE: the "View demo" button on the login screen sets this flag.
// In demo mode we never talk to Supabase — `supabase` becomes a chainable no-op
// stub so any query resolves to empty data instead of throwing, and liveData.js
// serves rich demo data for the core screens. Nothing here affects real clients.
export const DEMO = typeof localStorage !== 'undefined' && localStorage.getItem('demo_mode') === '1';

// A proxy that returns itself for any method call and is awaitable, resolving to
// { data: [], error: null }. Handles every .from().select().eq()… chain, .rpc(),
// .channel().on().subscribe(), .storage, .functions.invoke and .auth.* calls.
function makeStub() {
  const resolved = Promise.resolve({ data: [], error: null, count: 0 });
  const handler = {
    get(_t, prop) {
      if (prop === 'then')    return resolved.then.bind(resolved);
      if (prop === 'catch')   return resolved.catch.bind(resolved);
      if (prop === 'finally') return resolved.finally.bind(resolved);
      return () => proxy;
    },
    apply() { return proxy; },
  };
  const proxy = new Proxy(function () {}, handler);
  return proxy;
}

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!DEMO && (!url || !anonKey)) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file.');
}

export const supabase = DEMO
  ? makeStub()
  : createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
