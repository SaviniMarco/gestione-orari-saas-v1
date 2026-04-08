-- ═══════════════════════════════════════════════════════════════════
-- GESTIONE PIANI UTENTI
-- Esegui in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── Imposta te stesso come OWNER (sostituisci con la tua email) ──
UPDATE public.aziende
SET piano = 'owner',
    stato = 'attivo',
    trial_end = '2099-12-31'::timestamptz
WHERE id = (SELECT id FROM auth.users WHERE email = 'TUA_EMAIL@qui.it');

-- ── Imposta un collega come INTERNO ──
-- (registrarsi prima con email, poi esegui questo)
UPDATE public.aziende
SET piano = 'interno',
    stato = 'attivo',
    trial_end = '2099-12-31'::timestamptz
WHERE id = (SELECT id FROM auth.users WHERE email = 'COLLEGA@email.it');

-- ── Vista rapida tutti i piani ──
SELECT
  u.email,
  a.nome,
  a.piano,
  a.stato,
  a.created_at::date AS iscritto,
  a.trial_end::date  AS scade,
  CASE
    WHEN a.piano IN ('owner','interno') THEN '✅ Accesso libero'
    WHEN a.piano = 'trial' AND a.trial_end > NOW() THEN '🟡 Trial attivo (' || EXTRACT(DAY FROM a.trial_end - NOW())::int || 'gg)'
    WHEN a.piano = 'trial' AND a.trial_end <= NOW() THEN '🔴 Trial scaduto'
    WHEN a.stato = 'attivo' THEN '✅ Abbonamento attivo'
    ELSE '🔴 ' || a.stato
  END AS accesso
FROM public.aziende a
JOIN auth.users u ON u.id = a.id
ORDER BY a.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════
-- COMANDI UTILI
-- ═══════════════════════════════════════════════════════════════════

-- Sospendere un cliente
-- UPDATE public.aziende SET stato = 'sospeso' WHERE id = '...uuid...';

-- Riattivare un cliente
-- UPDATE public.aziende SET stato = 'attivo' WHERE id = '...uuid...';

-- Estendere trial di 7 giorni
-- UPDATE public.aziende SET trial_end = trial_end + INTERVAL '7 days' WHERE id = '...uuid...';

-- Attivare abbonamento manualmente (senza Stripe)
-- UPDATE public.aziende
-- SET piano = 'business', stato = 'attivo',
--     expiration_date = NOW() + INTERVAL '30 days'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'cliente@email.it');
