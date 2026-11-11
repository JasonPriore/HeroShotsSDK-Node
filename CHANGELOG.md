# Changelog

## 0.3.1

### Fixed
- Long video: `wait()` now returns when the clips are ready (`segments_ready`).
  Like the web app, a job pauses there until the clips are exported, so 0.3.0
  waited until the timeout. Each `segments[].video_url` is set at that point.
- `login()` / `fromLogin()` reject a non-string email or password locally
  (`ValidationError`) instead of sending it to the server.
- An expired portal login reported as `invalid_or_expired_token` now triggers
  the automatic re-login (it maps to the token-expired error).
- Guides: image results (`url` / `output_url`), video id (`video_id`), still-life
  result (`processed_video_url`), `aspect_ratio` values, outfit items and the
  id to pass to `download()` now match the API.

### Added
- `HeroShotsClient.fromLogin({ email, password, ...options })` object form.
- Long video `export()` (joins the clips into `final_video_url`, not billed) and
  `render()` (wait + export + wait for the final video). Portal login only.

## 0.3.0

Aligns the Node SDK 1:1 with the Python SDK and covers the whole public
`/api/v1` surface.

### Breaking changes

- `longvideo.start()` / `longvideo.status()` now call `/api/v1/long-video/start`
  and `/api/v1/long-video/status/{id}`, and `stilllife.start()` /
  `stilllife.status()` call `/api/v1/stilllife-video/start` and
  `/api/v1/stilllife-video/status/{id}`. The old
  `/api/auth/long-video/start|status` and `/api/auth/stilllife-video/start|status`
  routes were removed from the backend on 2026-07-16. Responses now come in the
  `/api/v1` envelope and are unwrapped (`_meta` holds billing metadata).
  `longvideo.view()` and the still-life background edits stay on `/api/auth`.
- `videos.status()` now calls `GET /api/v1/video/status/{id}` (was
  `/video/status/{id}`) and accepts `{ provider }`.
- Downloads return bytes: `images.download()` resolves to a `Buffer` (it used to
  parse the response as JSON), or writes the file when a destination path is
  passed and resolves to that path.
- HTTP 429 is now retried automatically (`maxRetries`, default 2). Pass
  `maxRetries: 0` to get the previous behaviour.
- Optional `null` values in `longvideo.start()` options are dropped instead of
  being sent.

### Added

- API key authentication: `apiKey` option (alias of `token`), read from
  `HEROSHOTS_API_KEY` when not given; `client.usesApiKey` getter.
- `client.me()` uses `/api/v1/me` with an API key (`/api/auth/me` with a portal
  JWT). `client.balance()` with an API key reads `/api/v1/me` and returns
  `{hs_credits, currency_credit, wallet_balance, billing_type}`.
- Automatic retry on HTTP 429 honouring `Retry-After` (capped at 60 s, otherwise
  1 s, 2 s, 4 s ... capped at 30 s). Multipart bodies are never retried.
  `RateLimitError.retryAfter` holds the server hint in seconds.
- `User-Agent: heroshots-node/<version>` and `Accept: application/json` headers.
- `client.request(..., { raw: true })` returns a `Buffer`;
  `client.download(path, dest?, { params })`.
- `BillingError` for `no_payment_method` and `wallet_vat_validation_required`;
  `plan_change_locked` now maps to `ConflictError`.
- New resources: `account`, `generations` (with an async `iterate()`),
  `pricing`, `bulk`, `assets`, `collections`, `backgrounds`, `categories`,
  `legal`, `agency`, `brand`.
- `avatars`: `consentDocument`, `createFromSteps`, `improvePrompt`,
  `analyzeAttributes`, `update`, `delete`, `uploadView`, `regenerateView`,
  `regenerateVariants`, `generatedVersion`, `setImageSet`, `generateSheet`,
  `generateVoice`, `resolveOutfitLink`, `changeOutfit`, `restoreOutfit`;
  `VIEW_TYPES` export. `generate()` also accepts `(name, payload)`.
- `images`: `generateBackground`, `usageRightsQuote` (GET for a single
  type/duration, POST for a list), `usageRightsUpgrade`, `analyzeEditRegion`;
  `generate()` / `candidates()` also resolve `background_image_url`,
  `body_posture_image_url`, `hairstyle_reference_image_url`,
  `text_detail_image_url`, `worn_scale_reference_url` and
  `additional_product_image_urls`.
- `videos.download()`; `videos.generate()` also resolves `product_image_url` /
  `subject_image_url` and accepts the payload as the only argument.
- `longvideo.regenerateSegment(jobId, segmentIndex, { comment, cascade })` and
  the `duration_seconds` / `durationSeconds` option on `longvideo.start()`.
- `stilllife.start()` options `detail_image_url` and `reference_video_url`.
- `uploads.consentDocument()` and `uploads.referenceAudio()`.

### Changed

- Local file paths are uploaded automatically only with a portal JWT: with an
  API key the SDK throws a `HeroShotsError` asking for a public `https://` URL.
  `data:` URIs pass through unchanged.
- Resources keep the client in `resource._client` (`resource.client` still works
  as a getter).
