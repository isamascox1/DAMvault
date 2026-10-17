// ============================================================
//  DAMvaults — upload-handler.js
//  Conecta la UI de subida con el módulo storage.js
//  Cubre: drag & drop, selección de archivos, progreso visual,
//         cola de subida, errores, preview antes de subir
// ============================================================

import {
  uploadMultipleAssets,
  validateFile,
  checkStorageQuota
} from './storage.js';
import { getCurrentUser } from './supabase-config.js';

// ============================================================
//  ESTADO DE LA COLA DE SUBIDA
//  Un objeto central que rastrea todos los archivos en proceso
// ============================================================
const uploadState = {
  queue: [],          // archivos esperando subir
  active: [],         // archivos subiendo ahora
  completed: [],      // archivos que terminaron (éxito o error)
  isUploading: false
};

// ============================================================
//  INICIALIZAR LA ZONA DE DRAG & DROP
//  Llama a esta función pasando el ID del contenedor
// ============================================================
export function initDropZone(containerId, options = {}) {
  const {
    onFilesAdded = null,    // callback cuando el usuario selecciona archivos
    onUploadStart = null,   // callback cuando empieza la subida
    onFileProgress = null,  // callback de progreso por archivo
    onUploadComplete = null, // callback cuando termina todo
    onError = null          // callback de error
  } = options;

  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`No se encontró el elemento con id: ${containerId}`);
    return null;
  }

  // ── Crear input de archivo oculto ──
  // No podemos personalizar el input nativo de archivo visualmente
  // entonces lo ocultamos y lo activamos desde nuestro botón
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = [
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'image/svg+xml', 'image/tiff', 'image/gif', 'image/heic'
  ].join(',');
  fileInput.style.display = 'none';
  container.appendChild(fileInput);

  // ── Eventos de drag & drop ──

  // dragover: el usuario está arrastrando sobre la zona
  container.addEventListener('dragover', (e) => {
    e.preventDefault();           // necesario para permitir el drop
    e.stopPropagation();
    container.classList.add('drag-active');
  });

  // dragleave: el usuario salió de la zona sin soltar
  container.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Solo quitar la clase si salió del contenedor completo
    if (!container.contains(e.relatedTarget)) {
      container.classList.remove('drag-active');
    }
  });

  // drop: el usuario soltó los archivos
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove('drag-active');

    // DataTransfer.files contiene los archivos arrastrados
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFilesSelected(files, options);
      if (onFilesAdded) onFilesAdded(Array.from(files));
    }
  });

  // click: activar el selector de archivos del sistema
  container.addEventListener('click', (e) => {
    // Solo abrir si hacen clic en la zona, no en botones dentro
    if (e.target === container || e.target.classList.contains('drop-zone-inner')) {
      fileInput.click();
    }
  });

  // Cuando el usuario selecciona archivos desde el explorador
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFilesSelected(files, options);
      if (onFilesAdded) onFilesAdded(Array.from(files));
      // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
      fileInput.value = '';
    }
  });

  // ── Paste desde el portapapeles ──
  // El usuario puede pegar una imagen copiada (Ctrl+V)
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      handleFilesSelected(imageFiles, options);
      if (onFilesAdded) onFilesAdded(imageFiles);
    }
  });

  return {
    // Métodos públicos del dropzone
    openFilePicker: () => fileInput.click(),
    startUpload: (uploadOptions) => startUploadQueue(uploadOptions, options),
    clearQueue: () => clearUploadQueue(),
    getQueue: () => [...uploadState.queue]
  };
}

