// ============================================================
//  DAMvaults — storage.js
//  Gestión real de archivos con Supabase Storage
//  Cubre: subida, eliminación, URLs públicas, thumbnails,
//         validación, progreso en tiempo real
// ============================================================

import { supabase, getCurrentUser, APP_CONFIG } from './supabase-config.js';

// ============================================================
//  CONSTANTES DE VALIDACIÓN
// ============================================================
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/avif', 'image/svg+xml', 'image/tiff', 'image/gif',
  'image/heic', 'image/heif'
];

const FORMAT_MAP = {
  'image/jpeg': 'JPEG', 'image/jpg': 'JPEG',
  'image/png': 'PNG',   'image/webp': 'WebP',
  'image/avif': 'AVIF', 'image/svg+xml': 'SVG',
  'image/tiff': 'TIFF', 'image/gif': 'GIF',
  'image/heic': 'HEIC', 'image/heif': 'HEIF'
};

const MAX_FILE_SIZE = APP_CONFIG.storage.maxFileSizeMB * 1024 * 1024; // bytes

// ============================================================
//  VALIDAR ARCHIVO ANTES DE SUBIR
//  Siempre validar en el cliente Y en el servidor (doble seguridad)
// ============================================================
export function validateFile(file) {
  const errors = [];

  // 1. Verificar tipo de archivo
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    errors.push(`Formato no soportado: ${file.type}. Usa JPEG, PNG, WebP, SVG, etc.`);
  }

  // 2. Verificar tamaño
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    errors.push(`El archivo pesa ${sizeMB} MB. Máximo permitido: ${APP_CONFIG.storage.maxFileSizeMB} MB`);
  }

  // 3. Verificar que no esté vacío
  if (file.size === 0) {
    errors.push('El archivo está vacío');
  }

  // 4. Verificar nombre del archivo
  if (file.name.length > 255) {
    errors.push('El nombre del archivo es demasiado largo');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================
//  VERIFICAR ESPACIO DISPONIBLE DEL USUARIO
// ============================================================
export async function checkStorageQuota(userId, fileSize) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('storage_used_bytes, storage_max_bytes, plan')
    .eq('id', userId)
    .single();

  if (error) return { hasSpace: false, error: error.message };

  const available = profile.storage_max_bytes - profile.storage_used_bytes;
  const usedPercent = Math.round((profile.storage_used_bytes / profile.storage_max_bytes) * 100);

  return {
    hasSpace: available >= fileSize,
    available,
    used: profile.storage_used_bytes,
    max: profile.storage_max_bytes,
    usedPercent,
    plan: profile.plan
  };
}

// ============================================================
//  GENERAR NOMBRE ÚNICO PARA EL ARCHIVO
//  Evita colisiones si dos usuarios suben "foto.jpg"
// ============================================================
function generateFilePath(userId, originalName) {
  // Limpiar el nombre: quitar caracteres especiales
  const safeName = originalName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')  // reemplaza todo lo que no sea letra/número con -
    .replace(/-+/g, '-')            // elimina guiones dobles
    .replace(/^-|-$/g, '');         // quita guiones al inicio/fin

  // Estructura: userId/timestamp-nombre.ext
  // Así cada usuario tiene su propia "carpeta" en el bucket
  const timestamp = Date.now();
  const uniqueId = crypto.randomUUID().slice(0, 8);

  return `${userId}/${timestamp}-${uniqueId}-${safeName}`;
}

// ============================================================
//  OBTENER DIMENSIONES DE LA IMAGEN
//  Antes de subir, leemos el archivo en el navegador
// ============================================================
function getImageDimensions(file) {
  return new Promise((resolve) => {
    // SVG no tiene dimensiones fijas
    if (file.type === 'image/svg+xml') {
      resolve({ width: null, height: null });
      return;
    }

    // Creamos un elemento img temporal en memoria
    const img = new Image();
    // URL.createObjectURL crea una URL temporal para el archivo local
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url); // liberar memoria
    };

    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };

    img.src = url;
  });
}

