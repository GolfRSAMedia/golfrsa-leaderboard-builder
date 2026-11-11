// ---------------------------------------------------------------
//  Download bank settings
//
//  Paste your Supabase project's URL and "anon public" key here
//  (Supabase dashboard > Project Settings > API). Both are safe to
//  publish on GitHub: the database rules in supabase/setup.sql only
//  let visitors ADD and VIEW downloads, never change or delete them.
//
//  Leave them empty and the builder still works; downloads just
//  aren't filed in the bank.
// ---------------------------------------------------------------
window.GOLFRSA_CONFIG = {
  supabaseUrl: "https://hwmwphjgvofmuhoslzrd.supabase.co",          // e.g. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "sb_publishable_L3--9CRcIUL_mzCqxy76eQ_NrX4zZ4f",      // the long "anon public" key
  bucket: "leaderboards",   // storage bucket created by setup.sql
  timeZone: "Africa/Johannesburg"
};
