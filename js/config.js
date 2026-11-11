// ---------------------------------------------------------------
//  Download bank settings
//
//  Paste your Supabase project's URL and Publishable key here
//  (Supabase dashboard > Project Settings > API Keys). Both are safe to
//  publish on GitHub: the database rules in supabase/setup.sql only
//  let visitors ADD and VIEW downloads, never change or delete them.
//
//  Leave them empty and the builder still works; downloads just
//  aren't filed in the bank.
// ---------------------------------------------------------------
window.GOLFRSA_CONFIG = {
  supabaseUrl: "https://hwmwphjgvofmuhoslzrd.supabase.co",
  supabaseAnonKey: "sb_publishable_L3--9CRcIUL_mzCqxy76eQ_NrX4zZ4f",
  bucket: "leaderboards",   // storage bucket created by setup.sql
  timeZone: "Africa/Johannesburg"
};