// ============================================================
//  EXTRAER METADATA EXIF
//  EXIF contiene: cámara, fecha, ISO, GPS, exposición, etc.
//  Necesita la librería exifr (la cargamos si está disponible)
// ============================================================
async function extractExifData(file) {
  try {
    // Verificar si exifr está cargada
    if (typeof window.exifr === 'undefined') return {};

    const exif = await window.exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true
    });

    if (!exif) return {};

    // Normalizar solo los campos útiles
    return {
      camera_make:  exif.Make || null,
      camera_model: exif.Model || null,
      taken_at:     exif.DateTimeOriginal || exif.DateTime || null,
      iso:          exif.ISO || null,
      aperture:     exif.FNumber || null,
      shutter:      exif.ExposureTime || null,
      focal_length: exif.FocalLength || null,
      gps_lat:      exif.latitude || null,
      gps_lng:      exif.longitude || null,
      software:     exif.Software || null
    };
  } catch (e) {
    // Si falla la extracción, no bloqueamos la subida
    console.warn('No se pudo extraer EXIF:', e.message);
    return {};
  }
}

// ============================================================
//  SUBIR UN ARCHIVO A SUPABASE STORAGE
//  Función principal — orquesta todo el proceso
// ============================================================
export async function uploadAsset(file, options = {}, onProgress = null) {
  const {
    folder = 'General',
    tags = [],
    description = '',
    license = 'Uso interno',
    generateThumbnail = true
  } = options;

  // 1. Obtener usuario actual
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  // 2. Validar el archivo
  const validation = validateFile(file);
  if (!validation.valid) {
    return { error: validation.errors.join('. ') };
  }

  // 3. Verificar cuota de almacenamiento
  const quota = await checkStorageQuota(user.id, file.size);
  if (!quota.hasSpace) {
    const availableMB = (quota.available / 1024 / 1024).toFixed(0);
    return {
      error: `Sin espacio suficiente. Disponible: ${availableMB} MB. Actualiza tu plan.`
    };
  }

  // 4. Preparar datos del archivo
  const filePath = generateFilePath(user.id, file.name);
  const format = FORMAT_MAP[file.type] || file.type.split('/')[1].toUpperCase();

  // 5. Obtener dimensiones (en paralelo con la preparación)
  if (onProgress) onProgress({ stage: 'preparing', percent: 5 });
  const dimensions = await getImageDimensions(file);

  // 6. Extraer EXIF
  if (onProgress) onProgress({ stage: 'reading', percent: 15 });
  const exifData = await extractExifData(file);

  // 7. SUBIR el archivo a Supabase Storage
  if (onProgress) onProgress({ stage: 'uploading', percent: 20 });

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(APP_CONFIG.storage.bucket)   // nombre del bucket: 'assets'
    .upload(filePath, file, {
      cacheControl: '3600',            // el navegador cachea la imagen 1 hora
      upsert: false,                   // false = error si ya existe (no sobreescribir)
      contentType: file.type           // tipo MIME explícito
    });

  if (uploadError) {
    if (uploadError.message.includes('already exists')) {
      return { error: 'Ya existe un archivo con ese nombre' };
    }
    return { error: `Error al subir: ${uploadError.message}` };
  }

  if (onProgress) onProgress({ stage: 'uploaded', percent: 60 });

  // 8. Obtener URL pública del archivo
  const { data: urlData } = supabase.storage
    .from(APP_CONFIG.storage.bucket)
    .getPublicUrl(filePath);

  const publicUrl = urlData.publicUrl;

  // 9. Generar thumbnail si es imagen rasterizada (no SVG)
  let thumbnailUrl = null;
  if (generateThumbnail && file.type !== 'image/svg+xml') {
    if (onProgress) onProgress({ stage: 'thumbnail', percent: 70 });
    const thumbResult = await generateAndUploadThumbnail(file, user.id, filePath);
    thumbnailUrl = thumbResult.url || null;
  }

  if (onProgress) onProgress({ stage: 'saving', percent: 85 });

  // 10. Guardar registro en la base de datos
  const { data: assetRecord, error: dbError } = await supabase
    .from('assets')
    .insert({
      user_id:       user.id,
      name:          file.name.replace(/\.[^/.]+$/, ''), // nombre sin extensión
      original_name: file.name,
      file_path:     filePath,
      public_url:    publicUrl,
      thumbnail_url: thumbnailUrl,
      file_size:     file.size,
      file_type:     file.type,
      format,
      width:         dimensions.width,
      height:        dimensions.height,
      folder,
      tags,
      description,
      license,
      exif_data:     exifData
    })
    .select()    // retorna el registro insertado
    .single();

  if (dbError) {
    // Si falla la DB, eliminar el archivo ya subido (rollback manual)
    await supabase.storage.from(APP_CONFIG.storage.bucket).remove([filePath]);
    return { error: `Error guardando en base de datos: ${dbError.message}` };
  }

  // 11. Registrar en versiones
  await supabase
    .from('asset_versions')
    .insert({
      asset_id:   assetRecord.id,
      version:    1,
      file_path:  filePath,
      file_size:  file.size,
      note:       'Versión inicial',
      created_by: user.id
    });

  if (onProgress) onProgress({ stage: 'complete', percent: 100 });

  return {
    success: true,
    asset: assetRecord
  };
}

