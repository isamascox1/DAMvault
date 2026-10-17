# DAMvaults — Digital Asset Management SaaS

Plataforma SaaS de gestión de assets digitales para empresas.

🌐 **damvaults.com**

---

## Estructura del proyecto

```
damvaults/
├── public/
│   └── index.html          ← Landing page (damvaults.com)
├── app/
│   ├── index.html          ← App principal (damvaults.com/app)
│   └── js/
│       ├── supabase-config.js   ← Conexión Supabase ⚠️ agregar claves
│       ├── auth.js              ← Registro, login, 2FA, OAuth
│       ├── storage.js           ← Upload, thumbnails, CDN
│       ├── upload-handler.js    ← UI drag&drop, cola de subida
│       ├── db-queries.js        ← CRUD, búsqueda, analytics
│       ├── db-realtime.js       ← Tiempo real, presencia
│       ├── stripe-config.js     ← Stripe ⚠️ agregar claves
│       ├── plans.js             ← Checkout, portal facturación
│       └── modules.js           ← Módulos UI (Teams, Analytics...)
└── supabase/
    ├── db-schema.sql            ← Ejecutar en Supabase SQL Editor
    └── functions/
        └── stripe-webhook/
            └── index.js         ← Edge Function para pagos
```

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML / CSS / JavaScript vanilla |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (JWT + OAuth) |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime |
| Pagos | Stripe Checkout + Webhooks |
| Hosting | Hostinger (estático) |
| CDN | Cloudflare |

---

## Setup — pasos para activar

### 1. Supabase
1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** → pegar y ejecutar `supabase/db-schema.sql`
3. Copiar **Project URL** y **anon key** desde Settings → API
4. Pegarlos en `app/js/supabase-config.js`:
   ```js
   const SUPABASE_URL = 'https://TU_PROJECT.supabase.co'
   const SUPABASE_ANON_KEY = 'eyJ...'
   ```

### 2. Stripe
1. Crear cuenta en [stripe.com](https://stripe.com)
2. Crear productos Pro y Enterprise en Dashboard → Products
3. Copiar **Publishable key** y **Price IDs** a `app/js/stripe-config.js`

### 3. Edge Function (Webhook de Stripe)
1. Supabase → **Edge Functions** → New Function → nombre: `stripe-webhook`
2. Pegar el contenido de `supabase/functions/stripe-webhook/index.js`
3. Agregar Secrets en Supabase → Settings → Secrets:
   - `STRIPE_SECRET_KEY` = sk_test_...
   - `STRIPE_WEBHOOK_SECRET` = whsec_...
4. En Stripe Dashboard → Webhooks → Add endpoint:
   - URL: `https://TU_PROJECT.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`

### 4. Hostinger
1. Subir `public/index.html` → raíz `/` (damvaults.com)
2. Subir carpeta `app/` → `/app/` (damvaults.com/app)

---

## Planes

| Plan | Precio | Storage | Usuarios |
|------|--------|---------|---------|
| Free | $0/mes | 5 GB | 1 |
| Pro | $29/mes | 50 GB | 10 |
| Enterprise | $99/mes | Ilimitado | Ilimitados |

---

## Funciones (70+)

Ingesta · Organización · Búsqueda · Distribución · Colaboración · Analytics · Seguridad · Monetización

