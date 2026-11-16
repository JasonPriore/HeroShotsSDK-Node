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
| Studio Hero (storyboard, tutte le fasi, voci, montaggio automatico) | `client.storyboard` + `client.audio` + `client.longvideo` |
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
| Storyboard (Studio Hero), voci, upload, candidati immagine, export e montaggio automatico del video lungo, cambio sfondo still-life, documenti legali BYO | ❌ | ✅ |

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
  aspect_ratio: "3:4", // 1:1 16:9 4:3 3:4 9:16 3:2 2:3 21:9
  size: "2K"           // 720p 1080p 2K 4K
});
console.log(gen.url); // la chiamata attende l'immagine finita

// Per non tenere aperta la richiesta: async_generation, poi wait().
const job = await client.images.generate("https://example.com/product.jpg", { avatar_id: 42, async_generation: true });
const done = await client.images.wait(job.generation_id); // status "done" o "failed"
console.log(done.output_url);
```

Risultato di `generate` (normale): `{ url, generation_id, _meta: { credits_remaining, charges } }`.
Risultato di `wait`: `{ status: "done", generation_id, output_url, error: null }`.

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

const done = await client.videos.wait(task.video_id); // succeeded / failed
console.log(done.video_url);
```

`generate()` torna appena il video è stato inviato al motore, con un `video_id`;
`wait()` lo segue fino alla fine. Non passare `async_generation`: in quel caso
l'API restituisce un `generation_id` che `videos.wait()` non segue.

## 4. Still-life video

```js
const task = await client.stilllife.start("https://example.com/product.jpg", "https://example.com/background.jpg", {
  custom_prompt: "rotating pedestal, luxury feel",
  detail_image_url: "https://example.com/detail.jpg", // opzionale
  duration_seconds: 5
});

const done = await client.stilllife.wait(task.task_id); // status "done" o "failed"
console.log(done.processed_video_url);

// Cambio sfondo (solo JWT portale):
await client.stilllife.changeBackground(task.task_id, { background_url: "https://example.com/bg2.jpg" });
```

## 5. Video lungo

Pipeline multi-segmento. Puoi avviarla da una semplice immagine + prompt, oppure
da uno storyboard di Studio Hero (vedi §6: `startFromStoryboard`).

```js
const job = await client.longvideo.start("https://example.com/product.jpg", {
  custom_prompt: "30s ad, three beats: reveal, detail, logo",
  duration_seconds: 30, // 30, 45 o 60
  ratio: "16:9",
  resolution: "1080p",
  // Facoltativo (solo JWT portale): montaggio automatico dopo l'export.
  montage: {
    brief: "Sconto 20% fino a domenica",
    language_code: "it",
    logo_url: "https://cdn/.../logo.png",
    logo_mode: "in_video"
  }
});

// Attende che tutti i segmenti siano pronti (status "segments_ready").
const ready = await client.longvideo.wait(job.job_id);
for (const seg of ready.segments) console.log(seg.index, seg.video_url);

// Rifare un segmento (cascade: true rigenera anche i successivi):
await client.longvideo.regenerateSegment(job.job_id, 1, { comment: "più lento", cascade: true });

// Montaggio finale (solo JWT portale): unisce i segmenti in final_video_url.
// Se è stato chiesto il montaggio automatico, render() aspetta anche quello.
const final = await client.longvideo.render(job.job_id); // = wait + export + attesa
const videoUrl = final.captioned_final_video_url || final.final_video_url;
await client.download(videoUrl, "out/spot.mp4");          // accetta anche URL assoluti
```

Come nel portale, quando i segmenti sono pronti il job si ferma in
`segments_ready`: puoi rivederli o rifarli, poi `export()` (o `render()`) crea il
video unico. L'export non costa nulla. Con una **API key** l'export non è
disponibile: usi i singoli `segments[].video_url`. I video con doppiaggio
arrivano già a `done` con `final_video_url`.

**Montaggio automatico** (grafiche, sottotitoli karaoke, logo, cartello finale):

- all'avvio: `montage: {...}` (campi `brief`, `language_code`, `logo_url`,
  `logo_mode` = `"in_video"` | `"end_only"` | `"off"`, `inserts` =
  `[{ url, label }]`, immagini mostrate solo nel montaggio);