// ============================================================
//  GENERAR Y SUBIR THUMBNAIL
//  Creamos una versión pequeña (400px) de la imagen
//  usando el Canvas API del navegador — sin librerías externas
// ============================================================
async function generateAndUploadThumbnail(file, userId, originalPath) {
  try {
    const THUMB_SIZE = 400; // píxeles máximos de ancho/alto

    // Crear un canvas en memoria
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Cargar la imagen en memoria
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });

    URL.revokeObjectURL(objectUrl);

    // Calcular dimensiones proporcionales
    let { width, height } = img;
    if (width > height) {
      if (width > THUMB_SIZE) { height = (height * THUMB_SIZE) / width; width = THUMB_SIZE; }
    } else {
      if (height > THUMB_SIZE) { width = (width * THUMB_SIZE) / height; height = THUMB_SIZE; }
    }

    canvas.width  = Math.round(width);
    canvas.height = Math.round(height);

    // Dibujar la imagen redimensionada en el canvas
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Convertir canvas a Blob (archivo en memoria)
    const thumbBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.85); // WebP al 85% de calidad
    });

    if (!thumbBlob) return { url: null };

    // Subir el thumbnail al bucket en una subcarpeta thumbs/
    const thumbPath = originalPath.replace(userId + '/', userId + '/thumbs/') + '_thumb.webp';

    const { error } = await supabase.storage
      .from(APP_CONFIG.storage.bucket)
      .upload(thumbPath, thumbBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false
      });

    if (error) return { url: null };

    const { data: thumbUrlData } = supabase.storage
      .from(APP_CONFIG.storage.bucket)
      .getPublicUrl(thumbPath);

    return { url: thumbUrlData.publicUrl };

  } catch (e) {
    console.warn('Error generando thumbnail:', e.message);
    return { url: null };
  }
}

// ============================================================
//  SUBIDA MÚLTIPLE CON COLA
//  Procesa varios archivos en orden, con progreso individual
// ============================================================
export async function uploadMultipleAssets(files, options = {}, onFileProgress = null) {
  const results = [];
  const MAX_CONCURRENT = 3; // subir máximo 3 a la vez

  // Convertir FileList a Array
  const fileArray = Array.from(files);

  // Procesar en lotes de MAX_CONCURRENT
  for (let i = 0; i < fileArray.length; i += MAX_CONCURRENT) {
    const batch = fileArray.slice(i, i + MAX_CONCURRENT);

    // Promise.all procesa el lote en paralelo
    const batchResults = await Promise.all(
      batch.map((file, batchIndex) => {
        const globalIndex = i + batchIndex;
        return uploadAsset(
          file,
          { ...options, folder: options.folder || 'General' },
          (progress) => {
            if (onFileProgress) {
              onFileProgress(globalIndex, file.name, progress);
            }
          }
        );
      })
    );

    results.push(...batchResults);
  }

  const successful = results.filter(r => r.success).length;
  const failed     = results.filter(r => r.error).length;

  return { results, successful, failed };
}

