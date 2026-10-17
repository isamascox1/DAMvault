// ============================================================
//  DAMvaults — db-realtime.js
//  Suscripciones en tiempo real con Supabase Realtime
//  Cubre: assets, notificaciones, equipo, storage,
//         presencia de usuarios online
// ============================================================

import { supabase } from './supabase-config.js';

// ============================================================
//  GESTOR DE SUSCRIPCIONES
//  Centraliza todas las suscripciones activas
//  para poder cancelarlas limpiamente
// ============================================================
class RealtimeManager {
  constructor() {
    // Map de nombre → canal activo
    this.channels = new Map();
    this.callbacks = new Map();
  }

  // Registrar un nuevo canal
  register(name, channel) {
    // Si ya existe uno con ese nombre, cancelarlo primero
    if (this.channels.has(name)) {
      this.unsubscribe(name);
    }
    this.channels.set(name, channel);
  }

  // Cancelar una suscripción específica
  unsubscribe(name) {
    const channel = this.channels.get(name);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(name);
    }
  }

  // Cancelar TODAS las suscripciones (al cerrar sesión)
  unsubscribeAll() {
    this.channels.forEach((channel, name) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.callbacks.clear();
  }

  // Estado de conexión
  getStatus(name) {
    const channel = this.channels.get(name);
    return channel ? channel.state : 'closed';
  }
}

// Instancia global del manager
export const realtimeManager = new RealtimeManager();

// ============================================================
//  SUSCRIPCIÓN A CAMBIOS DE ASSETS
//  Detecta cuando se sube, edita o elimina una imagen
// ============================================================
export function subscribeToAssetChanges(userId, callbacks = {}) {
  const {
    onInsert = null,   // nueva imagen subida
    onUpdate = null,   // metadata editada
    onDelete = null,   // imagen eliminada
    onError  = null
  } = callbacks;

  const channel = supabase
    .channel(`assets:${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'assets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('📤 Nuevo asset:', payload.new.name);
        if (onInsert) onInsert(payload.new);
        showRealtimeNotification('Nueva imagen subida', payload.new.name, '📤');
      }
    )
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'assets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (onUpdate) onUpdate(payload.new, payload.old);
      }
    )
    .on(
      'postgres_changes',
      {
        event:  'DELETE',
        schema: 'public',
        table:  'assets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (onDelete) onDelete(payload.old);
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' && onError) {
        onError('Error en la suscripción de assets');
      }
    });

  realtimeManager.register('assets', channel);
  return () => realtimeManager.unsubscribe('assets');
}

// ============================================================
//  SUSCRIPCIÓN AL PERFIL / STORAGE
//  Detecta cuando cambia el almacenamiento usado
//  (el trigger de la DB actualiza esto automáticamente)
// ============================================================
export function subscribeToProfileChanges(userId, onStorageUpdate = null) {
  const channel = supabase
    .channel(`profile:${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'profiles',
        filter: `id=eq.${userId}`
      },
      (payload) => {
        const profile = payload.new;
        const percent = Math.round(
          (profile.storage_used_bytes / profile.storage_max_bytes) * 100
        );

        // Actualizar barra de storage en la UI
        updateStorageBar(profile.storage_used_bytes, profile.storage_max_bytes);

        if (onStorageUpdate) onStorageUpdate(profile, percent);

        // Advertir si el storage está por llenarse
        if (percent >= 90) {
          showRealtimeNotification(
            '⚠️ Almacenamiento casi lleno',
            `Usas el ${percent}% de tu espacio. Actualiza tu plan.`,
            '💾'
          );
        }
      }
    )
    .subscribe();

  realtimeManager.register('profile', channel);
  return () => realtimeManager.unsubscribe('profile');
}

