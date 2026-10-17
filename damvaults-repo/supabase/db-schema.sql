-- ============================================================
--  DAMvaults — db-schema.sql
--  Esquema completo de la base de datos en Supabase
--  INSTRUCCIONES: ejecuta esto en Supabase → SQL Editor
--  Hazlo en orden, de arriba hacia abajo
-- ============================================================

-- ── Extensión para UUIDs ──
-- uuid-ossp permite generar IDs únicos automáticamente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
--  TABLA: profiles
--  Extiende auth.users con datos propios de la app
--  Supabase crea auth.users automáticamente — nosotros
--  creamos profiles para guardar datos extra
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  company             TEXT DEFAULT '',
  role                TEXT DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer','guest')),
  plan                TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  storage_used_bytes  BIGINT DEFAULT 0,
  storage_max_bytes   BIGINT DEFAULT 5368709120, -- 5 GB en bytes
  avatar_color        TEXT DEFAULT '#5b7cf6,#b06ef5',
  avatar_url          TEXT,
  tfa_enabled         BOOLEAN DEFAULT false,
  last_login          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: assets (las imágenes)
--  Cada fila es un archivo subido por un usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  file_path       TEXT NOT NULL,        -- ruta en Supabase Storage
  public_url      TEXT,                 -- URL pública del archivo
  thumbnail_url   TEXT,                 -- URL del thumbnail 400px
  file_size       BIGINT NOT NULL,      -- tamaño en bytes
  file_type       TEXT NOT NULL,        -- MIME type: image/jpeg, etc.
  format          TEXT NOT NULL,        -- JPEG, PNG, SVG, etc.
  width           INTEGER,              -- píxeles
  height          INTEGER,              -- píxeles
  folder          TEXT DEFAULT 'General',
  tags            TEXT[] DEFAULT '{}',  -- array de strings: ['marketing','2024']
  description     TEXT DEFAULT '',
  license         TEXT DEFAULT 'Uso interno',
  color_palette   TEXT[] DEFAULT '{}',  -- colores dominantes detectados
  exif_data       JSONB DEFAULT '{}',   -- metadata EXIF: cámara, GPS, fecha, etc.
  is_deleted      BOOLEAN DEFAULT false,-- papelera (soft delete)
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: asset_versions (historial de versiones)
--  Cada vez que se reemplaza un archivo, guardamos la versión anterior
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   BIGINT NOT NULL,
  note        TEXT DEFAULT 'Nueva versión',
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: collections (colecciones / álbumes)
-- ============================================================
CREATE TABLE IF NOT EXISTS collections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon        TEXT DEFAULT '📁',
  color       TEXT DEFAULT '#5b7cf6',
  is_public   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: collection_assets (relación entre colecciones e imágenes)
--  Una imagen puede estar en múltiples colecciones
-- ============================================================
CREATE TABLE IF NOT EXISTS collection_assets (
  collection_id   UUID REFERENCES collections(id) ON DELETE CASCADE,
  asset_id        UUID REFERENCES assets(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, asset_id)   -- clave primaria compuesta
);

-- ============================================================
--  TABLA: shared_links (enlaces compartidos)
-- ============================================================
CREATE TABLE IF NOT EXISTS shared_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID REFERENCES assets(id) ON DELETE CASCADE,
  collection_id   UUID REFERENCES collections(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  token           TEXT UNIQUE NOT NULL,   -- token único en la URL
  password_hash   TEXT,                   -- contraseña opcional (hasheada)
  allow_download  BOOLEAN DEFAULT false,
  resolution      TEXT DEFAULT 'original',
  views           INTEGER DEFAULT 0,
  max_views       INTEGER,                -- null = ilimitado
  expires_at      TIMESTAMPTZ,            -- null = no expira
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: team_members (equipo de una organización)
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES profiles(id),   -- quien invitó
  member_id   UUID NOT NULL REFERENCES profiles(id),   -- quien fue invitado
  role        TEXT DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer','guest')),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, member_id)    -- un usuario no puede estar dos veces en el mismo equipo
);

