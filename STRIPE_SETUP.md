# ⚡ Stripe Setup — Guida Completa
## Da zero a pagamenti attivi in 20 minuti

---

## STEP 1 — Crea prodotti su Stripe (5 min)

1. Vai su https://dashboard.stripe.com
2. **Products → + Add product**
3. Crea 4 prodotti con prezzi **ricorrenti** (Recurring):

| Nome prodotto | Tipo | Prezzo | Intervallo |
|--------------|------|--------|-----------|
| Piano Mensile | Recurring | €39 | Ogni mese |
| Piano 3 Mesi | Recurring | €35/mese | Ogni 3 mesi |
| Piano 6 Mesi | Recurring | €31/mese | Ogni 6 mesi |
| Piano Annuale | Recurring | €28/mese | Ogni anno |

4. Per ogni prodotto copia il **Price ID** (formato: `price_xxxxxxxx`)

---

## STEP 2 — Ottieni chiavi API Stripe (2 min)

1. Stripe Dashboard → **Developers → API Keys**
2. Copia:
   - **Secret key**: `sk_live_...` (o `sk_test_...` per test)
   - La **Publishable key** non serve nel backend

---

## STEP 3 — Variabili d'ambiente Netlify (5 min)

Vai su: Netlify Dashboard → Il tuo sito → **Site settings → Environment variables**

Aggiungi queste variabili:

| Nome variabile | Valore |
|---------------|--------|
| `SUPABASE_URL` | `https://uynejchwotwcwehoagnz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la service_role key di Supabase |
| `STRIPE_SECRET_KEY` | `sk_live_...` o `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | vedi Step 4 |
| `STRIPE_PRICE_MENSILE` | `price_...` del piano mensile |
| `STRIPE_PRICE_TRIMEST` | `price_...` del piano 3 mesi |
| `STRIPE_PRICE_SEMEST` | `price_...` del piano 6 mesi |
| `STRIPE_PRICE_ANNUALE` | `price_...` del piano annuale |
| `APP_URL` | `https://visionary-lamington-701083.netlify.app` |

**Dopo aver aggiunto le variabili → Trigger deploy** (Deploys → Trigger deploy)

---

## STEP 4 — Configura Webhook Stripe (5 min)

1. Stripe Dashboard → **Developers → Webhooks → + Add endpoint**
2. **Endpoint URL:**
   ```
   https://visionary-lamington-701083.netlify.app/.netlify/functions/stripe-webhook
   ```
3. **Events da ascoltare** (seleziona tutti e 4):
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Clicca **Add endpoint**
5. Copia il **Signing secret** (`whsec_...`)
6. Mettilo in Netlify come `STRIPE_WEBHOOK_SECRET`

---

## STEP 5 — Abilita Customer Portal Stripe (2 min)

Serve per il tasto "Gestisci abbonamento":

1. Stripe Dashboard → **Settings → Billing → Customer portal**
2. Clicca **Activate test link** (poi in produzione)
3. Configura cosa il cliente può fare (cancellare, cambiare piano, ecc.)

---

## STEP 6 — Test pagamento (3 min)

1. Apri il sito → registrati → aspetta che trial sia scaduto
   (o: Supabase → Table Editor → aziende → metti `trial_end` = data passata)
2. Clicca un piano → deve aprirsi Stripe Checkout
3. Usa carta test: `4242 4242 4242 4242` · data qualsiasi futura · CVC qualsiasi
4. Dopo pagamento → torna all'app → abbonamento attivo

---

## ERRORI COMUNI

| Errore | Causa | Soluzione |
|--------|-------|-----------|
| `No such price` | Price ID sbagliato o test/live mismatch | Verifica che le env var abbiano i Price ID corretti |
| `Invalid API Key` | Secret key sbagliata o env var non salvata | Rideploya dopo aver salvato le env var |
| `Webhook signature failed` | STRIPE_WEBHOOK_SECRET sbagliato | Ricopialo da Stripe → Webhooks → il tuo endpoint |
| `Method Not Allowed` | Stai chiamando la function con GET | Il frontend deve usare POST |
| Piano non attivato dopo pagamento | Webhook non arriva | Controlla Stripe → Webhooks → log eventi |

---

## FLUSSO COMPLETO

```
1. Utente clicca piano
2. Frontend → POST /.netlify/functions/create-checkout
   { plan, userId, userEmail }
3. Function crea sessione Stripe (mode: subscription)
4. Redirect → Stripe Checkout
5. Utente paga
6. Stripe → redirect success_url (?payment=success&session_id=...)
7. Frontend chiama /.netlify/functions/check-session per conferma UI
8. Stripe invia webhook → POST /.netlify/functions/stripe-webhook
9. Webhook aggiorna Supabase: piano=attivo, expiration_date=...
10. Al prossimo login → app sbloccata
```
