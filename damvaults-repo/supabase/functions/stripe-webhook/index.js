// ============================================================
//  DAMvaults — webhook-handler.js
//  Supabase Edge Function para recibir eventos de Stripe
//
//  IMPORTANTE: Este archivo va en Supabase → Edge Functions
//  NO en el frontend. Corre en el servidor de Supabase.
//
//  INSTRUCCIONES:
//  1. Ve a Supabase → Edge Functions → New Function
//  2. Nombre: stripe-webhook
//  3. Pega este código completo
//  4. Agrega los secrets en Supabase → Settings → Secrets:
//     - STRIPE_SECRET_KEY = sk_test_tu_clave_secreta
//     - STRIPE_WEBHOOK_SECRET = whsec_tu_webhook_secret
//  5. En Stripe Dashboard → Webhooks → Add endpoint:
//     URL: https://TU_PROJECT.supabase.co/functions/v1/stripe-webhook
//     Eventos: customer.subscription.created/updated/deleted,
//              invoice.payment_succeeded/failed,
//              checkout.session.completed
// ============================================================

// Deno runtime (Supabase Edge Functions usa Deno, no Node.js)
import Stripe       from 'https://esm.sh/stripe@14.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

// ── Inicializar clientes ──
// Deno.env.get() lee las variables de entorno del servidor
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient()
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  // service role = acceso total sin RLS
);

