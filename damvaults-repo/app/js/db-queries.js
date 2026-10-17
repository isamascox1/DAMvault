// ============================================================
//  DAMvaults — db-queries.js
//  Todas las operaciones CRUD contra Supabase
//  Cubre: usuarios, equipo, colecciones, analytics,
//         búsqueda avanzada, API keys, logs de auditoría
// ============================================================

import { supabase, getCurrentUser, APP_CONFIG } from './supabase-config.js';

// ============================================================
//  USUARIOS & PERFILES
// ============================================================

// Obtener perfil completo con estadísticas calculadas
export async function getFullProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      assets:assets(count),
      collections:collections(count),
      shared_links:shared_links(count)
    `)
    .eq('id', userId)
    .single();

  if (error) return { error: error.message };

  // Calcular porcentaje de almacenamiento
  const storagePercent = Math.round(
    (data.storage_used_bytes / data.storage_max_bytes) * 100
  );

  return {
    profile: {
      ...data,
      storage_percent: storagePercent,
      storage_used_gb: (data.storage_used_bytes / 1024 / 1024 / 1024).toFixed(2),
      storage_max_gb:  (data.storage_max_bytes  / 1024 / 1024 / 1024).toFixed(0),
      asset_count:      data.assets?.[0]?.count || 0,
      collection_count: data.collections?.[0]?.count || 0,
      link_count:       data.shared_links?.[0]?.count || 0
    }
  };
}

// Actualizar último login
export async function updateLastLogin(userId) {
  await supabase
    .from('profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', userId);
}

// Buscar usuarios del equipo por email o nombre
export async function searchTeamMembers(ownerId, searchTerm) {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      *,
      member:profiles!team_members_member_id_fkey(
        id, first_name, last_name, email,
        role, plan, storage_used_bytes, storage_max_bytes,
        avatar_color, last_login, created_at
      )
    `)
    .eq('owner_id', ownerId)
    .or(
      // Buscar en nombre o email del miembro
      `member.first_name.ilike.%${searchTerm}%,` +
      `member.last_name.ilike.%${searchTerm}%,` +
      `member.email.ilike.%${searchTerm}%`
    );

  if (error) return { error: error.message };
  return { members: data };
}

// Obtener todos los miembros del equipo con sus estadísticas
export async function getTeamMembers(ownerId) {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      id,
      role,
      joined_at,
      member:profiles!team_members_member_id_fkey(
        id, first_name, last_name, email,
        role, plan, avatar_color, avatar_url,
        storage_used_bytes, storage_max_bytes,
        last_login, created_at, tfa_enabled
      )
    `)
    .eq('owner_id', ownerId)
    .order('joined_at', { ascending: false });

  if (error) return { error: error.message };

  // Enriquecer con conteo de assets por miembro
  const membersWithStats = await Promise.all(
    data.map(async (tm) => {
      const { count } = await supabase
        .from('assets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', tm.member.id)
        .eq('is_deleted', false);

      return {
        ...tm,
        member: {
          ...tm.member,
          asset_count: count || 0,
          storage_percent: Math.round(
            (tm.member.storage_used_bytes / tm.member.storage_max_bytes) * 100
          )
        }
      };
    })
  );

  return { members: membersWithStats };
}

// Cambiar rol de un miembro del equipo
export async function updateMemberRole(ownerId, memberId, newRole) {
  if (!APP_CONFIG.roles.includes(newRole)) {
    return { error: `Rol inválido: ${newRole}` };
  }

  const { error } = await supabase
    .from('team_members')
    .update({ role: newRole })
    .eq('owner_id', ownerId)
    .eq('member_id', memberId);

  if (error) return { error: error.message };

  // También actualizar el role en profiles para consistencia
  await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', memberId);

  return { success: true };
}

// Eliminar miembro del equipo
export async function removeTeamMember(ownerId, memberId) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('owner_id', ownerId)
    .eq('member_id', memberId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================
//  COLECCIONES
// ============================================================

// Crear nueva colección
export async function createCollection({ name, description, icon, color, isPublic }) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  if (!name || name.trim().length === 0) {
    return { error: 'El nombre de la colección es obligatorio' };
  }

  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id:     user.id,
      name:        name.trim(),
      description: description || '',
      icon:        icon || '📁',
      color:       color || '#5b7cf6',
      is_public:   isPublic || false
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya tienes una colección con ese nombre' };
    }
    return { error: error.message };
  }

  return { success: true, collection: data };
}

// Obtener colecciones con conteo de assets
export async function getCollections(userId) {
  const { data, error } = await supabase
    .from('collections')
    .select(`
      *,
      collection_assets(count)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  const collections = data.map(c => ({
    ...c,
    asset_count: c.collection_assets?.[0]?.count || 0
  }));

  return { collections };
}