// ============================================================
//  PROCESAR ARCHIVOS SELECCIONADOS
//  Valida cada archivo y los agrega a la cola visual
// ============================================================
async function handleFilesSelected(files, options = {}) {
  const user = await getCurrentUser();
  if (!user) {
    showUploadError('Debes iniciar sesión para subir archivos');
    return;
  }

  const fileArray = Array.from(files);
  const MAX_FILES = 50;

  if (fileArray.length > MAX_FILES) {
    showUploadError(`Máximo ${MAX_FILES} archivos a la vez. Seleccionaste ${fileArray.length}.`);
    return;
  }

  // Verificar cuota una vez para todos los archivos
  const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0);
  const { checkStorageQuota } = await import('./storage.js');
  const quota = await checkStorageQuota(user.id, totalSize);

  if (!quota.hasSpace) {
    const needMB  = (totalSize / 1024 / 1024).toFixed(0);
    const availMB = (quota.available / 1024 / 1024).toFixed(0);
    showUploadError(
      `No hay espacio suficiente. Necesitas ${needMB} MB pero tienes ${availMB} MB disponibles.`
    );
    return;
  }

  // Validar y clasificar cada archivo
  const validFiles   = [];
  const invalidFiles = [];

  for (const file of fileArray) {
    const validation = validateFile(file);
    if (validation.valid) {
      validFiles.push(file);
    } else {
      invalidFiles.push({ file, errors: validation.errors });
    }
  }

  // Mostrar errores de archivos inválidos
  if (invalidFiles.length > 0) {
    const errorMsg = invalidFiles
      .map(({ file, errors }) => `${file.name}: ${errors.join(', ')}`)
      .join('\n');
    console.warn('Archivos inválidos:\n' + errorMsg);

    if (options.onValidationErrors) {
      options.onValidationErrors(invalidFiles);
    }
  }

  // Agregar archivos válidos a la cola
  for (const file of validFiles) {
    const queueItem = {
      id:       crypto.randomUUID(),
      file,
      name:     file.name,
      size:     file.size,
      type:     file.type,
      preview:  null,       // URL de preview (se genera abajo)
      status:   'pending',  // pending | uploading | complete | error
      progress: 0,
      error:    null
    };

    uploadState.queue.push(queueItem);

    // Generar preview en miniatura para mostrar en la UI
    if (file.type !== 'image/svg+xml') {
      generatePreview(file).then(previewUrl => {
        queueItem.preview = previewUrl;
        if (options.onQueueUpdate) options.onQueueUpdate([...uploadState.queue]);
      });
    }
  }

  if (options.onQueueUpdate) {
    options.onQueueUpdate([...uploadState.queue]);
  }
}

// ============================================================
//  GENERAR PREVIEW DE IMAGEN
//  Muestra una miniatura antes de subir el archivo
// ============================================================
function generatePreview(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();

    // FileReader lee el archivo como Data URL (base64)
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);

    reader.readAsDataURL(file); // convierte a base64
  });
}

// ============================================================
//  INICIAR LA SUBIDA DE LA COLA
// ============================================================
export async function startUploadQueue(uploadOptions = {}, uiOptions = {}) {
  if (uploadState.isUploading) {
    console.warn('Ya hay una subida en progreso');
    return;
  }

  const pendingItems = uploadState.queue.filter(item => item.status === 'pending');
  if (pendingItems.length === 0) {
    showUploadError('No hay archivos en la cola');
    return;
  }

  uploadState.isUploading = true;

  if (uiOptions.onUploadStart) {
    uiOptions.onUploadStart(pendingItems.length);
  }

  // Preparar archivos para subir
  const files = pendingItems.map(item => item.file);

  try {
    const results = await uploadMultipleAssets(
      files,
      uploadOptions,
      // Callback de progreso por archivo
      (fileIndex, fileName, progress) => {
        const queueItem = pendingItems[fileIndex];
        if (!queueItem) return;

        queueItem.status = progress.stage === 'complete' ? 'complete' : 'uploading';
        queueItem.progress = progress.percent;

        if (progress.stage === 'complete') {
          uploadState.completed.push(queueItem);
        }

        if (uiOptions.onFileProgress) {
          uiOptions.onFileProgress(queueItem);
        }
      }
    );

    // Marcar errores en la cola
    results.results.forEach((result, index) => {
      if (result.error && pendingItems[index]) {
        pendingItems[index].status = 'error';
        pendingItems[index].error = result.error;
      }
    });

    uploadState.isUploading = false;

    if (uiOptions.onUploadComplete) {
      uiOptions.onUploadComplete({
        successful: results.successful,
        failed:     results.failed,
        results:    results.results
      });
    }

    return results;

  } catch (error) {
    uploadState.isUploading = false;
    if (uiOptions.onError) uiOptions.onError(error.message);
    return { error: error.message };
  }
}

// ============================================================
//  LIMPIAR LA COLA
// ============================================================
export function clearUploadQueue() {
  // Revocar URLs de preview para liberar memoria
  uploadState.queue.forEach(item => {
    if (item.preview && item.preview.startsWith('blob:')) {
      URL.revokeObjectURL(item.preview);
    }
  });

  uploadState.queue     = [];
  uploadState.active    = [];
  uploadState.completed = [];
  uploadState.isUploading = false;
}

