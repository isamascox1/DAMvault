// ============================================================
//  DAMvaults — plans.js
//  Gestión completa de planes y suscripciones con Stripe
//  Cubre: checkout, portal de facturación, cambio de plan,
//         cancelación, validación de acceso por plan
// ============================================================

import { getStripe, STRIPE_PRODUCTS, STRIPE_APPEARANCE } from './stripe-config.js';
import { supabase, getCurrentUser, APP_CONFIG }          from './supabase-config.js';

// ============================================================
//  CREAR SESIÓN DE CHECKOUT
//  Redirige al usuario al formulario de pago de Stripe
// ============================================================
export async function createCheckoutSession(planKey, billing = 'monthly') {
  const user = await getCurrentUser();
  if (!user) return { error: 'Debes iniciar sesión para suscribirte' };

  const product = STRIPE_PRODUCTS[planKey];
  if (!product) return { error: `Plan desconocido: ${planKey}` };

  const priceId = billing === 'annually' ? product.annually : product.monthly;

  // Llamar a nuestra Edge Function de Supabase
  // Esta función corre en el servidor y usa la clave SECRETA de Stripe
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      price_id:    priceId,
      user_id:     user.id,
      user_email:  user.email,
      plan:        planKey,
      billing,
      success_url: `${window.location.origin}/app?payment=success&plan=${planKey}`,
      cancel_url:  `${window.location.origin}/app?payment=cancelled`
    }
  });

  if (error) return { error: 'Error creando sesión de pago: ' + error.message };

  // Redirigir al checkout de Stripe
  const stripe = await getStripe();
  const { error: stripeError } = await stripe.redirectToCheckout({
    sessionId: data.sessionId
  });

  if (stripeError) return { error: stripeError.message };
  return { success: true };
}