// ============================================================
//  SUSCRIPCIÓN A MIEMBROS DEL EQUIPO
//  Detecta cuando alguien se une o cambia de rol
// ============================================================
export function subscribeToTeamChanges(ownerId, callbacks = {}) {
  const { onMemberJoined = null, onMemberUpdated = null, onMemberLeft = null } = callbacks;

  const channel = supabase
    .channel(`team:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'team_members',
        filter: `owner_id=eq.${ownerId}`
      },
      (payload) => {
        if (onMemberJoined) onMemberJoined(payload.new);
        showRealtimeNotification('Nuevo miembro', 'Se unió al equipo', '👥');
      }
    )
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'team_members',
        filter: `owner_id=eq.${ownerId}`
      },
      (payload) => {
        if (onMemberUpdated) onMemberUpdated(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event:  'DELETE',
        schema: 'public',
        table:  'team_members',
        filter: `owner_id=eq.${ownerId}`
      },
      (payload) => {
        if (onMemberLeft) onMemberLeft(payload.old);
      }
    )
    .subscribe();

  realtimeManager.register('team', channel);
  return () => realtimeManager.unsubscribe('team');
}

// ============================================================
//  SUSCRIPCIÓN A NOTIFICACIONES / LOGS DE SEGURIDAD
//  Muestra alertas en tiempo real cuando hay eventos de seguridad
// ============================================================
export function subscribeToSecurityEvents(userId, onEvent = null) {
  const channel = supabase
    .channel(`security:${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'security_logs',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const log = payload.new;
        if (onEvent) onEvent(log);

        // Solo mostrar notificación para eventos importantes
        const importantEvents = ['LOGIN_NEW_DEVICE', 'LOGIN_NEW_COUNTRY', 'BULK_DELETE'];
        if (importantEvents.includes(log.event)) {
          showRealtimeNotification(
            '🛡 Alerta de seguridad',
            log.detail,
            '🔐'
          );
        }
      }
    )
    .subscribe();

  realtimeManager.register('security', channel);
  return () => realtimeManager.unsubscribe('security');
}

// ============================================================
//  PRESENCIA — USUARIOS ONLINE
//  Muestra quién está usando la app en este momento
//  Útil para colaboración en equipo
// ============================================================
export function trackPresence(userId, userInfo = {}) {
  const presenceChannel = supabase.channel('online-users', {
    config: {
      presence: { key: userId }
    }
  });

  // Sync: estado completo de presencia (todos los usuarios)
  presenceChannel.on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    const onlineUsers = Object.values(state).flat();
    updateOnlineUsers(onlineUsers);
  });

  // Join: alguien entró
  presenceChannel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    console.log('Usuario online:', key, newPresences);
  });

  // Leave: alguien salió
  presenceChannel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    console.log('Usuario offline:', key);
  });

  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      // Anunciar presencia con info del usuario
      await presenceChannel.track({
        user_id:   userId,
        first_name: userInfo.first_name || 'Usuario',
        avatar:    userInfo.avatar_color || '#5b7cf6',
        page:      window.location.pathname,
        online_at: new Date().toISOString()
      });
    }
  });

  realtimeManager.register('presence', presenceChannel);
  return () => realtimeManager.unsubscribe('presence');
}

// ============================================================
//  BROADCAST — MENSAJES EN TIEMPO REAL ENTRE USUARIOS
//  Para notificaciones de equipo sin tocar la DB
// ============================================================
export function setupBroadcast(roomId, onMessage = null) {
  const channel = supabase.channel(`broadcast:${roomId}`);

  channel.on('broadcast', { event: 'team-message' }, (payload) => {
    if (onMessage) onMessage(payload.payload);
  });

  channel.subscribe();

  realtimeManager.register(`broadcast:${roomId}`, channel);

  // Retornar función para enviar mensajes
  return {
    send: (message) => channel.send({
      type:    'broadcast',
      event:   'team-message',
      payload: {
        ...message,
        sent_at: new Date().toISOString()
      }
    }),
    unsubscribe: () => realtimeManager.unsubscribe(`broadcast:${roomId}`)
  };
}

