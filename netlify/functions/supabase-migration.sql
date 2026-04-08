-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETA — esegui in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Aggiungi colonne mancanti ad aziende
ALTER TABLE public.aziende
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ DEFAULT NOW();

-- 2. CRITICO: normalizza valori stato
--    Frontend e webhook usano 'active', vecchio codice usava 'attivo'
UPDATE public.aziende SET stato = 'active' WHERE stato = 'attivo' AND piano != 'trial';
UPDATE public.aziende SET stato = 'trial'  WHERE stato = 'attivo' AND piano = 'trial';

-- 3. Tabella richieste ferie/permessi
CREATE TABLE IF NOT EXISTS public.richieste_ferie (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.aziende(id) ON DELETE CASCADE,
  dipendente      TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ferie','permesso','assenza','permesso_parziale')),
  data_dal        DATE NOT NULL,
  data_al         DATE NOT NULL,
  ore             NUMERIC(4,1),
  note            TEXT,
  stato           TEXT NOT NULL DEFAULT 'richiesto' CHECK (stato IN ('richiesto','approvato','rifiutato','archiviato')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  approvato_da    TEXT,
  approvato_at    TIMESTAMPTZ
);

-- RLS richieste_ferie
ALTER TABLE public.richieste_ferie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "richieste_own" ON public.richieste_ferie;
CREATE POLICY "richieste_own" ON public.richieste_ferie
  USING (company_id = auth.uid())
  WITH CHECK (company_id = auth.uid());

-- Indici
CREATE INDEX IF NOT EXISTS idx_richieste_company   ON public.richieste_ferie(company_id);
CREATE INDEX IF NOT EXISTS idx_richieste_dip        ON public.richieste_ferie(company_id, dipendente);
CREATE INDEX IF NOT EXISTS idx_richieste_date       ON public.richieste_ferie(data_dal, data_al);
CREATE INDEX IF NOT EXISTS idx_aziende_stripe_cust  ON public.aziende(stripe_customer_id);

-- 4. Verifica stato finale
SELECT email, a.piano, a.stato, a.trial_end::date, a.expiration_date::date
FROM public.aziende a
JOIN auth.users u ON u.id = a.id
ORDER BY a.created_at DESC;
