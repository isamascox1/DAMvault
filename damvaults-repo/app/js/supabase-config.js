// ============================================================
//  DAMvaults — supabase-config.js
//  Conexión central con Supabase
//  INSTRUCCIONES: reemplaza SUPABASE_URL y SUPABASE_ANON_KEY
//  con los valores de tu proyecto en Settings → API
// ============================================================

// ── Tus credenciales de Supabase ──
const SUPABASE_URL  = 'https://TU_PROJECT_ID.supabase.co';  // <-- reemplaza
const SUPABASE_ANON_KEY = 'TU_ANON_PUBLIC_KEY';             // <-- reemplaza

// ── Importamos la librería de Supabase desde CDN ──
// No necesitas instalar nada — se carga directo en el navegador
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── Creamos el cliente — es el objeto que usamos en TODA la app ──
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Guarda la sesión en localStorage automáticamente
    persistSession: true,
    // Detecta si la sesión expiró y renueva el token solo
    autoRefreshToken: true,
    // Detecta cambios de sesión en otras pestañas
    detectSessionInUrl: true
  }
});

// ── Función helper: obtener el usuario actual ──
// Retorna null si no hay sesión activa
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error obteniendo usuario:', error.message);
    return null;
  }
  return user;
}

// ── Función helper: obtener el perfil extendido del usuario ──
// Supabase guarda email/id en auth.users pero datos extra
// (nombre, empresa, avatar) los guardamos en nuestra tabla "profiles"
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')           // tabla en nuestra DB
    .select('*')                // todos los campos
    .eq('id', userId)           // donde id = userId
    .single();                  // esperamos un solo resultado

  if (error) {
    console.error('Error obteniendo perfil:', error.message);
    return null;
  }
  return data;
}

// ── Función helper: escuchar cambios de sesión ──
// Se ejecuta cada vez que el usuario hace login o logout
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    // event puede ser: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
    callback(event, session);
  });
}

// ── Constantes de la app ──
export const APP_CONFIG = {
  name: 'DAMvaults',
  url: 'https://damvaults.com',
  storage: {
    bucket: 'assets',           // nombre del bucket en Supabase Storage
    maxFileSizeMB: 100,         // límite por archivo
    maxStorageGB: 5,            // límite por usuario (plan free)
  },
  roles: ['admin', 'editor', 'viewer', 'guest'],
  plans: {
    free:       { storage_gb: 5,   users: 1,   price: 0  },
    pro:        { storage_gb: 50,  users: 10,  price: 29 },
    enterprise: { storage_gb: 999, users: 999, price: 99 }
  }
};
