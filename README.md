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
| Storyboard (StudioHero), voices, uploads, image candidates, long-video export (final cut) and auto-edit, still-life background edits, BYO legal documents | ❌ | ✅ |

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

## StudioHero: the portal flow (portal JWT)

```js
const client = await Client.fromLogin("dev@partner.com", "secret");
const product = (await client.uploads.image("product.jpg", "products")).public_url;
const subject = (await client.uploads.image("model.jpg", "subjects")).public_url;
const common = {
  product_image_url: product, subject_image_url: subject, duration_seconds: 30,
  ratio: "9:16", language_code: "it", video_type: "ugc", ugc_style: "top_creator",
  look_mode: "current"
};

const briefs = await client.storyboard.briefSuggestions(null, null, common);  // [{title, brief, ...}]
const best = await client.storyboard.recommend("brief", briefs, null, null, common);
const brief = briefs[best.recommended_index].brief;

const concepts = await client.storyboard.candidates(brief, 30, null, null, common);
const pick = (await client.storyboard.recommend("concept", concepts, null, null,
  { ...common, custom_prompt: brief, chosen_brief: brief })).recommended_index;

const job = await client.storyboard.generate(brief, 30, concepts[pick], null, null, common);
let sb = (await client.storyboard.wait(job.job_id)).storyboard;
if (sb.reference_frames_deferred) {                                        // 4K reference frames
  const fjob = await client.storyboard.frames(sb, null, null, common);
  sb = client.storyboard.merge(sb, await client.storyboard.wait(fjob.job_id, { timeout: 900 }));
}

const { voices } = await client.audio.voices();                            // [{voice_id, name, ...}]
const voiceIds = Object.fromEntries(client.storyboard.voiceRoles(sb).map((r) => [r.key, voices[0].voice_id]));

const vjob = await client.longvideo.startFromStoryboard(sb, {
  product_image_url: product, subject_image_url: subject,
  voice_id: voiceIds, language_code: "it", montage: true, brief, ratio: "9:16"
});
const final = await client.longvideo.render(vjob.job_id);                  // clips -> export -> auto-edit
await client.download(final.captioned_final_video_url || final.final_video_url, "out/spot.mp4");
```

`startFromStoryboard` sends what the portal sends: the inputs (avatar with a
real `avatar_view_type` such as `fullbody` / `mezzo_busto` / `closeup`, extra
product views, `product_box_closed_url` / `product_box_open_url`,
`extra_products`, `brand_logo_url` + `brand_logo_mode`), `custom_prompt` = the
storyboard's `optimized_prompt`, the per-segment prompts and reference frames,
`reference_image_urls`, `voiceover_cast` + `tts_voice_id` + `language_code` and
`montage`. The auto-edited video is `captioned_final_video_url`;
`final_video_url` stays the plain cut. Storyboard request fields:
`video_type` (`ugc` | `cinema` | `spot_tv` | `sas_software`), `ugc_style`
(`amateur` | `top_creator`), `look_mode` (`current`), `language_code`,
`storyboard_reference_frames_required`, `storyboard_board_required`. The pure
helpers behind it are exported as `studiohero` (`storyboardStartFields`,
`voiceRoles`, `voiceCast`, ...).

## Resources

| Namespace | What it does |
|---|---|
| `client.account` | `me()`, `health()` |
| `client.images` | `generate`, `status`, `wait`, `download`, `generateBackground`, `usageRightsQuote`, `usageRightsUpgrade`, `analyzeEditRegion`, `candidates`, `selectCandidate` |
| `client.videos` | `generate`, `status`, `wait`, `download` |
| `client.longvideo` | `start`, `startFromStoryboard` (the portal's render), `status`, `wait` (until `segments_ready`), `regenerateSegment`, `export`, `render` (final cut + auto-edit, portal JWT), `montage`, `montageAvailable`, `montageSettled`, `view` |
| `client.stilllife` | `start`, `status`, `wait`, `previewBackground`, `changeBackground`, `changeBackgroundStatus` |
| `client.storyboard` | `briefSuggestions`, `candidates`, `recommend`, `generate`, `frames`, `board`, `revise`, `status`, `wait`, `merge`, `segmentPrompts`, `segmentReferenceImageUrls`, `voiceRoles`, `voiceCast`, `missingVoiceRoles`, `subjectMeasurements`, `analyzeProduct`, `creativity` |
| `client.audio` | `voices` (voice ids for the voiceover, portal JWT) |
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
await client.download(job.final_video_url, "out/final.mp4");            // absolute URLs work too
```

The token is sent only when the URL points at the API host (`baseUrl`), never
to a third-party CDN.

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