- dopo la generazione: `client.longvideo.montage(jobId, { brief, logo_mode })`.
  Risponde 202 (parte subito, status `captioning`) oppure con `needs_export: true`
  se il video non è ancora esportato (parte al prossimo `export()`); poi
  `render(jobId)`.

Lo status passa `done` → `captioning` → `done`. I campi da guardare:
`montage_requested`, `montage_pending`, `montage_progress`, `montage_done`,
`montage_report`. Il video montato è **`captioned_final_video_url`**;
`final_video_url` resta il taglio senza montaggio. Se il montaggio fallisce,
`render()` ritorna con `montage_done: false` e `montage_report.error` (il video
originale resta disponibile). `await client.longvideo.montageAvailable()` dice se
il server può fare il montaggio; `client.longvideo.montageSettled(job)` se il
montaggio è finito (o non era chiesto).

**Esempio di risultato (`final`, con montaggio):**
```json
{
  "job_id": 812,
  "status": "done",
  "segments": [
    { "index": 1, "status": "done", "video_url": "https://cdn/.../seg1.mp4" },
    { "index": 2, "status": "done", "video_url": "https://cdn/.../seg2.mp4" }
  ],
  "final_video_url": "https://app.heroshots.ai/image/proxy/long_video/812/final.mp4",
  "captioned_final_video_url": "https://app.heroshots.ai/image/proxy/long_video/812/montage/final.mp4",
  "montage_requested": true,
  "montage_pending": false,
  "montage_done": true,
  "montage_report": { "kind": "full" }
}
```

`client.download(url, dest)` accetta un URL assoluto: il token viene inviato
solo se l'URL è dell'host dell'API (`baseUrl`), mai a un CDN esterno.

## 6. Studio Hero — tutte le fasi (solo JWT portale)

Il flusso del web app, passo per passo: brief → concept → (consigliato) →
storyboard → reference frame 4K → (board) → (revisione) → voci → render con voce
e montaggio automatico → download.

