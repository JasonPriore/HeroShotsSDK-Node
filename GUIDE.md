# HeroShots SDK - Node.js Guide

Guida operativa all'SDK Node.js (`heroshots`), organizzata per caso d'uso. Per
l'elenco completo dei metodi vedi il [README](./README.md).

| Caso d'uso | Risorsa |
|---|---|
| Account, crediti, balance | `client.account`, `client.balance()`, `client.stats()` |
| Foto prodotto, anche still-life | `client.images` |
| Sfondi AI, usage rights, edit di una zona | `client.images` |
| Video corto | `client.videos` |
| Video lungo multi-segmento | `client.longvideo` |
| Still-life video | `client.stilllife` |
| Studio Hero storyboard | `client.storyboard` + `client.longvideo` |
| Avatar: lista, creazione, modifica, outfit, voce | `client.avatars` |
| Generazione in blocco (bulk) | `client.bulk` |
| Storico generazioni | `client.generations` |
| Listino e preventivi | `client.pricing` |
| Libreria: prodotti, collezioni, sfondi, categorie | `client.assets`, `client.collections`, `client.backgrounds`, `client.categories` |
| Upload file -> URL ospitato | `client.uploads` |
| Documenti BYO (manleva, liberatoria) | `client.legal` |
| Agenzie e brand gestiti | `client.agency`, `client.brand` |

## 0. Setup e autenticazione

```js
const { Client } = require("heroshots");

// API key B2B (server-to-server). Viene letta anche da HEROSHOTS_API_KEY.
const client = new Client({ apiKey: "lz_live_..." });

// Oppure login portale: salva il JWT e rifà il login da solo alla scadenza (7 giorni).
const portal = await Client.fromLogin("dev@partner.com", "secret");
```

Quale credenziale funziona dove:

| Endpoint | API key | JWT portale |
|---|---|---|
| `/api/v1/*`: immagini, video, video lungo, still-life, avatar, bulk, libreria, generazioni, listino, agency, brand | ✅ | ✅ |
| Storyboard (Studio Hero), upload, candidati immagine, cambio sfondo still-life, documenti legali BYO | ❌ | ✅ |

- Le API key **non sono accettate sul piano Free** (`ForbiddenError`, codice
  `plan_not_allowed`), tranne per gli account agenzia.
- `client.usesApiKey` è `true` quando il token è una API key (`lz_...`).

Concetti validi per tutto l'SDK:

1. **Upload automatico solo con JWT.** Con il login portale puoi passare un path
   locale ovunque serva un'immagine: l'SDK lo carica e usa l'URL ospitato. Con
   una API key passa URL pubblici `https://` (o `data:`): un path locale genera un
   `HeroShotsError` chiaro, prima di qualsiasi chiamata.
2. **Job asincroni.** Le generazioni ritornano un id; usa `wait(...)`.
3. **Costo.** Ogni generazione consuma crediti: controlla con `client.balance()`
   o chiedi un preventivo con `client.pricing.quote(...)`.
4. **Opzioni.** I valori obbligatori sono posizionali, quelli opzionali vanno in
   un oggetto finale (chiavi snake_case o camelCase). I campi extra vengono
   inoltrati così come sono; `null`/`undefined` vengono scartati.
5. **Retry.** Le risposte HTTP 429 vengono ritentate (`maxRetries: 2`), rispettando
   `Retry-After`. Gli upload multipart non vengono ritentati.

## 0.1 Agenzie: selezionare il brand/utente gestito

Se usi una API key agenzia, prima scegli il brand/utente gestito su cui vuoi
operare. Il valore è il `managed_user_id` restituito dalla creazione/lista dei
managed client. Dopo averlo impostato, usi gli stessi metodi di generazione delle
sezioni successive: l'SDK aggiunge `X-Managed-User-Id` alle richieste autenticate.

```js
const client = new Client({
  apiKey: "lz_live_YOUR_AGENCY_KEY",
  managedUserId: 12345 // brand/utente gestito selezionato
});

// Da qui in poi le generazioni vengono eseguite come quel brand.
const gen = await client.images.generate("https://example.com/product.jpg", {
  still_life: true,
  aspect_ratio: "1:1"
});

// Per passare a un altro brand gestito senza ricreare il client:
client.withManagedUser(67890);

// Per tornare a chiamate senza act-as:
client.withManagedUser(null);
```

La key agenzia deve avere `agency:act_as` e gli scope richiesti dalla route di
generazione. Lo stato della relazione e gli scope vengono validati dall'API.

Gestione dei brand:

```js
const { clients } = await client.agency.clients();
const rel = await client.agency.client(clients[0].id);   // relazione, wallet, generazioni

await client.agency.inviteClient("brand@example.com", { image_pct: 10 });
await client.agency.createClient("Acme S.r.l.", "IT", { terms: true }, { vat_number: "IT01234567890" });
await client.agency.updateClient(rel.id, { access_mode: "read_only" });
await client.agency.topup(rel.id, 25.0);                  // EUR dal wallet agenzia

// Lato brand:
await client.brand.acceptManagerInvite("invite-token");
const current = await client.brand.managerRelationship();
```