// Agregar asset a colección
export async function addAssetToCollection(collectionId, assetId) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  // Verificar que la colección pertenece al usuario
  const { data: collection, error: colError } = await supabase
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', user.id)
    .single();

  if (colError || !collection) {
    return { error: 'Colección no encontrada' };
  }

  const { error } = await supabase
    .from('collection_assets')
    .insert({ collection_id: collectionId, asset_id: assetId });

  if (error) {
    if (error.code === '23505') {
      return { error: 'La imagen ya está en esta colección' };
    }
    return { error: error.message };
  }

  return { success: true };
}

// Obtener assets de una colección
export async function getCollectionAssets(collectionId, { page = 1, limit = 24 } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from('collection_assets')
    .select(`
      added_at,
      asset:assets(*)
    `, { count: 'exact' })
    .eq('collection_id', collectionId)
    .order('added_at', { ascending: false })
    .range(from, to);

  if (error) return { error: error.message };

  return {
    assets: data.map(item => ({ ...item.asset, added_at: item.added_at })),
    total:  count,
    page,
    totalPages: Math.ceil(count / limit)
  };
}

// Eliminar colección completa
export async function deleteCollection(collectionId) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  // Las relaciones en collection_assets se eliminan automáticamente
  // por el ON DELETE CASCADE definido en el schema
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', collectionId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================
//  BÚSQUEDA AVANZADA
//  Busca en nombre, descripción, tags, carpeta y metadata EXIF
// ============================================================
export async function advancedSearch({
  query = '',
  folder = null,
  format = null,
  tags = [],
  dateFrom = null,
  dateTo = null,
  minWidth = null,
  maxWidth = null,
  sortBy = 'created_at',
  sortOrder = 'desc',
  page = 1,
  limit = 24
} = {}) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  let dbQuery = supabase
    .from('assets')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('is_deleted', false);

  // Búsqueda de texto en nombre y descripción
  if (query.trim()) {
    dbQuery = dbQuery.or(
      `name.ilike.%${query}%,` +
      `description.ilike.%${query}%,` +
      `original_name.ilike.%${query}%`
    );
  }

  // Filtros exactos
  if (folder)        dbQuery = dbQuery.eq('folder', folder);
  if (format)        dbQuery = dbQuery.eq('format', format.toUpperCase());
  if (tags.length)   dbQuery = dbQuery.overlaps('tags', tags);
  if (dateFrom)      dbQuery = dbQuery.gte('created_at', dateFrom);
  if (dateTo)        dbQuery = dbQuery.lte('created_at', dateTo);
  if (minWidth)      dbQuery = dbQuery.gte('width', minWidth);
  if (maxWidth)      dbQuery = dbQuery.lte('width', maxWidth);

  // Ordenamiento y paginación
  dbQuery = dbQuery
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await dbQuery;
  if (error) return { error: error.message };

  return {
    assets:     data,
    total:      count,
    page,
    totalPages: Math.ceil(count / limit),
    query,
    filters:    { folder, format, tags, dateFrom, dateTo }
  };
}