// ============================================================
//  INICIALIZAR TODAS LAS SUSCRIPCIONES AL LOGIN
//  Llama a esta función cuando el usuario inicia sesión
// ============================================================
export function initRealtimeSubscriptions(user, profile, uiCallbacks = {}) {
  const {
    onNewAsset       = null,
    onStorageUpdate  = null,
    onTeamChange     = null,
    onSecurityEvent  = null
  } = uiCallbacks;

  // Assets
  subscribeToAssetChanges(user.id, {
    onInsert: (asset) => {
      if (onNewAsset) onNewAsset(asset);
      // Actualizar contador en sidebar
      incrementBadgeCount('libCnt');
    },
    onDelete: () => {
      decrementBadgeCount('libCnt');
    }
  });

  // Storage (se actualiza con el trigger de la DB)
  subscribeToProfileChanges(user.id, onStorageUpdate);

  // Equipo
  subscribeToTeamChanges(user.id, {
    onMemberJoined: onTeamChange,
    onMemberLeft:   onTeamChange
  });

  // Seguridad
  subscribeToSecurityEvents(user.id, onSecurityEvent);

  // Presencia
  trackPresence(user.id, {
    first_name:   profile?.first_name,
    avatar_color: profile?.avatar_color
  });

  console.log('✅ Suscripciones en tiempo real iniciadas');
}

// ============================================================
//  LIMPIAR SUSCRIPCIONES AL LOGOUT
// ============================================================
export function cleanupRealtimeSubscriptions() {
  realtimeManager.unsubscribeAll();
  console.log('🔌 Suscripciones canceladas');
}

// ============================================================
//  HELPERS DE UI
//  Actualizan elementos del DOM cuando llegan datos en tiempo real
// ============================================================

// Mostrar notificación flotante (tipo toast)
function showRealtimeNotification(title, message, icon = '🔔') {
  if (typeof window.toast === 'function') {
    window.toast(`${icon} ${title}: ${message}`);
  }

  // Agregar al panel de notificaciones si existe
  const notifPanel = document.getElementById('pNotifB');
  if (notifPanel) {
    const item = document.createElement('div');
    item.style.cssText = `
      display:flex;gap:10px;padding:9px 12px;border-radius:var(--r);
      background:var(--surface);margin-bottom:6px;font-size:12px;
      border-left:2px solid var(--accent);animation:fadeUp .3s ease
    `;
    item.innerHTML = `
      <div style="font-size:16px">${icon}</div>
      <div>
        <div style="font-weight:500">${title}</div>
        <div style="color:var(--text3);font-size:10px">${message} · Ahora</div>
      </div>`;
    notifPanel.insertBefore(item, notifPanel.firstChild);
  }

  // Incrementar badge de notificaciones
  const dot = document.getElementById('ndot');
  if (dot) dot.style.display = 'block';
}

// Actualizar barra de almacenamiento en la topbar
function updateStorageBar(usedBytes, maxBytes) {
  const percent = Math.round((usedBytes / maxBytes) * 100);
  const usedGB  = (usedBytes / 1024 / 1024 / 1024).toFixed(1);

  const smf   = document.getElementById('smf');
  const sused = document.getElementById('sused');

  if (smf)   smf.style.width = percent + '%';
  if (sused) sused.textContent = usedGB + ' GB';

  // Cambiar color si está por llenarse
  if (smf) {
    if      (percent >= 90) smf.style.background = 'var(--red)';
    else if (percent >= 75) smf.style.background = 'var(--amber)';
    else                    smf.style.background = 'linear-gradient(90deg,var(--accent),var(--purple))';
  }
}

// Actualizar lista de usuarios online en la UI
function updateOnlineUsers(users) {
  const container = document.getElementById('onlineUsers');
  if (!container) return;

  container.innerHTML = users.slice(0, 5).map(u => `
    <div class="av av-sm" title="${u.first_name} — online"
         style="background:linear-gradient(135deg,${u.avatar});position:relative">
      ${(u.first_name || '?')[0].toUpperCase()}
      <span style="position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;
            border-radius:50%;background:var(--green);border:1px solid var(--bg2)"></span>
    </div>`).join('');
}

// Incrementar contador numérico en un badge
function incrementBadgeCount(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    const current = parseInt(el.textContent) || 0;
    el.textContent = current + 1;
  }
}

// Decrementar contador numérico en un badge
function decrementBadgeCount(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    const current = parseInt(el.textContent) || 0;
    el.textContent = Math.max(0, current - 1);
  }
}

// ============================================================
//  EXPORTS
// ============================================================
export {
  realtimeManager,
  subscribeToAssetChanges,
  subscribeToProfileChanges,
  subscribeToTeamChanges,
  subscribeToSecurityEvents,
  trackPresence,
  setupBroadcast,
  initRealtimeSubscriptions,
  cleanupRealtimeSubscriptions
};