// ============================================================
//  HANDLER PRINCIPAL DEL WEBHOOK
// ============================================================
Deno.serve(async (request) => {
  // Solo aceptar POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body      = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // ── Verificar firma del webhook ──
  // Stripe firma cada evento con tu webhook secret
  // Si la firma no coincide, alguien está intentando falsificar eventos
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET'),
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error('Firma inválida:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Evento recibido: ${event.type} — ID: ${event.id}`);

  // ── Procesar evento según su tipo ──
  try {
    switch (event.type) {

      // Checkout completado — primer pago exitoso
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      // Suscripción creada
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      // Suscripción actualizada (cambio de plan, renovación, etc.)
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      // Suscripción cancelada
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      // Factura pagada exitosamente
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      // Pago fallido
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Evento no manejado: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error procesando ${event.type}:`, err.message);
    // Retornar 500 para que Stripe reintente el webhook
    return new Response(`Processing error: ${err.message}`, { status: 500 });
  }

  // Siempre retornar 200 para confirmar recepción
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

// ============================================================
//  HANDLERS POR TIPO DE EVENTO
// ============================================================

// Checkout completado — activar el plan
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.user_id;
  const plan   = session.metadata?.plan;

  if (!userId || !plan) {
    console.error('Metadata faltante en checkout session:', session.id);
    return;
  }

  const planConfig = {
    pro:        { storage_gb: 50,   max_users: 10  },
    enterprise: { storage_gb: 999,  max_users: 999 }
  }[plan] || { storage_gb: 5, max_users: 1 };

  // Actualizar plan en profiles
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      plan,
      storage_max_bytes: planConfig.storage_gb * 1024 * 1024 * 1024,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (profileError) throw new Error('Error actualizando perfil: ' + profileError.message);

  // Guardar datos de suscripción
  await supabase
    .from('subscriptions')
    .upsert({
      user_id:                userId,
      plan,
      status:                 'active',
      stripe_customer_id:     session.customer,
      stripe_subscription_id: session.subscription,
      updated_at:             new Date().toISOString()
    }, { onConflict: 'user_id' });

  // Guardar factura
  await supabase
    .from('invoices')
    .insert({
      user_id:          userId,
      stripe_invoice_id: session.payment_intent,
      amount:           session.amount_total / 100,  // Stripe usa centavos
      currency:         session.currency.toUpperCase(),
      status:           'paid',
      plan,
      paid_at:          new Date().toISOString()
    });

  // Log de auditoría
  await supabase
    .from('security_logs')
    .insert({
      user_id:    userId,
      event:      'PLAN_UPGRADED',
      detail:     `Suscripción ${plan.toUpperCase()} activada via Stripe`,
      created_at: new Date().toISOString()
    });

  console.log(`✅ Plan ${plan} activado para usuario ${userId}`);
}

// Suscripción creada por primera vez
async function handleSubscriptionCreated(subscription) {
  const customerId = subscription.customer;

  // Buscar usuario por stripe_customer_id
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!sub) {
    console.warn('Usuario no encontrado para customer:', customerId);
    return;
  }

  await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      status:                 subscription.status,
      current_period_start:   new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end:     new Date(subscription.current_period_end   * 1000).toISOString(),
      cancel_at_period_end:   subscription.cancel_at_period_end,
      updated_at:             new Date().toISOString()
    })
    .eq('user_id', sub.user_id);

  console.log(`Suscripción creada: ${subscription.id} para ${sub.user_id}`);
}

// Suscripción actualizada — renovación, cambio de plan
async function handleSubscriptionUpdated(subscription) {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id, plan')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!sub) return;

  // Detectar cambio de plan por el price_id
  const priceId = subscription.items.data[0]?.price?.id;
  let newPlan = sub.plan;

  // Mapear price_id → plan (estos IDs los configuras en stripe-config.js)
  const priceMap = {
    'price_TU_PRICE_ID_PRO_MONTHLY':   'pro',
    'price_TU_PRICE_ID_PRO_ANNUALLY':  'pro',
    'price_TU_PRICE_ID_ENT_MONTHLY':   'enterprise',
    'price_TU_PRICE_ID_ENT_ANNUALLY':  'enterprise'
  };

  if (priceId && priceMap[priceId]) {
    newPlan = priceMap[priceId];
  }

  await supabase
    .from('subscriptions')
    .update({
      plan:                   newPlan,
      status:                 subscription.status,
      current_period_start:   new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end:     new Date(subscription.current_period_end   * 1000).toISOString(),
      cancel_at_period_end:   subscription.cancel_at_period_end,
      updated_at:             new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);

  // Si el plan cambió, actualizar profiles también
  if (newPlan !== sub.plan) {
    const storageMap = { free: 5, pro: 50, enterprise: 999 };
    await supabase
      .from('profiles')
      .update({
        plan:              newPlan,
        storage_max_bytes: storageMap[newPlan] * 1024 * 1024 * 1024,
        updated_at:        new Date().toISOString()
      })
      .eq('id', sub.user_id);

    console.log(`Plan cambiado: ${sub.plan} → ${newPlan} para ${sub.user_id}`);
  }
}

// Suscripción cancelada — degradar a Free
async function handleSubscriptionDeleted(subscription) {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!sub) return;

  // Degradar a plan Free
  await supabase
    .from('profiles')
    .update({
      plan:              'free',
      storage_max_bytes: 5 * 1024 * 1024 * 1024,
      updated_at:        new Date().toISOString()
    })
    .eq('id', sub.user_id);

  await supabase
    .from('subscriptions')
    .update({
      plan:       'free',
      status:     'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);

  await supabase
    .from('security_logs')
    .insert({
      user_id:    sub.user_id,
      event:      'PLAN_CANCELLED',
      detail:     'Suscripción cancelada — degradado a Free',
      created_at: new Date().toISOString()
    });

  console.log(`Suscripción cancelada para ${sub.user_id} — degradado a Free`);
}

// Pago exitoso — registrar factura
async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id, plan')
    .eq('stripe_subscription_id', invoice.subscription)
    .single();

  if (!sub) return;

  await supabase
    .from('invoices')
    .insert({
      user_id:           sub.user_id,
      stripe_invoice_id: invoice.id,
      amount:            invoice.amount_paid / 100,
      currency:          invoice.currency.toUpperCase(),
      status:            'paid',
      plan:              sub.plan,
      stripe_pdf_url:    invoice.invoice_pdf,
      paid_at:           new Date(invoice.status_transitions.paid_at * 1000).toISOString()
    })
    .on('conflict', 'stripe_invoice_id', 'ignore');  // idempotente

  console.log(`Factura registrada: $${invoice.amount_paid / 100} para ${sub.user_id}`);
}

// Pago fallido — notificar al usuario
async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', invoice.subscription)
    .single();

  if (!sub) return;

  // Registrar evento de pago fallido
  await supabase
    .from('security_logs')
    .insert({
      user_id:    sub.user_id,
      event:      'PAYMENT_FAILED',
      detail:     `Pago fallido — $${invoice.amount_due / 100} ${invoice.currency.toUpperCase()}`,
      created_at: new Date().toISOString()
    });

  // En producción aquí enviarías un email de aviso al usuario
  console.warn(`Pago fallido para ${sub.user_id}`);
}

// ============================================================
//  TABLA subscriptions e invoices para el schema
//  Añade esto al final de db-schema.sql
// ============================================================
/*
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan                    TEXT DEFAULT 'free',
  status                  TEXT DEFAULT 'active',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT false,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_invoice_id   TEXT UNIQUE,
  amount              DECIMAL(10,2) NOT NULL,
  currency            TEXT DEFAULT 'USD',
  status              TEXT DEFAULT 'paid',
  plan                TEXT,
  stripe_pdf_url      TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios ven su suscripción"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "usuarios ven sus facturas"
  ON invoices FOR SELECT USING (auth.uid() = user_id);
*/
