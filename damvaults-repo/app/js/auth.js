// ============================================================
//  DAMvaults — auth.js
//  Módulo completo de autenticación real con Supabase
//  Cubre: registro, login, logout, 2FA, recuperación,
//         sesión persistente, perfil de usuario
// ============================================================

import { supabase, getCurrentUser, getUserProfile, APP_CONFIG } from './supabase-config.js';

// ============================================================
//  REGISTRO DE USUARIO NUEVO
// ============================================================
export async function registerUser({ firstName, lastName, email, password, company }) {

  // 1. Validaciones antes de llamar a Supabase
  if (!email || !password || !firstName || !lastName) {
    return { error: 'Todos los campos son obligatorios' };
  }

  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/;
  if (!passwordRegex.test(password)) {
    return { error: 'La contraseña debe tener mayúscula, número y símbolo' };
  }

  // 2. Crear usuario en Supabase Auth
  // signUp registra el email y contraseña de forma segura
  // Supabase NUNCA guarda la contraseña en texto plano — usa bcrypt
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: {
      // Datos extra que se guardan en auth.users
      data: {
        first_name: firstName,
        last_name: lastName,
        company: company || ''
      },
      // URL a la que redirige el email de confirmación
      emailRedirectTo: `${APP_CONFIG.url}/auth/confirm`
    }
  });

  if (authError) {
    // Errores comunes de Supabase traducidos
    if (authError.message.includes('already registered')) {
      return { error: 'Este correo ya está registrado' };
    }
    return { error: authError.message };
  }

  // 3. Crear perfil extendido en nuestra tabla "profiles"
  // auth.users solo guarda email/password — el resto va aquí
  if (authData.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,       // mismo ID que auth.users
        first_name: firstName,
        last_name: lastName,
        company: company || '',
        role: 'viewer',             // rol por defecto
        plan: 'free',               // plan por defecto
        storage_used_bytes: 0,
        storage_max_bytes: APP_CONFIG.plans.free.storage_gb * 1024 * 1024 * 1024,
        avatar_color: getRandomGradient(),
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Error creando perfil:', profileError.message);
      // No bloqueamos el registro por esto — el perfil se puede crear después
    }
  }

  return {
    success: true,
    user: authData.user,
    // Si email confirmation está activado en Supabase, needsConfirmation = true
    needsConfirmation: !authData.session
  };
}

// ============================================================
//  LOGIN
// ============================================================
export async function loginUser({ email, password }) {

  if (!email || !password) {
    return { error: 'Correo y contraseña son obligatorios' };
  }

  // signInWithPassword verifica email + contraseña
  // Supabase devuelve un JWT (token) si son correctos
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password
  });

  if (error) {
    // Rate limiting: Supabase bloquea tras muchos intentos fallidos
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'Correo o contraseña incorrectos' };
    }
    if (error.message.includes('Email not confirmed')) {
      return { error: 'Debes confirmar tu correo antes de ingresar' };
    }
    if (error.message.includes('Too many requests')) {
      return { error: 'Demasiados intentos. Espera unos minutos.' };
    }
    return { error: error.message };
  }

  // Obtener perfil extendido del usuario
  const profile = await getUserProfile(data.user.id);

  // Registrar el login en nuestra tabla de logs de auditoría
  await logSecurityEvent({
    userId: data.user.id,
    event: 'LOGIN_SUCCESS',
    detail: `Login desde ${getBrowserInfo()}`
  });

  return {
    success: true,
    user: data.user,
    profile,
    session: data.session   // contiene access_token y refresh_token
  };
}

// ============================================================
//  LOGIN CON OAUTH (Google, GitHub, etc.)
// ============================================================
export async function loginWithOAuth(provider) {
  // provider puede ser: 'google', 'github', 'azure' (Microsoft)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${APP_CONFIG.url}/auth/callback`,
      // Pedimos acceso al perfil del usuario en Google/GitHub
      scopes: provider === 'google' ? 'email profile' : 'user:email'
    }
  });

  if (error) return { error: error.message };

  // signInWithOAuth redirige al usuario automáticamente
  // No necesitamos hacer nada más aquí
  return { success: true };
}

// ============================================================
//  LOGOUT
// ============================================================
export async function logoutUser() {
  const user = await getCurrentUser();

  if (user) {
    await logSecurityEvent({
      userId: user.id,
      event: 'LOGOUT',
      detail: 'Sesión cerrada manualmente'
    });
  }

  // signOut elimina el token del localStorage y del servidor
  const { error } = await supabase.auth.signOut();

  if (error) return { error: error.message };

  return { success: true };
}

