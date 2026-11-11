# heroshots (Node.js SDK)

Node.js client for the HeroShots / StudioHero API. Works with a **B2B API key**
(`lz_live_...`) or a **portal login (JWT)** and covers the whole public
`/api/v1` surface plus the StudioHero storyboard flow. Aligned 1:1 with the Python SDK.

## Install

```bash
npm install heroshots
```

Requires Node.js 18+. No runtime dependencies (uses the global `fetch`,
`FormData` and `Blob`).

## Authenticate

```js
const { Client } = require("heroshots");

// API key (server-to-server). Also read from HEROSHOTS_API_KEY.
const client = new Client({ apiKey: "lz_live_..." });

// Portal login: stores the JWT and logs in again automatically when it expires.
const portal = await Client.fromLogin("dev@partner.com", "secret");

// Or reuse an existing token (JWT or API key).
const tokenClient = new Client({ token: "eyJ..." });
```

Base URL defaults to `https://app.heroshots.ai` (override with `baseUrl` or
`HEROSHOTS_BASE_URL`). `client.usesApiKey` tells you which credential is in use.

| Endpoints | API key | Portal JWT |
|---|---|---|
| `/api/v1/*`: images, videos, long video, still life, avatars, bulk, library, generations, pricing, agency, brand | ✅ | ✅ |
| Storyboard (StudioHero), uploads, image candidates, long-video export (final cut), still-life background edits, BYO legal documents | ❌ | ✅ |

- API keys are **refused on the Free plan** (`ForbiddenError`, code
  `plan_not_allowed`), except for agency accounts.
- **Local file paths** are uploaded automatically only with a portal JWT. With
  an API key pass public `https://` URLs (or `data:` URIs): the SDK throws a
  clear `HeroShotsError` otherwise, before sending anything.

## Quick start

```js
const client = new Client({ apiKey: "lz_live_..." });

console.log(await client.balance()); // { hs_credits: 10, currency_credit: 50, wallet_balance: 50, billing_type: "debit" }
console.log(await client.pricing.quote("video", { duration_seconds: 15 }));

const job = await client.videos.generate({
  product_image_url: "https://example.com/product.jpg",
  avatar_id: 42,
  custom_prompt: "slow dolly-in, soft studio light",
  duration_seconds: 15
});
const done = await client.videos.wait(job.video_id);
console.log(done.video_url);
```

`/api/v1` billing metadata (charges, credits left) is under `result._meta`.

## StudioHero storyboard (portal JWT)

```js
const client = await Client.fromLogin("dev@partner.com", "secret");

// Local file paths are auto-uploaded to hosted URLs (portal JWT only).
const briefs = await client.storyboard.briefSuggestions("product.jpg", "model.jpg", {
  duration_seconds: 30,
  language_code: "it"
});
const candidates = await client.storyboard.candidates(briefs[0], 30, "product.jpg", "model.jpg");
const job = await client.storyboard.generate(briefs[0], 30, candidates[0], "product.jpg", "model.jpg");
const sb = await client.storyboard.wait(job.job_id);

const vjob = await client.longvideo.start("product.jpg", { storyboard: sb.storyboard });
const final = await client.longvideo.render(vjob.job_id); // clips + final cut (portal JWT)
console.log(final.final_video_url);
```

## Resources