// ============================================================
//  STRIPE PAYMENT ELEMENT (formulario embebido)
//  Alternativa: mostrar el formulario dentro de la app
//  en vez de redirigir a la página de Stripe
// ============================================================
export async function initEmbeddedCheckout(planKey, billing, containerId) {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  const container = document.getElementById(containerId);
  if (!container) return { error: `No se encontró el contenedor: ${containerId}` };

  const product = STRIPE_PRODUCTS[planKey];
  const priceId = billing === 'annually' ? product.annually : product.monthly;

  // Crear PaymentIntent en el servidor
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { price_id: priceId, user_id: user.id, user_email: user.email }
  });

  if (error) return { error: error.message };

  const stripe = await getStripe();

  // Crear Elements con el clientSecret y apariencia personalizada
  const elements = stripe.elements({
    clientSecret: data.clientSecret,
    appearance:   STRIPE_APPEARANCE
  });

  // Montar el formulario de pago
  const paymentElement = elements.create('payment', {
    layout: 'tabs',  // tabs muestra tarjeta, OXXO, etc.
    defaultValues: {
      billingDetails: { email: user.email }
    }
  });

  paymentElement.mount(`#${containerId}`);

  // Retornar función para confirmar el pago
  return {
    success: true,
    confirm: async () => {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/app?payment=success&plan=${planKey}`
        }
      });

      if (confirmError) return { error: confirmError.message };
      return { success: true };
    }
  };
}

// ============================================================
//  PORTAL DE FACTURACIÓN
//  Stripe hosted portal — el usuario puede:
//  - ver facturas anteriores
//  - cambiar método de pago
//  - cancelar suscripción
//  Todo sin que nosotros toquemos los datos de tarjeta
// ============================================================
export async function openBillingPortal() {
  const user = await getCurrentUser();
  if (!user) return { error: 'No hay sesión activa' };

  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {
      user_id:    user.id,
      return_url: `${window.location.origin}/app?section=plans`
    }
  });

  if (error) return { error: 'Error abriendo portal: ' + error.message };

  // Abrir el portal de Stripe en una nueva pestaña
  window.open(data.portalUrl, '_blank');
  return { success: true };
}

// ============================================================
//  OBTENER SUSCRIPCIÓN ACTIVA DEL USUARIO
// ============================================================
export async function getActiveSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')        // tabla que llenamos via webhook
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // Si no hay fila, el usuario está en plan Free
    if (error.code === 'PGRST116') {
      return { subscription: null, plan: 'free' };
    }
    return { error: error.message };
  }

  return { subscription: data, plan: data.plan };
}

// ============================================================
//  VERIFICAR ACCESO A UNA FUNCIÓN POR PLAN
//  Úsala antes de mostrar funciones premium
// ============================================================
export async function checkFeatureAccess(feature) {
  const user = await getCurrentUser();
  if (!user) return { hasAccess: false, reason: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'free';

  // Mapa de funciones por plan
  const featureMap = {
    api_access:        ['pro', 'enterprise'],
    analytics:         ['pro', 'enterprise'],
    custom_branding:   ['enterprise'],
    sso:               ['enterprise'],
    unlimited_users:   ['enterprise'],
    webhooks:          ['pro', 'enterprise'],
    cdn:               ['pro', 'enterprise'],
    priority_support:  ['pro', 'enterprise'],
    bulk_download:     ['pro', 'enterprise'],
    version_history:   ['pro', 'enterprise']
  };

  const allowedPlans = featureMap[feature];
  if (!allowedPlans) return { hasAccess: true };  // feature libre

  const hasAccess = allowedPlans.includes(plan);

  return {
    hasAccess,
    plan,
    requiredPlan: hasAccess ? null : allowedPlans[0],
    reason: hasAccess ? null : `Esta función requiere plan ${allowedPlans[0].toUpperCase()}`
  };
}

// ============================================================
//  ACTUALIZAR PLAN EN LA DB (llamado desde webhook)
//  Esta función la invoca el webhook después de confirmar el pago
// ============================================================
export async function updateUserPlan(userId, plan, subscriptionData = {}) {
  const planConfig = APP_CONFIG.plans[plan] || APP_CONFIG.plans.free;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      plan,
      storage_max_bytes: planConfig.storage_gb * 1024 * 1024 * 1024,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (profileError) return { error: profileError.message };

  // Guardar o actualizar la suscripción
  const { error: subError } = await supabase
    .from('subscriptions')
    .upsert({
      user_id:                userId,
      plan,
      status:                 subscriptionData.status || 'active',
      stripe_subscription_id: subscriptionData.stripe_subscription_id || null,
      stripe_customer_id:     subscriptionData.stripe_customer_id || null,
      current_period_start:   subscriptionData.current_period_start || new Date().toISOString(),
      current_period_end:     subscriptionData.current_period_end || null,
      cancel_at_period_end:   subscriptionData.cancel_at_period_end || false,
      updated_at:             new Date().toISOString()
    }, {
      onConflict: 'user_id'   // si ya existe, actualizar
    });

  if (subError) return { error: subError.message };

  return { success: true };
}

// ============================================================
//  UI — RENDERIZAR PÁGINA DE PLANES CON STRIPE INTEGRADO
// ============================================================
export function renderPlansPage(currentPlan = 'free') {
  const plans = [
    {
      key:      'free',
      name:     'Free',
      monthly:  0,
      annually: 0,
      storage:  '5 GB',
      users:    '1 usuario',
      features: [
        { label: 'Almacenamiento 5 GB',      ok: true  },
        { label: '1 usuario',                ok: true  },
        { label: 'Formatos básicos',         ok: true  },
        { label: 'API REST',                 ok: false },
        { label: 'Analytics',                ok: false },
        { label: 'CDN global',               ok: false },
        { label: 'Soporte prioritario',      ok: false }
      ]
    },
    {
      key:      'pro',
      name:     'Pro',
      monthly:  29,
      annually: 279,
      storage:  '50 GB',
      users:    '10 usuarios',
      featured: true,
      features: [
        { label: 'Almacenamiento 50 GB',     ok: true },
        { label: '10 usuarios',              ok: true },
        { label: 'Todos los formatos',       ok: true },
        { label: 'API REST completa',        ok: true },
        { label: 'Analytics avanzado',       ok: true },
        { label: 'CDN global',               ok: true },
        { label: 'Soporte prioritario',      ok: true }
      ]
    },
    {
      key:      'enterprise',
      name:     'Enterprise',
      monthly:  99,
      annually: 950,
      storage:  'Ilimitado',
      users:    'Ilimitados',
      features: [
        { label: 'Almacenamiento ilimitado', ok: true },
        { label: 'Usuarios ilimitados',      ok: true },
        { label: 'SSO / LDAP / SAML',        ok: true },
        { label: 'SLA 99.99%',               ok: true },
        { label: 'Onboarding dedicado',      ok: true },
        { label: 'Soporte 24/7',             ok: true },
        { label: 'Custom branding',          ok: true }
      ]
    }
  ];

  return `
  <div class="ph">
    <div><div class="pt">Planes & Facturación</div>
    <div class="ps">Plan actual: <strong style="color:var(--accent2)">${currentPlan.toUpperCase()}</strong></div></div>
    <div class="pa">
      <button class="btn btn-g" onclick="handleBillingPortal()">📄 Ver facturas & método de pago</button>
    </div>
  </div>

  <!-- Toggle mensual / anual -->
  <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:28px;font-size:13px">
    <span id="lblMonthly" style="font-weight:600;color:var(--text)">Mensual</span>
    <div style="width:44px;height:24px;background:var(--accent);border-radius:12px;position:relative;cursor:pointer"
         id="billingToggle" onclick="toggleBilling()">
      <div style="position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;
                  top:3px;left:3px;transition:left .2s" id="billingKnob"></div>
    </div>
    <span id="lblAnnually" style="color:var(--text2)">
      Anual <span style="background:var(--gdim);color:var(--green);
      font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600">-20%</span>
    </span>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px" id="plansGrid">
    ${plans.map(p => renderPlanCard(p, currentPlan, 'monthly')).join('')}
  </div>

  <!-- Addons -->
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">⚡ Complementos</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${[
        ['🤖','IA Auto-tagging','$9/mes','Tags con visión artificial'],
        ['📦','Storage +50 GB','$12/mes','Amplía tu almacenamiento'],
        ['🌐','CDN Premium','$19/mes','150+ países'],
        ['🔌','API Avanzada','$15/mes','Rate limits + Webhooks'],
        ['📊','Analytics Pro','$9/mes','Heatmaps + reportes'],
        ['🔏','Firma digital','$12/mes','Certificación de assets'],
        ['🎨','Editor integrado','$19/mes','Edición básica en app'],
        ['🔄','Sync Drive','$9/mes','Google Drive / Dropbox']
      ].map(([ic,name,price,desc])=>`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
                  padding:13px;display:flex;gap:10px;align-items:flex-start;transition:border .15s"
           onmouseover="this.style.borderColor='var(--border3)'"
           onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:20px;flex-shrink:0">${ic}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;margin-bottom:2px">${name}</div>
          <div style="font-size:10px;color:var(--text3)">${desc}</div>
        </div>
        <button class="btn btn-g" style="font-size:11px;padding:4px 9px;flex-shrink:0"
                onclick="handleAddonPurchase('${name}','${price}')">${price}</button>
      </div>`).join('')}
    </div>
  </div>

  <!-- Facturación actual -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px">💳 Facturación</div>
      <div id="billingInfo">
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">
          <span class="spin">↻</span> Cargando...
        </div>
      </div>
    </div>
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px">📊 Uso del plan</div>
      <div id="planUsage">
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">
          <span class="spin">↻</span> Cargando...
        </div>
      </div>
    </div>
  </div>`;
}

function renderPlanCard(plan, currentPlan, billing) {
  const price    = billing === 'annually' ? plan.annually : plan.monthly;
  const isCurrent = plan.key === currentPlan;
  const period   = billing === 'annually' ? '/año' : '/mes';

  return `
  <div style="background:var(--bg2);border:1px solid ${plan.featured ? 'rgba(91,124,246,.4)' : 'var(--border)'};
              border-radius:var(--rl);padding:20px;position:relative;transition:all .2s;
              ${plan.featured ? 'background:rgba(91,124,246,.04)' : ''}"
       onmouseover="this.style.transform='translateY(-3px)'"
       onmouseout="this.style.transform='translateY(0)'">
    ${plan.featured ? `<div style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);
        background:linear-gradient(90deg,var(--accent),var(--purple));color:#fff;
        font-size:10px;padding:3px 12px;border-radius:20px;font-weight:600;white-space:nowrap">
        ✨ Más popular</div>` : ''}
    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;
                letter-spacing:.5px;margin-bottom:10px">${plan.name}</div>
    <div style="font-family:'Syne',sans-serif;font-size:30px;font-weight:800;
                letter-spacing:-1px;margin-bottom:2px">
      $${price}<span style="font-size:14px;font-weight:400;color:var(--text3)">${plan.monthly === 0 ? '' : period}</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:16px">
      ${plan.monthly === 0 ? 'Sin tarjeta requerida' : billing === 'annually' ? 'Facturado anualmente' : 'Facturado mensualmente'}
    </div>
    <div style="margin-bottom:18px">
      ${plan.features.map(f => `
      <div style="display:flex;gap:7px;font-size:12px;color:${f.ok ? 'var(--text2)' : 'var(--text4)'};padding:5px 0">
        <span style="color:${f.ok ? 'var(--green)' : 'var(--text4)'};flex-shrink:0">${f.ok ? '✓' : '–'}</span>
        ${f.label}
      </div>`).join('')}
    </div>
    ${isCurrent
      ? `<button class="btn btn-g btn-full" disabled
              style="width:100%;padding:11px;border-radius:9px;cursor:not-allowed;opacity:.6">
              Plan actual</button>`
      : plan.monthly === 0
        ? `<button class="btn btn-g" onclick="handleDowngrade()"
                style="width:100%;padding:11px;border-radius:9px;font-size:13px">
                Cambiar a Free</button>`
        : `<button class="btn btn-p" onclick="handleUpgrade('${plan.key}','${billing}')"
                style="width:100%;padding:11px;border-radius:9px;font-size:13px;font-weight:600">
                ${currentPlan === 'free' ? 'Suscribirse' : 'Cambiar plan'} →</button>`
    }
  </div>`;
}

// ============================================================
//  HANDLERS DE UI (llamados desde botones del HTML)
// ============================================================
export async function handleUpgrade(planKey, billing) {
  const access = await checkFeatureAccess('api_access');
  if (access.plan === planKey) {
    if (typeof window.toast === 'function') window.toast('Ya tienes este plan activo');
    return;
  }
  if (typeof window.toast === 'function') window.toast('🔄 Redirigiendo a Stripe...');
  const result = await createCheckoutSession(planKey, billing);
  if (result.error && typeof window.toast === 'function') window.toast('❌ ' + result.error);
}

export async function handleBillingPortal() {
  if (typeof window.toast === 'function') window.toast('📄 Abriendo portal de facturación...');
  const result = await openBillingPortal();
  if (result.error && typeof window.toast === 'function') window.toast('❌ ' + result.error);
}

export async function handleDowngrade() {
  if (!confirm('¿Cambiar al plan Free? Perderás el acceso a funciones premium.')) return;
  if (typeof window.toast === 'function') window.toast('📄 Abriendo portal para cancelar...');
  await openBillingPortal();
}

export function handleAddonPurchase(name, price) {
  if (typeof window.toast === 'function') window.toast(`🔄 Agregando ${name} (${price})...`);
  // En producción esto crea una suscripción adicional en Stripe
}

// Toggle mensual/anual en la UI
let currentBilling = 'monthly';
export function toggleBilling() {
  currentBilling = currentBilling === 'monthly' ? 'annually' : 'monthly';
  const knob    = document.getElementById('billingKnob');
  const monthly = document.getElementById('lblMonthly');
  const annual  = document.getElementById('lblAnnually');

  if (knob) knob.style.left = currentBilling === 'annually' ? '23px' : '3px';
  if (monthly) monthly.style.color = currentBilling === 'monthly' ? 'var(--text)' : 'var(--text2)';
  if (annual)  annual.style.color  = currentBilling === 'annually' ? 'var(--text)' : 'var(--text2)';

  // Re-renderizar las tarjetas con nuevos precios
  const grid = document.getElementById('plansGrid');
  if (grid) {
    const plans = ['free','pro','enterprise'];
    // Forzar re-render llamando a renderPlansPage de nuevo
    if (typeof window.nav === 'function') window.nav('plans');
  }
}

// ============================================================
//  EXPORTS
// ============================================================
export {
  createCheckoutSession,
  initEmbeddedCheckout,
  openBillingPortal,
  getActiveSubscription,
  checkFeatureAccess,
  updateUserPlan,
  renderPlansPage,
  handleUpgrade,
  handleBillingPortal,
  handleDowngrade,
  handleAddonPurchase,
  toggleBilling
};