// ============================================================
//  REMOVER UN ARCHIVO DE LA COLA
// ============================================================
export function removeFromQueue(itemId) {
  const index = uploadState.queue.findIndex(item => item.id === itemId);
  if (index === -1) return false;

  const item = uploadState.queue[index];

  // No remover si ya está subiendo
  if (item.status === 'uploading') return false;

  // Revocar preview URL
  if (item.preview && item.preview.startsWith('blob:')) {
    URL.revokeObjectURL(item.preview);
  }

  uploadState.queue.splice(index, 1);
  return true;
}

// ============================================================
//  RENDERIZAR LA COLA EN LA UI
//  Genera el HTML de los items de la cola de subida
// ============================================================
export function renderUploadQueue(queue) {
  if (!queue || queue.length === 0) {
    return `
      <div style="text-align:center;padding:40px;color:var(--text3)">
        <div style="font-size:36px;margin-bottom:10px;opacity:.3">📭</div>
        <div style="font-size:13px">Arrastra imágenes aquí o haz clic para seleccionar</div>
      </div>`;
  }

  return queue.map(item => {
    const sizeMB      = (item.size / 1024 / 1024).toFixed(1);
    const statusColor = {
      pending:   'var(--text3)',
      uploading: 'var(--accent2)',
      complete:  'var(--green)',
      error:     'var(--red)'
    }[item.status] || 'var(--text3)';

    const statusLabel = {
      pending:   'En espera',
      uploading: `${item.progress}% subiendo...`,
      complete:  '✅ Completado',
      error:     `❌ ${item.error || 'Error'}`
    }[item.status] || item.status;

    const progressBar = item.status === 'uploading' ? `
      <div style="height:3px;background:var(--border);border-radius:2px;margin-top:5px;overflow:hidden">
        <div style="height:100%;width:${item.progress}%;background:var(--accent);
             border-radius:2px;transition:width .4s ease"></div>
      </div>` : '';

    const thumbnail = item.preview
      ? `<img src="${item.preview}" style="width:100%;height:100%;object-fit:cover;display:block">`
      : `<div style="font-size:20px;display:flex;align-items:center;justify-content:center;height:100%">
           ${item.type === 'image/svg+xml' ? '🎨' : item.type.includes('png') ? '🖼' : '📷'}
         </div>`;

    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px;
         background:var(--surface);border-radius:var(--r);margin-bottom:8px;
         border:1px solid ${item.status === 'error' ? 'rgba(240,82,82,.3)' : 'transparent'}"
         id="queue-item-${item.id}">
      <div style="width:42px;height:42px;border-radius:7px;background:var(--surface2);
           overflow:hidden;flex-shrink:0">${thumbnail}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;
             overflow:hidden;text-overflow:ellipsis">${item.name}</div>
        <div style="font-size:10px;color:${statusColor};margin-top:2px">${statusLabel} · ${sizeMB} MB</div>
        ${progressBar}
      </div>
      ${item.status === 'pending' ? `
      <button onclick="removeFromQueue('${item.id}')"
        style="width:26px;height:26px;border-radius:6px;background:var(--surface2);
               border:none;color:var(--text3);cursor:pointer;font-size:14px;
               display:flex;align-items:center;justify-content:center">✕</button>` : ''}
      ${item.status === 'complete' ? `<span style="color:var(--green);font-size:18px">✓</span>` : ''}
    </div>`;
  }).join('');
}

// ============================================================
//  CALCULAR TIEMPO ESTIMADO DE SUBIDA
// ============================================================
export function estimateUploadTime(files) {
  const totalBytes = Array.from(files).reduce((sum, f) => sum + f.size, 0);
  const totalMB    = totalBytes / 1024 / 1024;

  // Velocidad estimada conservadora: 2 MB/s
  const estimatedSeconds = Math.ceil(totalMB / 2);

  if (estimatedSeconds < 60) return `~${estimatedSeconds} segundos`;
  const minutes = Math.ceil(estimatedSeconds / 60);
  return `~${minutes} minuto${minutes > 1 ? 's' : ''}`;
}

// ============================================================
//  FORMATEAR TAMAÑO DE ARCHIVO
// ============================================================
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

// ============================================================
//  MOSTRAR ERROR EN LA UI
// ============================================================
function showUploadError(message) {
  // Busca la función toast global de la app
  if (typeof window.toast === 'function') {
    window.toast('⚠️ ' + message);
  } else {
    console.error('Upload error:', message);
  }
}

// ============================================================
//  EXPORTS
// ============================================================
export {
  initDropZone,
  startUploadQueue,
  clearUploadQueue,
  removeFromQueue,
  renderUploadQueue,
  estimateUploadTime,
  formatFileSize,
  uploadState
};