-- ============================================================
--  TABLA: invitations (invitaciones pendientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL,
  role        TEXT DEFAULT 'viewer',
  invited_by  UUID NOT NULL REFERENCES profiles(id),
  token       TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: security_logs (auditoría)
-- ============================================================
CREATE TABLE IF NOT EXISTS security_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event       TEXT NOT NULL,    -- LOGIN_SUCCESS, LOGOUT, UPLOAD, DELETE, etc.
  detail      TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  TABLA: api_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT UNIQUE NOT NULL,   -- nunca guardamos la key en texto plano
  key_prefix  TEXT NOT NULL,          -- dvk_prod_ — para mostrar al usuario
  calls_count INTEGER DEFAULT 0,
  last_used   TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
--  ÍNDICES — aceleran las consultas más frecuentes
--  Sin índices, buscar en millones de filas sería lento
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_assets_user_id     ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_folder       ON assets(folder);
CREATE INDEX IF NOT EXISTS idx_assets_is_deleted   ON assets(is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_created_at   ON assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_tags         ON assets USING GIN(tags);  -- índice para arrays
CREATE INDEX IF NOT EXISTS idx_shared_links_token  ON shared_links(token);
CREATE INDEX IF NOT EXISTS idx_security_logs_user  ON security_logs(user_id, created_at DESC);

-- ============================================================
--  ROW LEVEL SECURITY (RLS)
--  La seguridad más importante de Supabase
--  Sin RLS, cualquiera podría leer los datos de otros usuarios
--  Con RLS, cada usuario solo ve sus propios datos
-- ============================================================

-- Activar RLS en todas las tablas
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys        ENABLE ROW LEVEL SECURITY;

-- ── Políticas para profiles ──
-- auth.uid() es una función de Supabase que retorna el ID del usuario actual
CREATE POLICY "usuarios ven su propio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "usuarios actualizan su propio perfil"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "sistema puede insertar perfiles"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── Políticas para assets ──
CREATE POLICY "usuarios ven sus propios assets"
  ON assets FOR SELECT
  USING (auth.uid() = user_id AND is_deleted = false);

CREATE POLICY "usuarios insertan sus propios assets"
  ON assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "usuarios actualizan sus propios assets"
  ON assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "usuarios eliminan sus propios assets"
  ON assets FOR DELETE
  USING (auth.uid() = user_id);

-- ── Políticas para collections ──
CREATE POLICY "usuarios ven sus propias colecciones"
  ON collections FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "usuarios gestionan sus colecciones"
  ON collections FOR ALL
  USING (auth.uid() = user_id);

-- ── Políticas para shared_links ──
CREATE POLICY "usuarios ven sus propios enlaces"
  ON shared_links FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "usuarios gestionan sus enlaces"
  ON shared_links FOR ALL
  USING (auth.uid() = created_by);

-- ── Políticas para security_logs ──
CREATE POLICY "usuarios ven su propio log"
  ON security_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sistema inserta logs"
  ON security_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Políticas para api_keys ──
CREATE POLICY "usuarios gestionan sus api keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
--  FUNCIÓN: actualizar storage_used_bytes automáticamente
--  Se ejecuta sola cada vez que se sube o elimina un archivo
-- ============================================================
CREATE OR REPLACE FUNCTION update_storage_used()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Suma el tamaño del nuevo archivo al total del usuario
    UPDATE profiles
    SET storage_used_bytes = storage_used_bytes + NEW.file_size
    WHERE id = NEW.user_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Resta el tamaño del archivo eliminado
    UPDATE profiles
    SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.file_size)
    WHERE id = OLD.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que llama a la función automáticamente
CREATE TRIGGER trigger_update_storage
  AFTER INSERT OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_storage_used();

-- ============================================================
--  FUNCIÓN: limpiar invitaciones expiradas
--  Ejecutar periódicamente (se puede automatizar con pg_cron)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
  UPDATE invitations
  SET status = 'expired'
  WHERE expires_at < NOW() AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  BUCKET DE STORAGE
--  Ejecuta esto también en SQL Editor de Supabase
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assets',
  'assets',
  true,                         -- archivos públicamente accesibles via URL
  104857600,                    -- 100 MB en bytes
  ARRAY[                        -- solo imágenes permitidas
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'image/tiff',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Política de storage: solo el dueño puede subir/eliminar sus archivos
CREATE POLICY "usuarios suben a su propia carpeta"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "usuarios eliminan sus propios archivos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "archivos publicamente visibles"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assets');