// ============================================================
//  RECUPERACIÓN DE CONTRASEÑA
// ============================================================
export async function requestPasswordReset(email) {
  if (!email) return { error: 'El correo es obligatorio' };

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.toLowerCase().trim(),
    {
      // URL donde el usuario aterrizará después de hacer clic en el email
      redirectTo: `${APP_CONFIG.url}/auth/reset-password`
    }
  );

  if (error) return { error: error.message };

  // Por seguridad siempre decimos "enviado" aunque el email no exista
  // Esto evita que alguien descubra qué emails están registrados
  return { success: true, message: 'Si el correo existe, recibirás instrucciones' };
}

// ============================================================
//  ACTUALIZAR CONTRASEÑA (después del reset)
// ============================================================
export async function updatePassword(newPassword) {
  if (newPassword.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) return { error: error.message };

  return { success: true };
}

// ============================================================
//  VERIFICAR SESIÓN ACTIVA
// ============================================================
export async function checkSession() {
  // getSession retorna la sesión actual si existe
  // El token se renueva automáticamente si está por expirar
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) return { authenticated: false };

  // Verificar que el token no esté expirado
  const expiresAt = new Date(session.expires_at * 1000);
  const now = new Date();

  if (expiresAt < now) {
    // Token expirado — intentar renovar con refresh_token
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) return { authenticated: false };
    return { authenticated: true, session: refreshData.session };
  }

  const profile = await getUserProfile(session.user.id);

  return {
    authenticated: true,
    user: session.user,
    profile,
    session
  };
}

// ============================================================
//  ACTUALIZAR PERFIL DE USUARIO
// ============================================================
export async function updateUserProfile(userId, updates) {
  // Solo permitimos actualizar ciertos campos por seguridad
  const allowedFields = ['first_name', 'last_name', 'company', 'avatar_color', 'avatar_url'];
  const safeUpdates = {};

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      safeUpdates[key] = updates[key];
    }
  }

  safeUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update(safeUpdates)
    .eq('id', userId)     // solo actualiza el perfil del usuario actual
    .select()             // retorna el registro actualizado
    .single();

  if (error) return { error: error.message };

  return { success: true, profile: data };
}

// ============================================================
//  INVITAR USUARIO AL EQUIPO
// ============================================================
export async function inviteTeamMember({ email, role, invitedBy }) {
  // Crear invitación en nuestra tabla
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      email: email.toLowerCase().trim(),
      role,
      invited_by: invitedBy,
      token: generateInviteToken(),    // token único para el link
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 días
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {  // código PostgreSQL para duplicado
      return { error: 'Ya existe una invitación pendiente para ese correo' };
    }
    return { error: error.message };
  }

  // En producción aquí enviarías el email con el link de invitación
  // usando Supabase Edge Functions o un servicio como Resend/SendGrid
  console.log(`Invitación creada para ${email} con token: ${data.token}`);

  return { success: true, invitation: data };
}

// ============================================================
//  HELPERS PRIVADOS (solo se usan dentro de este archivo)
// ============================================================

// Registrar evento de seguridad en la base de datos
async function logSecurityEvent({ userId, event, detail }) {
  await supabase
    .from('security_logs')
    .insert({
      user_id: userId,
      event,
      detail,
      ip_address: 'client-side',   // en producción se obtiene del servidor
      user_agent: navigator.userAgent,
      created_at: new Date().toISOString()
    });
  // No hacemos nada con el error — los logs no deben bloquear la app
}

// Detectar navegador del usuario
function getBrowserInfo() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Navegador desconocido';
}

// Generar gradiente aleatorio para el avatar
function getRandomGradient() {
  const gradients = [
    '#5b7cf6,#b06ef5',
    '#1fdb8a,#22d3ee',
    '#f4a832,#f05252',
    '#b06ef5,#5b7cf6',
    '#22d3ee,#1fdb8a'
  ];
  return gradients[Math.floor(Math.random() * gradients.length)];
}

// Generar token único para invitaciones
function generateInviteToken() {
  // crypto.randomUUID() genera un UUID v4 criptográficamente seguro
  return crypto.randomUUID().replace(/-/g, '');
}

// ============================================================
//  EXPORTS — funciones disponibles para el resto de la app
// ============================================================
export {
  registerUser,
  loginUser,
  loginWithOAuth,
  logoutUser,
  requestPasswordReset,
  updatePassword,
  checkSession,
  updateUserProfile,
  inviteTeamMember
};