```js
const client = await Client.fromLogin("dev@partner.com", "secret");

// --- Fase 0: referenze (path locali → URL ospitati) ---
const product = (await client.uploads.image("product.jpg", "products")).public_url;
const subject = (await client.uploads.image("model.jpg", "subjects")).public_url;

// Campi che il portale manda a ogni chiamata storyboard (vedi tabella sotto).
// Le immagini possono stare qui: gli argomenti posizionali restano null.
const common = {
  product_image_url: product,
  subject_image_url: subject,
  duration_seconds: 30,             // 30, 45 o 60 per il video lungo
  ratio: "9:16",
  resolution: "1080p",
  language_code: "it",
  video_type: "ugc",                // ugc | cinema | spot_tv | sas_software
  ugc_style: "top_creator",         // amateur | top_creator
  look_mode: "current",             // tiene l'outfit del soggetto
  storyboard_reference_frames_required: true,
  storyboard_board_required: false
};

// --- Fase 1: brief suggeriti + quello consigliato ---
const briefs = await client.storyboard.briefSuggestions(null, null, common); // [{title, brief, pros, cons}]
let rec = await client.storyboard.recommend("brief", briefs, null, null, common);
const brief = briefs[rec.recommended_index].brief;

// --- Fase 2: concept candidati + quello consigliato ---
const concepts = await client.storyboard.candidates(brief, 30, null, null, common);
rec = await client.storyboard.recommend("concept", concepts, null, null, {
  ...common,
  custom_prompt: brief,
  chosen_brief: brief
});
const selected = concepts[rec.recommended_index];

// --- Fase 3: storyboard completo (async, frame differiti) ---
const job = await client.storyboard.generate(brief, 30, selected, null, null, common);
let storyboard = (await client.storyboard.wait(job.job_id)).storyboard;

// --- Fase 4: reference frame 4K (async, con progresso) ---
if (storyboard.reference_frames_deferred) {
  const fjob = await client.storyboard.frames(storyboard, null, null, common);
  const frames = await client.storyboard.wait(fjob.job_id, {
    timeout: 900,
    onProgress: (d) => console.log("  frame pronti:", Object.keys(d.frames_partial || {}).length)
  });
  storyboard = client.storyboard.merge(storyboard, frames);
}

// --- Fase 4b (se il server usa la board): immagine storyboard board ---
// const bjob = await client.storyboard.board(storyboard, null, null, common);
// storyboard = client.storyboard.merge(storyboard, await client.storyboard.wait(bjob.job_id, { timeout: 900 }));

// --- Fase 5 (opzionale): revisione — la risposta È lo storyboard rivisto ---
// const { duration_seconds, ...revFields } = common;
// storyboard = await client.storyboard.revise("Rendi il segmento 2 più lento", brief, 30, storyboard,
//   { ...revFields, selected_candidate: selected });
// (dopo una revisione rifai la Fase 4 per i nuovi frame)

// --- Fase 6: voci, una per ruolo che parla ---
const { voices } = await client.audio.voices();              // [{voice_id, name, category, labels, ...}]
const roles = client.storyboard.voiceRoles(storyboard);      // [{key: "subject_1", label, role_type, text, ...}]
const voiceIds = Object.fromEntries(roles.map((role) => [role.key, voices[0].voice_id])); // scegli tu la voce

// --- Fase 7: render come il portale (voce + montaggio automatico) ---
const vjob = await client.longvideo.startFromStoryboard(storyboard, {
  product_image_url: product,
  subject_image_url: subject,
  // oppure un avatar: avatar_id: 12, avatar_view_type: "mezzo_busto"  (vista reale, non "avatar")
  voice_id: voiceIds,               // o una sola voce per tutti i ruoli: voice_id: "..."
  language_code: "it",
  montage: true,                    // brief, lingua e logo come nel portale
  brief,
  ratio: "9:16",
  resolution: "1080p"
  // brand_logo_url: "https://cdn/.../logo.png", brand_logo_mode: "in_video",
});
const final = await client.longvideo.render(vjob.job_id);   // segmenti → export → montaggio

// --- Fase 8: download del video montato ---
const url = final.captioned_final_video_url || final.final_video_url;
await client.download(url, "out/spot.mp4");
```

Le opzioni di `startFromStoryboard` accettano snake_case o camelCase
(`voice_id` / `voiceId`, `avatar_view_type` / `avatarViewType`...).

**Cosa manda `startFromStoryboard`** (lo stesso body del portale):

| Campo | Da dove |
|---|---|
| `product_image_url`, `subject_image_url`, `additional_product_image_urls` | input |
| `avatar_id` + `avatar_view_type` (+ `avatar_image_set`) | input; la vista deve esistere (`fullbody`, `mezzo_busto`, `closeup`, `profile_left`...); `"avatar"` viene rifiutato |
| `product_box_closed_url` / `product_box_open_url`, `extra_products` (`[{image_url, box_closed_url?, box_open_url?}]`) | input (scatola del prodotto, altri prodotti) |
| `brand_logo_url` + `brand_logo_mode` (`in_video` \| `end_only` \| `off`) | input |
| `custom_prompt` | `storyboard.optimized_prompt` (non il brief) |
| `duration` e `duration_seconds` | `storyboard.duration_seconds` |
| `studiohero_segment_prompts` | `visual_prompt` (o `seedance_prompt`) di ogni segmento |
| `studiohero_segment_reference_image_urls` | per segmento: `script_sequence.reference_frames[].image_url` + `control_frame.image_url` (omesso se non ci sono frame) |
| `reference_image_urls` | board, prodotto, viste extra, soggetto (senza doppioni) |
| `voiceover_cast`, `tts_voice_id`, `language_code` | `storyboard.voiceCast(storyboard, voiceId)`; `tts_voice_id` = voce del primo ruolo |
| `montage` | `montage: true` → `{brief, language_code, logo_url, logo_mode}`; senza montaggio e con logo `end_only` → `{kind: "outro", ...}` (solo la chiusura animata del logo) |

