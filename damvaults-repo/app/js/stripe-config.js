// ============================================================
//  DAMvaults — stripe-config.js
//  Configuración central de Stripe para pagos
//  INSTRUCCIONES: reemplaza STRIPE_PUBLIC_KEY con tu clave
//  pública de Stripe (Settings → API keys → Publishable key)
// ============================================================

// ── Clave pública de Stripe ──
// Esta clave es PÚBLICA — es seguro tenerla en el frontend
// La clave SECRETA NUNCA va en el frontend — solo en el servidor
const STRIPE_PUBLIC_KEY = 'pk_test_TU_CLAVE_PUBLICA_AQUI';  // <-- reemplaza

// ── Cargar Stripe.js desde CDN oficial ──
// Stripe exige cargar su librería desde su propio dominio
// por razones de seguridad y cumplimiento PCI DSS
let stripeInstance = null;

export async function getStripe() {
  if (stripeInstance) return stripeInstance;

  // Cargar el script de Stripe si no está cargado
  if (!window.Stripe) {
    await loadStripeScript();
  }

  stripeInstance = window.Stripe(STRIPE_PUBLIC_KEY);
  return stripeInstance;
}

function loadStripeScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload  = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Stripe.js'));
    document.head.appendChild(script);
  });
}

// ── IDs de productos en Stripe ──
// Estos IDs los obtienes en Stripe Dashboard → Products
// después de crear los productos allí
export const STRIPE_PRODUCTS = {
  pro: {
    monthly:  'price_TU_PRICE_ID_PRO_MONTHLY',      // <-- reemplaza
    annually: 'price_TU_PRICE_ID_PRO_ANNUALLY',     // <-- reemplaza
    name:     'DAMvaults Pro',
    price_monthly:  29,
    price_annually: 279,   // ahorra ~$70
    storage_gb:     50,
    max_users:      10
  },
  enterprise: {
    monthly:  'price_TU_PRICE_ID_ENT_MONTHLY',      // <-- reemplaza
    annually: 'price_TU_PRICE_ID_ENT_ANNUALLY',     // <-- reemplaza
    name:     'DAMvaults Enterprise',
    price_monthly:  99,
    price_annually: 950,
    storage_gb:     -1,    // -1 = ilimitado
    max_users:      -1
  }
};

// ── URL del backend para webhooks ──
// En producción esto apunta a una Supabase Edge Function
// que recibe los eventos de Stripe de forma segura
export const STRIPE_WEBHOOK_URL = 'https://TU_PROJECT.supabase.co/functions/v1/stripe-webhook';

// ── Configuración de apariencia del formulario de pago ──
// Stripe Elements usa estos colores para que el formulario
// se vea integrado con tu diseño
export const STRIPE_APPEARANCE = {
  theme: 'night',
  variables: {
    colorPrimary:        '#5b7cf6',
    colorBackground:     '#0d0f16',
    colorText:           '#dde0f0',
    colorDanger:         '#f05252',
    fontFamily:          'DM Sans, system-ui, sans-serif',
    spacingUnit:         '4px',
    borderRadius:        '9px',
    colorTextPlaceholder: '#4a5280'
  },
  rules: {
    '.Input': {
      border:          '1px solid #272d48',
      backgroundColor: '#111420',
      color:           '#dde0f0'
    },
    '.Input:focus': {
      border:     '1px solid #5b7cf6',
      boxShadow:  '0 0 0 3px rgba(91,124,246,0.15)'
    },
    '.Label': {
      color:     '#8892b8',
      fontSize:  '12px',
      fontWeight:'500'
    }
  }
};