// ============================================================
//  ELIMINAR ARCHIVO (soft delete + hard delete)
// ============================================================
export async function deleteAsset(assetId, permanent = false) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  if (!permanent) {
    // Soft delete: marcar como eliminado, mover a papelera
    const { error } = await supabase
      .from('assets')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', assetId)
      .eq('user_id', user.id); // RLS extra: solo el dueño puede eliminar

    if (error) return { error: error.message };
    return { success: true, type: 'soft' };
  }

  // Hard delete: eliminar físicamente
  // 1. Obtener la ruta del archivo
  const { data: asset, error: fetchError } = await supabase
    .from('assets')
    .select('file_path, thumbnail_url')
    .eq('id', assetId)
    .eq('user_id', user.id)
    .single();

  if (fetchError) return { error: fetchError.message };

  // 2. Eliminar de Storage
  const pathsToDelete = [asset.file_path];
  if (asset.thumbnail_url) {
    // Extraer path del thumbnail desde su URL pública
    const thumbPath = extractPathFromUrl(asset.thumbnail_url);
    if (thumbPath) pathsToDelete.push(thumbPath);
  }

  const { error: storageError } = await supabase.storage
    .from(APP_CONFIG.storage.bucket)
    .remove(pathsToDelete);

  if (storageError) {
    console.warn('Error eliminando de Storage:', storageError.message);
    // Continuamos igual — eliminamos el registro de la DB
  }

  // 3. Eliminar de la base de datos (el trigger actualiza el storage_used)
  const { error: dbError } = await supabase
    .from('assets')
    .delete()
    .eq('id', assetId)
    .eq('user_id', user.id);

  if (dbError) return { error: dbError.message };

  return { success: true, type: 'permanent' };
}

// ============================================================
//  RESTAURAR DESDE PAPELERA
// ============================================================
export async function restoreAsset(assetId) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  const { error } = await supabase
    .from('assets')
    .update({
      is_deleted: false,
      deleted_at: null
    })
    .eq('id', assetId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================
//  OBTENER ASSETS DEL USUARIO CON FILTROS
// ============================================================
export async function getAssets({
  folder = null,
  tags = [],
  search = '',
  sortBy = 'created_at',
  sortOrder = 'desc',
  page = 1,
  limit = 24,
  includeDeleted = false
} = {}) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  // Construir query dinámicamente
  let query = supabase
    .from('assets')
    .select('*', { count: 'exact' })  // count: 'exact' retorna el total de filas
    .eq('user_id', user.id)
    .eq('is_deleted', includeDeleted);

  // Filtro por carpeta
  if (folder) query = query.eq('folder', folder);

  // Filtro por tags (overlaps = algún tag coincide)
  if (tags.length > 0) query = query.overlaps('tags', tags);

  // Búsqueda por nombre (ilike = case insensitive like)
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  // Ordenamiento
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Paginación
  const from = (page - 1) * limit;
  const to   = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) return { error: error.message };

  return {
    assets: data,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
    hasMore: page * limit < count
  };
}

// ============================================================
//  OBTENER ASSETS EN LA PAPELERA
// ============================================================
export async function getTrashAssets() {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_deleted', true)
    .gte('deleted_at', thirtyDaysAgo.toISOString()) // solo los de los últimos 30 días
    .order('deleted_at', { ascending: false });

  if (error) return { error: error.message };

  // Calcular días restantes para eliminación permanente
  const assetsWithDays = data.map(asset => ({
    ...asset,
    daysLeft: Math.max(0, 30 - Math.floor(
      (Date.now() - new Date(asset.deleted_at)) / (1000 * 60 * 60 * 24)
    ))
  }));

  return { assets: assetsWithDays };
}

