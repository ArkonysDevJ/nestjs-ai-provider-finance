// src/lib/supabase.ts
// [F-ID: FE-LIB-SUPABASE-01]
// @version 1.0.0
// @changelog 1.0.0 — Cliente Supabase del lado del navegador. Solo
//   maneja auth (sign in/up/session) -- las queries de datos pasan
//   siempre por el backend, nunca directo desde el frontend.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY -- copiar .env.example a .env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