// Obtener todas las carpetas únicas del usuario
export async function getFolders(userId) {
  const { data, error } = await supabase
    .from('assets')
    .select('folder')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (error) return { error: error.message };

  // Contar assets por carpeta
  const folderCounts = {};
  data.forEach(({ folder }) => {
    folderCounts[folder] = (folderCounts[folder] || 0) + 1;
  });

  const folders = Object.entries(folderCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { folders };
}

// Obtener todos los tags únicos del usuario
export async function getTags(userId) {
  const { data, error } = await supabase
    .from('assets')
    .select('tags')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (error) return { error: error.message };

  // Aplanar el array de arrays de tags y contar ocurrencias
  const tagCounts = {};
  data.forEach(({ tags }) => {
    (tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const tags = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { tags };
}

// ============================================================
//  ANALYTICS
// ============================================================

// Obtener métricas generales del dashboard
export async function getDashboardMetrics(userId) {
  // Ejecutar todas las consultas en paralelo para mayor velocidad
  const [
    assetsResult,
    storageResult,
    sharedResult,
    trashResult,
    recentResult,
    formatsResult
  ] = await Promise.all([
    // Total de assets activos
    supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_deleted', false),

    // Storage usado
    supabase
      .from('profiles')
      .select('storage_used_bytes, storage_max_bytes, plan')
      .eq('id', userId)
      .single(),

    // Total de enlaces activos
    supabase
      .from('shared_links')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('is_active', true),

    // Assets en papelera
    supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_deleted', true),

    // Assets subidos en los últimos 7 días
    supabase
      .from('assets')
      .select('created_at')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Distribución por formato
    supabase
      .from('assets')
      .select('format')
      .eq('user_id', userId)
      .eq('is_deleted', false)
  ]);

  // Calcular distribución de formatos
  const formatDist = {};
  (formatsResult.data || []).forEach(({ format }) => {
    formatDist[format] = (formatDist[format] || 0) + 1;
  });

  const storage = storageResult.data;
  const storagePercent = storage
    ? Math.round((storage.storage_used_bytes / storage.storage_max_bytes) * 100)
    : 0;

  return {
    metrics: {
      total_assets:    assetsResult.count    || 0,
      active_links:    sharedResult.count    || 0,
      trash_count:     trashResult.count     || 0,
      uploads_7d:      recentResult.data?.length || 0,
      storage_used:    storage?.storage_used_bytes || 0,
      storage_max:     storage?.storage_max_bytes  || 0,
      storage_percent: storagePercent,
      storage_used_gb: ((storage?.storage_used_bytes || 0) / 1024 / 1024 / 1024).toFixed(2),
      plan:            storage?.plan || 'free',
      format_distribution: formatDist
    }
  };
}

// Obtener analytics detallado de assets (vistas, descargas)
export async function getAssetAnalytics(userId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Obtener assets con sus vistas totales desde shared_links
  const { data: topAssets, error } = await supabase
    .from('assets')
    .select(`
      id, name, format, folder, thumbnail_url,
      shared_links(views)
    `)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gte('created_at', since)
    .limit(10);

  if (error) return { error: error.message };

  // Calcular vistas totales por asset
  const assetsWithViews = topAssets
    .map(asset => ({
      ...asset,
      total_views: (asset.shared_links || []).reduce((sum, link) => sum + link.views, 0)
    }))
    .sort((a, b) => b.total_views - a.total_views);

  // Distribución de uploads por carpeta
  const { data: folderData } = await supabase
    .from('assets')
    .select('folder, file_size')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  const folderStats = {};
  (folderData || []).forEach(({ folder, file_size }) => {
    if (!folderStats[folder]) {
      folderStats[folder] = { count: 0, total_size: 0 };
    }
    folderStats[folder].count++;
    folderStats[folder].total_size += file_size;
  });

  const folderDistribution = Object.entries(folderStats)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      size_gb: (stats.total_size / 1024 / 1024 / 1024).toFixed(3),
      percentage: 0 // se calcula abajo
    }))
    .sort((a, b) => b.count - a.count);

  const totalAssets = folderDistribution.reduce((s, f) => s + f.count, 0);
  folderDistribution.forEach(f => {
    f.percentage = totalAssets > 0 ? Math.round((f.count / totalAssets) * 100) : 0;
  });

  return {
    top_assets:           assetsWithViews,
    folder_distribution:  folderDistribution,
    period_days:          days
  };
}

// Obtener actividad del equipo (log de acciones)
export async function getTeamActivity(userId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('security_logs')
    .select(`
      *,
      profile:profiles(first_name, last_name, avatar_color)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  return { activity: data };
}

// ============================================================
//  API KEYS
// ============================================================

// Crear nueva API key
export async function createApiKey(userId, name) {
  if (!name || name.trim().length === 0) {
    return { error: 'El nombre de la API key es obligatorio' };
  }

  // Generar la key real
  const rawKey   = 'dvk_' + crypto.randomUUID().replace(/-/g, '');
  const prefix   = rawKey.slice(0, 12) + '...';

  // Hashear la key — solo guardamos el hash, nunca la key real
  const encoder  = new TextEncoder();
  const keyData  = encoder.encode(rawKey);
  const hashBuf  = await crypto.subtle.digest('SHA-256', keyData);
  const keyHash  = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id:    userId,
      name:       name.trim(),
      key_hash:   keyHash,
      key_prefix: prefix
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Devolver la key SOLO esta vez — después no se puede recuperar
  return {
    success: true,
    key: rawKey,         // mostrar al usuario UNA SOLA VEZ
    record: data
  };
}

// Obtener API keys del usuario (sin el hash real)
export async function getApiKeys(userId) {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, calls_count, last_used, is_active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { keys: data };
}

// Revocar API key
export async function revokeApiKey(userId, keyId) {
  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', userId);

  if (error) return { error: error.message };
  return { success: true };
}

// Incrementar contador de llamadas de una API key
export async function incrementApiKeyUsage(keyHash) {
  const { error } = await supabase
    .from('api_keys')
    .update({
      calls_count: supabase.rpc('increment', { x: 1 }),
      last_used:   new Date().toISOString()
    })
    .eq('key_hash', keyHash)
    .eq('is_active', true);

  if (error) console.warn('Error incrementando uso de API key:', error.message);
}

// ============================================================
//  LINKS COMPARTIDOS
// ============================================================

// Obtener todos los links del usuario con info del asset
export async function getSharedLinks(userId) {
  const { data, error } = await supabase
    .from('shared_links')
    .select(`
      *,
      asset:assets(id, name, thumbnail_url, format)
    `)
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  // Marcar links expirados
  const now = new Date();
  const links = data.map(link => ({
    ...link,
    is_expired: link.expires_at && new Date(link.expires_at) < now,
    url: `https://damvaults.com/share/${link.token}`
  }));

  return { links };
}