## 1. Balance e account

```js
const bal = await client.balance();
console.log("HS credits:", bal.hs_credits);
console.log("Wallet:", bal.wallet_balance, "EUR");
```

Con API key legge `GET /api/v1/me`:

```json
{ "hs_credits": 10, "currency_credit": 50.0, "wallet_balance": 50.0, "billing_type": "debit" }
```

Con JWT portale legge `GET /api/auth/stats` (vista compatta):

```json
{
  "hs_credits": 1240,
  "wallet_balance": 48.5,
  "total_credits_used": 360,
  "plan": { "wallet_balance": 48.5, "template_id": "scale", "output_resolution": "4K" }
}
```

Altro:

```js
const me = await client.me();                 // /api/v1/me (API key) o /api/auth/me (JWT)
const health = await client.account.health(); // senza autenticazione
const stats = await client.stats();           // risposta completa, solo JWT portale
```

## 2. Foto

```js
const gen = await client.images.generate("https://example.com/product.jpg", {
  avatar_id: 42,
  aspect_ratio: "4:5",
  size: "2K"
});

const done = await client.images.wait(gen.generation_id);
console.log(done.images[0].url);

// Il file finale (stessa filigrana e risoluzione della generazione):
await client.images.download(done.log_id, "out/foto.jpg");
```

Still-life (solo prodotto):

```js
await client.images.generate("https://example.com/product.jpg", { still_life: true, aspect_ratio: "1:1" });
```

Referenze extra: `background_image_url`, `body_posture_image_url`,
`hairstyle_reference_image_url`, `text_detail_image_url`,
`worn_scale_reference_url` e l'array `additional_product_image_urls` (con JWT
accettano anche path locali).

Sfondo AI, edit di una zona e usage rights:

```js
const bg = await client.images.generateBackground("marble studio, soft light", { aspect_ratio: "1:1", size: "2K" });

const { edit_prompt } = await client.images.analyzeEditRegion("data:image/png;base64,...", "rendi la borsa rossa");

// Preventivo: singolo diritto (GET) oppure lista (POST).
await client.images.usageRightsQuote(logId, null, { usage_rights_type: "paid_digital", usage_rights_duration: "6_months" });
await client.images.usageRightsQuote(logId, [{ type: "broadcast", duration: "2_years" }]);
await client.images.usageRightsUpgrade(logId, [{ type: "broadcast", duration: "2_years" }]); // addebita la differenza
```

## 3. Video corto

```js
const task = await client.videos.generate({
  product_image_url: "https://example.com/product.jpg",
  avatar_id: 42,
  custom_prompt: "slow dolly-in, soft studio light",
  duration_seconds: 15,
  ratio: "16:9",
  resolution: "1080p"
});

const done = await client.videos.wait(task.task_id || task.video_id);
console.log(done.video_url);

const mp4 = await client.videos.download(done.log_id); // Buffer
```

## 4. Still-life video

```js
const task = await client.stilllife.start("https://example.com/product.jpg", "https://example.com/background.jpg", {
  custom_prompt: "rotating pedestal, luxury feel",
  detail_image_url: "https://example.com/detail.jpg", // opzionale
  duration_seconds: 5
});

const done = await client.stilllife.wait(task.task_id);
console.log(done.video_url);

// Cambio sfondo (solo JWT portale):
await client.stilllife.changeBackground(task.task_id, { background_url: "https://example.com/bg2.jpg" });
```

## 5. Video lungo

```js
const job = await client.longvideo.start("https://example.com/product.jpg", {
  custom_prompt: "30s ad, three beats: reveal, detail, logo",
  duration_seconds: 30, // 30, 45 o 60
  ratio: "16:9",
  resolution: "1080p"
});

const final = await client.longvideo.wait(job.job_id);
console.log(final.final_video_url);

// Rifare un segmento (cascade: true rigenera anche i successivi):
await client.longvideo.regenerateSegment(job.job_id, 1, { comment: "più lento", cascade: true });
```

## 6. Studio Hero (solo JWT portale)

```js
const client = await Client.fromLogin("dev@partner.com", "secret");

const product = await client.uploads.image("product.jpg", "products");
const subject = await client.uploads.image("model.jpg", "subjects");
const duration = 30;

const briefs = await client.storyboard.briefSuggestions(
  product.public_url,
  subject.public_url,
  { duration_seconds: duration, language_code: "it" }
);

const candidates = await client.storyboard.candidates(
  briefs[0],
  duration,
  product.public_url,
  subject.public_url,
  { ratio: "16:9", language_code: "it" }
);

const job = await client.storyboard.generate(
  briefs[0],
  duration,
  candidates[0],
  product.public_url,
  subject.public_url
);
const storyboard = await client.storyboard.wait(job.job_id);

const videoJob = await client.longvideo.start(product.public_url, {
  storyboard: storyboard.storyboard
});
const final = await client.longvideo.wait(videoJob.job_id);
console.log(final.final_video_url);
```