// ============================================================
//  CREAR ENLACE COMPARTIDO
// ============================================================
export async function createSharedLink(assetId, options = {}) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  const {
    expiresInDays = 7,
    allowDownload = false,
    password = null,
    resolution = 'original',
    maxViews = null
  } = options;

  // Calcular fecha de expiración
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Hashear contraseña si se proporcionó
  // En producción usarías bcrypt — aquí simplificamos
  const passwordHash = password
    ? await hashPassword(password)
    : null;

  const token = crypto.randomUUID().replace(/-/g, '');

  const { data, error } = await supabase
    .from('shared_links')
    .insert({
      asset_id:      assetId,
      created_by:    user.id,
      token,
      password_hash: passwordHash,
      allow_download: allowDownload,
      resolution,
      max_views:     maxViews,
      expires_at:    expiresAt
    })
    .select()
    .single();

  if (error) return { error: error.message };

  return {
    success: true,
    link: data,
    url: `https://damvaults.com/share/${token}`
  };
}

// ============================================================
//  REGISTRAR VISTA DE ENLACE COMPARTIDO
// ============================================================
export async function recordLinkView(token) {
  // Buscar el enlace
  const { data: link, error } = await supabase
    .from('shared_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (error || !link) return { error: 'Enlace no encontrado o inactivo' };

  // Verificar expiración
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    await supabase.from('shared_links').update({ is_active: false }).eq('token', token);
    return { error: 'Este enlace ha expirado' };
  }

  // Verificar límite de vistas
  if (link.max_views && link.views >= link.max_views) {
    return { error: 'Este enlace ha alcanzado el límite de vistas' };
  }

  // Incrementar contador de vistas
  await supabase
    .from('shared_links')
    .update({ views: link.views + 1 })
    .eq('token', token);

  return { success: true, link };
}

// ============================================================
//  ACTUALIZAR METADATA DE UN ASSET
// ============================================================
export async function updateAssetMetadata(assetId, updates) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  const allowedUpdates = ['name', 'description', 'folder', 'tags', 'license'];
  const safeUpdates = {};

  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }

  safeUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('assets')
    .update(safeUpdates)
    .eq('id', assetId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, asset: data };
}

// ============================================================
//  SUSCRIPCIÓN EN TIEMPO REAL
//  Recibe actualizaciones cuando cambian los assets sin recargar
// ============================================================
export function subscribeToAssets(userId, onInsert, onUpdate, onDelete) {
  // Supabase usa WebSockets internamente para tiempo real
  const subscription = supabase
    .channel('assets-changes')   // nombre del canal
    .on(
      'postgres_changes',
      {
        event: 'INSERT',          // cuando se inserta un asset
        schema: 'public',
        table: 'assets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => onInsert && onInsert(payload.new)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'assets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => onUpdate && onUpdate(payload.new)
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'assets',
        filter: `user_id=eq.${userId}`
      },
      (payload) => onDelete && onDelete(payload.old)
    )
    .subscribe();

  // Retornar función para cancelar la suscripción
  return () => supabase.removeChannel(subscription);
}

// ============================================================
//  HELPERS PRIVADOS
// ============================================================
function extractPathFromUrl(publicUrl) {
  try {
    const url = new URL(publicUrl);
    // La URL de Supabase Storage es: .../storage/v1/object/public/bucket/path
    const parts = url.pathname.split('/storage/v1/object/public/' + APP_CONFIG.storage.bucket + '/');
    return parts[1] || null;
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  // SHA-256 simple para el cliente — en producción usar bcrypt en el servidor
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
//  EXPORTS
// ============================================================
export {
  validateFile,
  checkStorageQuota,
  uploadAsset,
  uploadMultipleAssets,
  deleteAsset,
  restoreAsset,
  getAssets,
  getTrashAssets,
  createSharedLink,
  recordLinkView,
  updateAssetMetadata,
  subscribeToAssets
};