Le chiavi extra (`captions: true`, `reference_video_url: ...`) vengono inoltrate
così come sono e vincono su tutto. `longvideo.start(imageUrl, { storyboard })`
resta disponibile e manda solo la parte storyboard (`custom_prompt`, prompt e
frame per segmento, durata). Le funzioni pure dietro a tutto questo sono
esportate come `studiohero` (`require("heroshots").studiohero`).

**Campi delle chiamate storyboard** (in `common`): `video_type` (`ugc` |
`cinema` | `spot_tv` | `sas_software`), `ugc_style` (`amateur` | `top_creator`),
`look_mode` (`current`, oppure `custom` con `look_description`),
`storyboard_reference_frames_required` / `storyboard_board_required`, più gli
stessi input del render (`avatar_id` + `avatar_view_type`, `brand_logo_url` /
`brand_logo_mode`, `product_box_closed_url` / `product_box_open_url`,
`extra_products`, `background_image_url`, `body_posture_image_url`).

**Esempio di risultato per fase:**

Fase 1 — `briefSuggestions` →
```json
[{ "title": "Drop urbano", "brief": "Spot dinamico urban per il lancio sneaker...", "pros": ["..."], "cons": ["..."] },
 { "title": "Luxury slow", "brief": "Mood luxury slow-motion con focus sul materiale...", "pros": [], "cons": [] }]
```

Fase 1/2 — `recommend` →
```json
{ "recommended_index": 0, "reason": "Il prodotto si vede meglio con un taglio dinamico." }
```

Fase 2 — `candidates` (un elemento) →
```json
{
  "id": "concept-1",
  "title": "Urban Drop",
  "logline": "energia di strada, taglio rapido",
  "visual_direction": "camera a mano, luce naturale",
  "clip_plan": ["reveal", "dettaglio", "logo + claim"],
  "voice_roles": ["Soggetto"]
}
```

Fase 3 — `(await wait(job.job_id)).storyboard` →
```json
{
  "duration_seconds": 30,
  "optimized_prompt": "...",
  "segments": [
    { "index": 1, "visual_prompt": "...", "voiceover_text": "...",
      "script_sequence": { "voice_cast": [{ "role_id": "subject_1", "label_it": "Soggetto", "spoken_it": "..." }],
                           "reference_frames": [{ "role": "start", "image_url": null }] } }
  ],
  "reference_frames_deferred": true,
  "storyboard_board_image_url": null
}
```

Fase 4 — `wait(fjob.job_id)` (i frame arrivano sotto `frames`) →
```json
{
  "job_id": "fr_88a1", "status": "done",
  "frames": { "segments": [
    { "index": 1, "script_sequence": { "reference_frames": [{ "role": "start", "image_url": "https://cdn/.../seg1_start.png" }] } }
  ], "reference_image_urls": ["https://cdn/.../seg1_start.png"] }
}
```

Fase 6 — `audio.voices()` →
```json
{ "configured": true,
  "voices": [{ "voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Giulia", "category": "premade",
               "labels": { "accent": "italian" }, "description": "", "preview_url": "https://..." }] }
```

Fase 7 — `final` → vedi [§5](#5-video-lungo) (`captioned_final_video_url`).

> Vedi `examples/full_storyboard_flow.js` per lo script completo eseguibile.

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
// slot: hat, top, belt, pants, shoes, accessories (max 6); image_url, link_url o description.
await client.avatars.changeOutfit(123, [
  { slot: "top", image_url: shop.image_urls[0], title: shop.title },
  { slot: "shoes", link_url: "https://shop.example.com/sneakers" },
  { slot: "hat", description: "berretto di lana nero" }
]);
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
  console.log(g.id, g.download_url);
}

// Download del file (stessa filigrana e risoluzione della generazione).
// L'id è quello dello storico (g.id), non il generation_id.
await client.images.download(page.generations[0].id, "out/foto.jpg");
await client.videos.download(videoLogId, "out/spot.mp4");

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

## 10. Agenzie: brand gestiti

```js
const client = new Client({ apiKey: "lz_live_AGENCY_KEY" });
const { clients } = await client.agency.clients();
const rel = await client.agency.inviteClient("brand@example.com");
await client.agency.topup(rel.id, 50); // EUR dal wallet agenzia

// Generare come il brand: vedi §0.1 (managedUserId).
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