| Namespace | What it does |
|---|---|
| `client.account` | `me()`, `health()` |
| `client.images` | `generate`, `status`, `wait`, `download`, `generateBackground`, `usageRightsQuote`, `usageRightsUpgrade`, `analyzeEditRegion`, `candidates`, `selectCandidate` |
| `client.videos` | `generate`, `status`, `wait`, `download` |
| `client.longvideo` | `start`, `status`, `wait` (until `segments_ready`), `regenerateSegment`, `export`, `render` (final cut, portal JWT), `view` |
| `client.stilllife` | `start`, `status`, `wait`, `previewBackground`, `changeBackground`, `changeBackgroundStatus` |
| `client.storyboard` | `briefSuggestions`, `candidates`, `generate`, `frames`, `revise`, `status`, `wait`, `subjectMeasurements`, `analyzeProduct`, `creativity` |
| `client.avatars` | `list`, `get`, `generate`, `createFromSteps`, `update`, `delete`, `uploadView`, `regenerateView`, `regenerateVariants`, `generatedVersion`, `setImageSet`, `generateSheet`, `generateVoice`, `resolveOutfitLink`, `changeOutfit`, `restoreOutfit`, `improvePrompt`, `analyzeAttributes`, `consentDocument` |
| `client.bulk` | `list`, `create`, `get`, `update`, `delete`, `uploadImages`, `start`, `wait`, `regenerateItem`, `regenerateAll`, `cancelItem`, `removeItem`, `replaceProduct`, `previews`, `attempts`, `selectAttempt`, `downloadItem`, `downloadProduct`, `downloadGenerated` |
| `client.generations` | `list`, `iterate` (async generator over every page) |
| `client.pricing` | `catalog`, `quote`, `videoPackagesCatalog`, `videoPackagesQuote`, `usageRightsRules` |
| `client.assets` · `client.collections` · `client.backgrounds` · `client.categories` | product library (CRUD; multipart when you pass a file) |
| `client.uploads` | `image`, `consentDocument`, `referenceAudio` |
| `client.legal` | `byoStatus`, `manlevaTemplate`, `liberatoriaTemplate`, `uploadManleva`, `attachLiberatoria` |
| `client.agency` | managed brands: `clients`, `client`, `inviteClient`, `createClient`, `updateClient`, `topup`, `resendInvite`, `claimInvite`, `requestTermination`, `respondTermination`, `cancelTermination` |
| `client.brand` | the brand side of an agency relationship: `acceptManagerInvite`, `rejectManagerInvite`, `managerRelationship`, `managerRelationships`, termination |

On the client: `login()`, `me()`, `balance()`, `stats()`, `withManagedUser()`,
`download()`, `request()`, `usesApiKey`.

Every method maps 1:1 to an endpoint. Required values are positional; optional
ones go in an options object at the end (snake_case or camelCase keys, e.g.
`duration_seconds` / `durationSeconds`). Extra backend fields in that object are
forwarded verbatim; `null` / `undefined` values are dropped.

## Agency act-as

```js
const client = new Client({ apiKey: "lz_live_AGENCY_KEY", managedUserId: 12345 });
await client.images.generate("https://example.com/product.jpg", { avatar_id: 7 });
client.withManagedUser(67890); // switch brand; null clears it
```

The SDK adds `X-Managed-User-Id` to authenticated requests. The agency key needs
`agency:act_as` plus the scopes of the generation route.

## Downloads

Download methods resolve to a `Buffer`, or write the file (creating parent
directories) and resolve to its path when you pass a destination.

```js
const bytes = await client.images.download(logId);                     // Buffer
const file = await client.videos.download(logId, "out/spot.mp4");      // "out/spot.mp4"
const zip = await client.bulk.downloadGenerated(bulkId, "out/bulk.zip", { item_ids: [1, 2] });
```

## Errors

```js
const { BillingError, ForbiddenError, RateLimitError, ValidationError } = require("heroshots");

try {
  await client.videos.generate("https://example.com/p.jpg", { duration_seconds: 15 });
} catch (err) {
  if (err instanceof BillingError) {          // no payment method / billing details (VAT) missing
    console.log(err.code, err.message);
  } else if (err instanceof RateLimitError) { // already retried maxRetries times
    console.log("retry after", err.retryAfter);
  }
}
```

All structured errors extend `ApiError` and expose `code`, `status` and
`details`. HTTP 429 is retried automatically (`maxRetries: 2` by default,
honours `Retry-After` up to 60 s, otherwise waits 1 s, 2 s, 4 s ... up to 30 s).
Multipart uploads are never retried.

## Guide

Step-by-step examples by use case (Italian):
[GUIDE.md](https://github.com/JasonPriore/HeroShotsSDK-Node/blob/main/GUIDE.md).
Changes per version: [CHANGELOG.md](./CHANGELOG.md).

## Test

```bash
npm test          # offline, mocked fetch
```
