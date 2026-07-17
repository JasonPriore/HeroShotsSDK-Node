# HeroShots SDK - Node.js Guide

Guida operativa all'SDK Node.js (`heroshots`), organizzata per caso d'uso.

| Caso d'uso | Risorsa |
|---|---|
| Foto prodotto, anche still-life | `client.images` |
| Video corto | `client.videos` |
| Video lungo multi-segmento | `client.longvideo` |
| Still-life video | `client.stilllife` |
| Studio Hero storyboard | `client.storyboard` + `client.longvideo` |
| Avatar | `client.avatars` |
| Balance compatto | `client.balance()` |
| Stats account complete | `client.stats()` |
| Upload file -> URL ospitato | `client.uploads` |

## 0. Setup

```js
const { Client } = require("heroshots");

const client = await Client.fromLogin("dev@partner.com", "secret");
```

Tre concetti validi per tutto l'SDK:

1. I path locali delle immagini vengono caricati automaticamente.
2. Le generazioni asincrone ritornano un id; usa `wait(...)`.
3. Ogni generazione consuma crediti: controlla con `client.balance()`.

## 0.1 Agenzie: selezionare il brand/utente gestito

Se usi una API key agenzia, prima scegli il brand/utente gestito su cui vuoi
operare. Il valore è il `managed_user_id` restituito dalla creazione/lista dei
managed client. Dopo averlo impostato, usi gli stessi metodi di generazione delle
sezioni successive: l'SDK aggiunge `X-Managed-User-Id` alle richieste autenticate.

```js
const { Client } = require("heroshots");

const client = new Client({
  token: "lz_live_YOUR_AGENCY_KEY",
  managedUserId: 12345 // brand/utente gestito selezionato
});

// Da qui in poi le generazioni vengono eseguite come quel brand.
const gen = await client.images.generate("product.jpg", {
  still_life: true,
  ratio: "1:1"
});

// Per passare a un altro brand gestito senza ricreare il client:
client.withManagedUser(67890);
const task = await client.videos.generate("product.jpg", {
  custom_prompt: "slow dolly-in"
});

// Per tornare a chiamate senza act-as:
client.withManagedUser(null);
```

La key agenzia deve avere `agency:act_as` e gli scope richiesti dalla route di
generazione. Lo stato della relazione e gli scope vengono validati dall'API.

## 1. Balance

```js
const bal = await client.balance();

console.log("HS credits:", bal.hs_credits);
console.log("Wallet:", bal.wallet_balance, "EUR");

// Risposta completa dell'endpoint, con recent_generations, piani e flag.
const stats = await client.stats();
```

Esempio:

```json
{
  "hs_credits": 1240,
  "wallet_balance": 48.5,
  "total_credits_used": 360,
  "plan": { "wallet_balance": 48.5, "template_id": "scale", "output_resolution": "4K" }
}
```

## 2. Foto

```js
const gen = await client.images.generate("product.jpg", "model.jpg", {
  ratio: "4:5"
});

const done = await client.images.wait(gen.generation_id);
console.log(done.images[0].url);
```

Still-life:

```js
const gen = await client.images.generate("product.jpg", {
  still_life: true,
  ratio: "1:1"
});
```

## 3. Video corto

```js
const task = await client.videos.generate("product.jpg", {
  custom_prompt: "slow dolly-in, soft studio light",
  ratio: "16:9",
  resolution: "1080p"
});

const done = await client.videos.wait(task.task_id);
console.log(done.video_url);
```

## 4. Still-life video

```js
const task = await client.stilllife.start("product.jpg", "background.jpg", {
  custom_prompt: "rotating pedestal, luxury feel",
  duration_seconds: 5
});

const done = await client.stilllife.wait(task.task_id);
console.log(done.video_url);
```

## 5. Video lungo

```js
const job = await client.longvideo.start("product.jpg", {
  custom_prompt: "15s ad, three beats: reveal, detail, logo",
  ratio: "16:9",
  resolution: "1080p",
  duration_seconds: 15
});

const final = await client.longvideo.wait(job.job_id);
console.log(final.final_video_url);
```

## 6. Studio Hero

```js
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
const avatars = await client.avatars.list();
console.log(avatars.avatars);

const avatar = await client.avatars.get(123);
```

## Errori

```js
const { ValidationError, TokenExpiredError, RateLimitError } = require("heroshots");

try {
  await client.storyboard.candidates("", 30, "p.jpg");
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.code, err.message, err.details);
  }
}
```