// Revocar un link compartido
export async function revokeSharedLink(userId, linkId) {
  const { error } = await supabase
    .from('shared_links')
    .update({ is_active: false })
    .eq('id', linkId)
    .eq('created_by', userId);

  if (error) return { error: error.message };
  return { success: true };
}

// Revocar todos los links del usuario
export async function revokeAllSharedLinks(userId) {
  const { error } = await supabase
    .from('shared_links')
    .update({ is_active: false })
    .eq('created_by', userId)
    .eq('is_active', true);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================
//  SEGURIDAD & LOGS
// ============================================================

// Obtener log de seguridad del usuario
export async function getSecurityLog(userId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('security_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  return { logs: data };
}

// Registrar evento de seguridad
export async function logEvent(userId, event, detail) {
  const { error } = await supabase
    .from('security_logs')
    .insert({
      user_id:    userId,
      event,
      detail,
      user_agent: navigator.userAgent,
      created_at: new Date().toISOString()
    });

  if (error) console.warn('Error registrando evento:', error.message);
}

// ============================================================
//  EXPORTS
// ============================================================
export {
  getFullProfile, updateLastLogin,
  searchTeamMembers, getTeamMembers, updateMemberRole, removeTeamMember,
  createCollection, getCollections, addAssetToCollection,
  getCollectionAssets, deleteCollection,
  advancedSearch, getFolders, getTags,
  getDashboardMetrics, getAssetAnalytics, getTeamActivity,
  createApiKey, getApiKeys, revokeApiKey, incrementApiKeyUsage,
  getSharedLinks, revokeSharedLink, revokeAllSharedLinks,
  getSecurityLog, logEvent
};
