-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: aggiungi campi Stripe a tabella aziende
-- Esegui in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.aziende
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ DEFAULT NOW();

-- Normalizza valori stato esistenti
UPDATE public.aziende SET stato = 'trial'  WHERE stato IN ('attivo') AND piano = 'trial';
UPDATE public.aziende SET stato = 'active' WHERE stato IN ('attivo') AND piano != 'trial';

-- Indici
CREATE INDEX IF NOT EXISTS idx_aziende_stripe_customer ON public.aziende(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_aziende_stato ON public.aziende(stato);
