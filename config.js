/* ------------------------------------------------------------
   Configuració del projecte de Supabase.

   Aquests dos valors són PÚBLICS per disseny i poden estar en un
   repositori obert: la clau "anon" no dona accés a cap dada per si
   sola. Qui protegeix les dades són les polítiques de Row Level
   Security de supabase-setup.sql, que exigeixen sessió iniciada i
   només deixen veure les files de la teva llar.

   NO enganxis mai aquí la clau "service_role": aquella sí que
   se salta totes les proteccions.

   On trobar-los: Supabase → Project Settings → API
   ------------------------------------------------------------ */

var CONFIG = {
  url:     "https://uoqmsvbsjrmrqhjjrdpz.supabase.co",
  anonKey: "sb_publishable_T-w_cFkjhWVWDTrAFlE0DQ_vUhBEQKp"
};
