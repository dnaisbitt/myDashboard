/**
 * Public Supabase settings. The publishable (anon) key is designed to be public:
 * Row Level Security, not secrecy, is what protects the data.
 * Never put the service-role / secret key in a NEXT_PUBLIC_ variable.
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export const isSupabaseConfigured = () => supabaseEnv() !== null;