## 7. Avatar

```js
const { avatars } = await client.avatars.list({ gender: "female", per_page: 20 });
const avatar = await client.avatars.get(123);

// Avatar AI:
await client.avatars.generate("Aria", { generate_with_ai: true, prompt: "donna 30 anni, capelli scuri" });

// Avatar da foto, una per vista (VIEW_TYPES: closeup, fullbody, profile, ...):
await client.avatars.createFromSteps("Leo", {
  closeup: "https://example.com/leo-closeup.jpg",
  fullbody: "https://example.com/leo-full.jpg"
});

// Modifica:
await client.avatars.update(123, { name: "Giulia" });
await client.avatars.uploadView(123, "profile", "https://example.com/profile.jpg");
await client.avatars.regenerateView(123, "closeup");
await client.avatars.setImageSet(123, "generated");
await client.avatars.generateVoice(123, { generation_note: "voce calda" });

// Outfit:
const shop = await client.avatars.resolveOutfitLink("https://shop.example.com/giacca");
await client.avatars.changeOutfit(123, [{ slot: "top", url: "https://example.com/top.jpg" }]);
await client.avatars.restoreOutfit(123);

// Consenso firmato (DOCX):
await client.avatars.consentDocument(123, "out/consenso.docx");
```

Avatar di persone reali (BYO, solo JWT portale): scarica i modelli, carica i
documenti firmati e collegali all'avatar.

```js
const status = await client.legal.byoStatus();
await client.legal.manlevaTemplate("out/manleva.docx");
await client.legal.uploadManleva(tenantId, "manleva-firmata.pdf", { signed_by_name: "Mario Rossi" });

const release = await client.uploads.consentDocument("liberatoria-firmata.pdf");
const idDoc = await client.uploads.consentDocument("documento.jpg");
await client.legal.attachLiberatoria(tenantId, 123, {
  release_doc_url: release.public_url,
  id_doc_url: idDoc.public_url,
  model_email: "modella@example.com",
  model_dob: "1990-01-01"
});
```

## 8. Bulk

```js
const bulk = await client.bulk.create({ prompt: "prodotto su tavolo in legno", avatar_id: 42 });
await client.bulk.uploadImages(bulk.id, ["p1.jpg", "p2.jpg", Buffer.from(bytes)]);
await client.bulk.start(bulk.id);

// Ritorna su completed, partially_completed o failed (non lancia eccezioni).
const final = await client.bulk.wait(bulk.id, { onProgress: (b) => console.log(b.status) });
await client.bulk.downloadGenerated(bulk.id, "out/bulk.zip");
await client.bulk.downloadGenerated(bulk.id, "out/scelti.zip", { item_ids: [1, 2] });
```

## 9. Storico, listino, libreria

```js
// Storico (una pagina, oppure tutte con l'async generator).
const page = await client.generations.list({ type: "video", per_page: 20 });
for await (const g of client.generations.iterate({ type: "image" })) {
  console.log(g.id);
}

// Listino e preventivi.
await client.pricing.catalog();
await client.pricing.quote("video", { duration_seconds: 15 });
await client.pricing.videoPackagesQuote("growth");

// Libreria.
const asset = await client.assets.create("Borsa", "borsa.jpg", { category_id: 4 }); // multipart
const coll = await client.collections.create("Estate");                           // JSON
await client.collections.addGeneration(coll.id, logId);
await client.backgrounds.create({ image_url: "https://example.com/bg.jpg", name: "Marmo" });
await client.categories.setSelected([1, 2]);
```

## Errori

```js
const { BillingError, QuotaExceededError, RateLimitError, ValidationError } = require("heroshots");

try {
  await client.videos.generate("https://example.com/product.jpg");
} catch (err) {
  if (err instanceof BillingError) {
    console.log("Metodo di pagamento o dati di fatturazione (P.IVA) mancanti:", err.code);
  } else if (err instanceof QuotaExceededError) {
    console.log("Crediti esauriti:", err.message);
  } else if (err instanceof RateLimitError) {
    console.log("Riprova tra", err.retryAfter, "s");
  } else if (err instanceof ValidationError) {
    console.log(err.code, err.message, err.details);
  }
}
```

| Eccezione | Quando |
|---|---|
| `ValidationError` | payload non valido |
| `AuthError` / `TokenExpiredError` | token mancante/non valido/scaduto |
| `ForbiddenError` | piano/permessi non sufficienti (es. API key sul piano Free) |
| `NotFoundError` | risorsa o job inesistente/scaduto |
| `ConflictError` | conflitto (es. cambio piano bloccato) |
| `QuotaExceededError` | crediti/quota esauriti |
| `BillingError` | nessun metodo di pagamento o dati di fatturazione/P.IVA da completare |
| `ProviderError` | generazione fallita (anche job falliti) |
| `RateLimitError` | troppe richieste (429), già ritentata `maxRetries` volte |
| `ServiceUnavailableError` / `InternalError` | problemi lato server |
