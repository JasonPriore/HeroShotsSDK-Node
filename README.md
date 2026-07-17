# heroshots (Node.js SDK)

High-level Node.js client for the HeroShots / StudioHero platform, authenticated
with a **portal JWT or API key**. Covers the same JWT/API-key reachable API
surface as the Python and PHP SDKs.

## Install

```bash
npm install heroshots
```

Requires Node.js 18+. No runtime dependencies.

## Authenticate

```js
const { Client } = require("heroshots");

// Email/password login: stores the JWT, auto re-logins on expiry.
// Base URL defaults to https://app.heroshots.ai.
const client = await Client.fromLogin("dev@partner.com", "secret");

// Or reuse an existing token.
const tokenClient = new Client({ token: "eyJ..." });
```

## Agency act-as

Agency API keys can operate as a managed brand by passing the `managedUserId`
returned by the managed-client provisioning API. The SDK adds
`X-Managed-User-Id` to authenticated requests.

```js
const { Client } = require("heroshots");

const client = new Client({
  token: "lz_live_YOUR_AGENCY_KEY",
  managedUserId: 12345
});
const job = await client.images.generate("https://example.com/product.jpg");

// Switch target brand later, or pass null to clear it.
client.withManagedUser(67890);
```

## Usage

```js
// Local file paths are auto-uploaded to hosted URLs.
const briefs = await client.storyboard.briefSuggestions(
  "product.jpg",
  "model.jpg",
  { duration_seconds: 30, language_code: "it" }
);

const candidates = await client.storyboard.candidates(
  briefs[0],
  30,
  "product.jpg",
  "model.jpg"
);

const job = await client.storyboard.generate(
  briefs[0],
  30,
  candidates[0],
  "product.jpg",
  "model.jpg"
);
const sb = await client.storyboard.wait(job.job_id);

const vjob = await client.longvideo.start("product.jpg", {
  storyboard: sb.storyboard
});
const final = await client.longvideo.wait(vjob.job_id);
console.log(final.final_video_url);
```

`/api/v1` response metadata is surfaced under `result._meta`.

## Guide

For step-by-step examples organized by use case, read the full guide:
[GUIDE.md](https://github.com/JasonPriore/HeroShotsSDK-Node/blob/main/GUIDE.md).

## Resources

`uploads` · `images` · `videos` · `longvideo` · `stilllife` · `storyboard` ·
`avatars`

Plus on the client: `login()`, `me()`, `balance()`, `stats()`.

Extra backend fields go in the trailing payload object and are forwarded
verbatim.

## Errors

```js
const { ValidationError } = require("heroshots");

try {
  await client.storyboard.candidates("", 30, "p.jpg");
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.code, err.message, err.details);
  }
}
```

All structured errors extend `ApiError` and expose `code`, `status` and
`details`.

## Test

```bash
npm test
```

## Billing

Generations cost credits. Check remaining credits with `client.balance()`
(`hs_credits` + `wallet_balance`). Use `client.stats()` for the full raw
`/api/auth/stats` payload, including recent generations and offered plans. See
`examples/full_storyboard_flow.js`.
