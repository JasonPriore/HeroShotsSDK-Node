"use strict";

// Public API (/api/v1) coverage: API-key auth, new resources, downloads, retries.
// Mirrors the Python SDK's tests/test_api_v1.py.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  BillingError,
  ConflictError,
  ForbiddenError,
  HeroShotsClient,
  HeroShotsError,
  PollTimeoutError,
  VIEW_TYPES
} = require("../src");

const BASE = "https://api.test";
const KEY = "lz_live_test";

function makeResponse(body, status = 200, headers = {}) {
  let bytes;
  if (Buffer.isBuffer(body)) {
    bytes = body;
  } else if (typeof body === "string") {
    bytes = Buffer.from(body);
  } else if (body === null || body === undefined) {
    bytes = Buffer.alloc(0);
  } else {
    bytes = Buffer.from(JSON.stringify(body));
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function ok(data, meta) {
  const body = { success: true, data };
  if (meta !== undefined) {
    body.meta = meta;
  }
  return body;
}

function makeFetch(responses) {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    if (!response) {
      throw new Error(`No mock response for ${url}`);
    }
    return response;
  };
  fetchMock.calls = calls;
  return fetchMock;
}

function apiClient(responses, options = {}) {
  const fetch = makeFetch(responses);
  const client = new HeroShotsClient({ baseUrl: BASE, apiKey: KEY, autoRelogin: false, fetch, ...options });
  client._sleep = async () => {};
  return { client, fetch };
}

function jwtClient(responses, options = {}) {
  return apiClient(responses, { apiKey: null, token: "jwt", ...options });
}

function jsonBody(call) {
  return JSON.parse(call.options.body);
}

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "hs-node-v1-"));
}

test("API key is sent as bearer with User-Agent", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ user: { id: 1 }, credits_remaining: { hs_credits: 3 } }))
  ]);
  assert.equal(client.usesApiKey, true);
  const out = await client.me();
  const call = fetch.calls.at(-1);
  assert.equal(call.url, `${BASE}/api/v1/me`);
  assert.equal(call.options.headers.Authorization, `Bearer ${KEY}`);
  assert.ok(call.options.headers["User-Agent"].startsWith("heroshots-node/"));
  assert.equal(out.user.id, 1);
});

test("API key is read from HEROSHOTS_API_KEY", () => {
  const previous = process.env.HEROSHOTS_API_KEY;
  process.env.HEROSHOTS_API_KEY = "lz_live_env";
  try {
    const client = new HeroShotsClient({ baseUrl: BASE, fetch: async () => null });
    assert.equal(client.token, "lz_live_env");
    assert.equal(client.usesApiKey, true);
  } finally {
    if (previous === undefined) {
      delete process.env.HEROSHOTS_API_KEY;
    } else {
      process.env.HEROSHOTS_API_KEY = previous;
    }
  }
});

test("explicit token wins over apiKey and a JWT is not an API key", () => {
  const client = new HeroShotsClient({ baseUrl: BASE, token: "eyJ.jwt", apiKey: KEY, fetch: async () => null });
  assert.equal(client.token, "eyJ.jwt");
  assert.equal(client.usesApiKey, false);
});

test("balance with API key reads /api/v1/me", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({
      user: { id: 1, currency_credit: 50.0, currency_billing_type: "debit" },
      credits_remaining: { hs_credits: 10, currency_credit: 50.0 }
    }))
  ]);
  const out = await client.balance();
  assert.deepEqual(out, { hs_credits: 10, currency_credit: 50.0, wallet_balance: 50.0, billing_type: "debit" });
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/me`);
});

test("balance with API key falls back to user.currency_credit", async () => {
  const { client } = apiClient([
    makeResponse(ok({ user: { currency_credit: 12.5 }, credits_remaining: { hs_credits: 1 } }))
  ]);
  assert.deepEqual(await client.balance(), { hs_credits: 1, currency_credit: 12.5, wallet_balance: 12.5 });
});

test("Free plan API key maps to ForbiddenError", async () => {
  const { client } = apiClient([
    makeResponse({
      success: false,
      error: { code: "plan_not_allowed", message: "API access is not available on the Free plan." }
    }, 403)
  ]);
  await assert.rejects(
    () => client.account.me(),
    (err) => err instanceof ForbiddenError && err.code === "plan_not_allowed"
  );
});

test("VAT validation maps to BillingError", async () => {
  const { client } = apiClient([
    makeResponse({ success: false, error: { code: "wallet_vat_validation_required", message: "VAT" } }, 402)
  ]);
  await assert.rejects(
    () => client.videos.generate("https://x/p.jpg", { duration_seconds: 15 }),
    BillingError
  );
});

test("no_payment_method is a BillingError and plan_change_locked a ConflictError", async () => {
  const { client } = apiClient([
    makeResponse({ success: false, error: { code: "no_payment_method", message: "card" } }, 402),
    makeResponse({ success: false, error: { code: "plan_change_locked", message: "locked" } }, 409)
  ]);
  await assert.rejects(() => client.pricing.catalog(), BillingError);
  await assert.rejects(() => client.pricing.catalog(), ConflictError);
});

test("429 is retried then succeeds", async () => {
  const { client, fetch } = apiClient([
    makeResponse(null, 429, { "Retry-After": "1" }),
    makeResponse(ok({ status: "ok" }))
  ]);
  const delays = [];
  client._sleep = async (seconds) => {
    delays.push(seconds);
  };
  const out = await client.account.health();
  assert.equal(out.status, "ok");
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(delays, [1]);
  assert.equal(fetch.calls.at(-1).options.headers.Authorization, undefined);
});

test("local path with an API key raises a clear error", async () => {
  const dir = await tmpDir();
  const img = path.join(dir, "p.png");
  await fs.writeFile(img, "x");
  const { client, fetch } = apiClient([]);
  await assert.rejects(
    () => client.images.generate(img),
    (err) => err instanceof HeroShotsError && /public https/.test(err.message)
  );
  assert.equal(fetch.calls.length, 0);
});

test("data: URIs pass through unchanged", async () => {
  const { client, fetch } = apiClient([makeResponse(ok({ generation_id: "g" }), 202)]);
  await client.images.generate("data:image/png;base64,AAAA");
  assert.equal(jsonBody(fetch.calls[0]).product_image_url, "data:image/png;base64,AAAA");
});

test("image download returns a Buffer and video download writes a file", async () => {
  const { client, fetch } = apiClient([
    makeResponse(Buffer.from([0xff, 0xd8, 0x6a, 0x70, 0x65, 0x67]), 200, { "Content-Type": "image/jpeg" }),
    makeResponse(Buffer.from("mp4data"), 200, { "Content-Type": "video/mp4" })
  ]);
  const bytes = await client.images.download(42);
  assert.ok(Buffer.isBuffer(bytes));
  assert.deepEqual(bytes, Buffer.from([0xff, 0xd8, 0x6a, 0x70, 0x65, 0x67]));
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/image/42/download`);
  assert.equal(fetch.calls[0].options.headers.Accept, undefined);

  const dir = await tmpDir();
  const saved = await client.videos.download(43, path.join(dir, "out", "v.mp4"));
  assert.equal(saved, path.join(dir, "out", "v.mp4"));
  assert.equal(await fs.readFile(saved, "utf8"), "mp4data");
  assert.equal(fetch.calls[1].url, `${BASE}/api/v1/video/43/download`);
});

test("download errors are still parsed as API errors", async () => {
  const { client } = apiClient([
    makeResponse({ success: false, error: { code: "not_found", message: "gone" } }, 404)
  ]);
  await assert.rejects(() => client.images.download(1), (err) => err.code === "not_found" && err.status === 404);
});

test("video status uses /api/v1 and the provider param", async () => {
  const { client, fetch } = apiClient([makeResponse(ok({ status: "processing" }))]);
  const out = await client.videos.status("t9", { provider: "byteplus" });
  assert.equal(out.status, "processing");
  assert.ok(fetch.calls.at(-1).url.endsWith("/api/v1/video/status/t9?provider=byteplus"));
});

test("videos.generate resolves product/subject image fields", async () => {
  const { client, fetch } = apiClient([makeResponse(ok({ video_id: 1 }), 202)]);
  await client.videos.generate({
    product_image_url: "https://x/p.jpg",
    subject_image_url: "https://x/s.jpg",
    avatar_id: 4
  });
  assert.deepEqual(jsonBody(fetch.calls[0]), {
    product_image_url: "https://x/p.jpg",
    subject_image_url: "https://x/s.jpg",
    avatar_id: 4
  });
});

test("long video start and regenerate segment", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ job_id: 5, status: "queued" }), 202),
    makeResponse(ok({ job_id: 5 }))
  ]);
  const job = await client.longvideo.start("https://x/p.jpg", { custom_prompt: "spot", duration_seconds: 30 });
  assert.equal(job.job_id, 5);
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/long-video/start`);
  assert.deepEqual(jsonBody(fetch.calls[0]), {
    ratio: "16:9",
    resolution: "1080p",
    image_url: "https://x/p.jpg",
    custom_prompt: "spot",
    duration_seconds: 30
  });
  await client.longvideo.regenerateSegment(5, 1, { comment: "slower", cascade: true });
  assert.equal(fetch.calls[1].url, `${BASE}/api/v1/long-video/5/segments/1/regenerate`);
  assert.deepEqual(jsonBody(fetch.calls[1]), { comment: "slower", cascade: true });
});

test("still-life start uses /api/v1", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ task_id: 8 }), 202),
    makeResponse(ok({ task_id: 9 }), 202)
  ]);
  const out = await client.stilllife.start("https://x/p.jpg", "https://x/bg.jpg", { custom_prompt: "slow orbit" });
  assert.equal(out.task_id, 8);
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/stilllife-video/start`);
  const body = jsonBody(fetch.calls[0]);
  assert.equal(body.custom_prompt, "slow orbit");
  assert.equal("detail_image_url" in body, false);
  assert.equal("reference_video_url" in body, false);

  await client.stilllife.start("https://x/p.jpg", "https://x/bg.jpg", {
    detailImageUrl: "https://x/d.jpg",
    reference_video_url: "https://x/r.mp4"
  });
  const second = jsonBody(fetch.calls[1]);
  assert.equal(second.detail_image_url, "https://x/d.jpg");
  assert.equal(second.reference_video_url, "https://x/r.mp4");
  assert.equal(second.duration_seconds, 5);
});

test("still-life status uses /api/v1", async () => {
  const { client, fetch } = apiClient([makeResponse(ok({ status: "succeeded", video_url: "https://cdn/s.mp4" }))]);
  const out = await client.stilllife.wait(8, { interval: 0, timeout: 5 });
  assert.equal(out.video_url, "https://cdn/s.mp4");
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/stilllife-video/status/8`);
});

test("generations iterate walks pages", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ generations: [{ id: 1 }], page: 1, pages: 2 })),
    makeResponse(ok({ generations: [{ id: 2 }], page: 2, pages: 2 }))
  ]);
  const ids = [];
  for await (const generation of client.generations.iterate({ type: "video", per_page: 1 })) {
    ids.push(generation.id);
  }
  assert.deepEqual(ids, [1, 2]);
  assert.ok(fetch.calls[0].url.includes("type=video"));
  assert.ok(fetch.calls[0].url.includes("per_page=1"));
  assert.ok(fetch.calls[1].url.includes("page=2"));
});

test("generations list maps camelCase filters", async () => {
  const { client, fetch } = apiClient([makeResponse(ok({ generations: [] }))]);
  await client.generations.list({ perPage: 10, dateFrom: "2026-01-01", collection_id: 3, type: null });
  const url = new URL(fetch.calls[0].url);
  assert.equal(url.searchParams.get("per_page"), "10");
  assert.equal(url.searchParams.get("date_from"), "2026-01-01");
  assert.equal(url.searchParams.get("collection_id"), "3");
  assert.equal(url.searchParams.has("type"), false);
  assert.equal(url.searchParams.has("perPage"), false);
});

test("pricing quote and catalog", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ total_eur: "15.00" })),
    makeResponse(ok({ video: {} })),
    makeResponse(ok({ tiers: [] })),
    makeResponse(ok({ total_eur: "99.00" })),
    makeResponse(ok({ rules: [] }))
  ]);
  assert.equal((await client.pricing.quote("video", { duration_seconds: 15 })).total_eur, "15.00");
  assert.deepEqual(jsonBody(fetch.calls[0]), { call_type: "video", duration_seconds: 15 });
  assert.ok("video" in (await client.pricing.catalog()));
  await client.pricing.videoPackagesCatalog();
  await client.pricing.videoPackagesQuote("growth", { usage_rights: [{ type: "organic" }] });
  assert.deepEqual(jsonBody(fetch.calls[3]), { tier: "growth", usage_rights: [{ type: "organic" }] });
  await client.pricing.usageRightsRules();
  assert.deepEqual(fetch.calls.map((call) => new URL(call.url).pathname), [
    "/api/v1/pricing/quote",
    "/api/v1/pricing/catalog",
    "/api/v1/pricing/video-packages/catalog",
    "/api/v1/pricing/video-packages/quote",
    "/api/v1/pricing/usage-rights/rules"
  ]);
});

test("usage rights quote GET and POST, and upgrade", async () => {
  const { client, fetch } = apiClient([
    makeResponse({ delta_eur: "3.00" }),
    makeResponse({ delta_eur: "5.00" }),
    makeResponse({ charged: true })
  ]);
  const a = await client.images.usageRightsQuote(7, null, {
    usage_rights_type: "paid_digital",
    usageRightsDuration: "6_months"
  });
  assert.equal(a.delta_eur, "3.00");
  assert.equal(fetch.calls[0].options.method, "GET");
  assert.ok(fetch.calls[0].url.includes("usage_rights_type=paid_digital"));
  assert.ok(fetch.calls[0].url.includes("usage_rights_duration=6_months"));

  const b = await client.images.usageRightsQuote(7, [{ type: "broadcast", duration: "2_years" }]);
  assert.equal(b.delta_eur, "5.00");
  assert.equal(fetch.calls[1].options.method, "POST");
  assert.deepEqual(jsonBody(fetch.calls[1]), { usage_rights: [{ type: "broadcast", duration: "2_years" }] });

  await client.images.usageRightsUpgrade(7, [{ type: "organic", duration: "perpetual" }]);
  assert.equal(fetch.calls[2].url, `${BASE}/api/v1/image/7/usage-rights/upgrade`);
});

test("image body resolves extra URL fields and background / edit-region endpoints", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ generation_id: "g" }), 202),
    makeResponse(ok({ image_url: "https://cdn/bg.png" })),
    makeResponse(ok({ edit_prompt: "make it red" }))
  ]);
  await client.images.generate("https://x/p.jpg", {
    background_image_url: "https://x/bg.jpg",
    additional_product_image_urls: ["https://x/a.jpg", "https://x/b.jpg"],
    avatar_id: 2
  });
  const body = jsonBody(fetch.calls[0]);
  assert.equal(body.background_image_url, "https://x/bg.jpg");
  assert.deepEqual(body.additional_product_image_urls, ["https://x/a.jpg", "https://x/b.jpg"]);
  assert.equal(body.subject_image_url, undefined);

  await client.images.generateBackground("marble studio", { aspectRatio: "1:1", size: "2K" });
  assert.equal(fetch.calls[1].url, `${BASE}/api/v1/background/generate`);
  assert.deepEqual(jsonBody(fetch.calls[1]), { prompt: "marble studio", aspect_ratio: "1:1", size: "2K" });

  await client.images.analyzeEditRegion("data:image/png;base64,AA", "make it red");
  assert.deepEqual(jsonBody(fetch.calls[2]), { crop_image: "data:image/png;base64,AA", feedback: "make it red" });
});

test("avatar edit endpoints", async () => {
  const { client, fetch } = apiClient([
    makeResponse({ success: true }),
    makeResponse(ok({ mode: "generated" })),
    makeResponse(ok({}), 202),
    makeResponse({ success: true }, 202)
  ]);
  await client.avatars.update(3, { name: "Giulia" });
  assert.equal(fetch.calls[0].options.method, "PATCH");
  assert.deepEqual(jsonBody(fetch.calls[0]), { name: "Giulia" });
  await client.avatars.setImageSet(3, "generated");
  assert.deepEqual(jsonBody(fetch.calls[1]), { mode: "generated" });
  await client.avatars.changeOutfit(3, [{ slot: "top", url: "https://x/t.jpg" }]);
  assert.deepEqual(jsonBody(fetch.calls[2]), { items: [{ slot: "top", url: "https://x/t.jpg" }] });
  await client.avatars.regenerateView(3, "closeup");
  assert.deepEqual(jsonBody(fetch.calls[3]), { view_type: "closeup" });
  assert.deepEqual(fetch.calls.map((call) => new URL(call.url).pathname), [
    "/api/v1/avatar/3",
    "/api/v1/avatar/3/image-set",
    "/api/v1/avatar/3/outfit",
    "/api/v1/avatar/3/regenerate-view"
  ]);
  assert.ok(VIEW_TYPES.includes("closeup"));
});

test("avatar create, generation helpers and consent document", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ id: 1 })),
    makeResponse(ok({ id: 2 })),
    makeResponse(ok({}), 202),
    makeResponse(ok({}), 202),
    makeResponse(Buffer.from("DOCX"))
  ]);
  await client.avatars.generate("Aria", { generate_with_ai: true, prompt: "donna 30 anni" });
  assert.deepEqual(jsonBody(fetch.calls[0]), { name: "Aria", generate_with_ai: true, prompt: "donna 30 anni" });
  await client.avatars.createFromSteps("Leo", { closeup: "https://x/c.jpg" }, { gender: "male" });
  assert.deepEqual(jsonBody(fetch.calls[1]), {
    name: "Leo",
    images_by_view: { closeup: "https://x/c.jpg" },
    gender: "male"
  });
  await client.avatars.generateSheet(2, { force: true, outputStyle: "studio" });
  assert.deepEqual(jsonBody(fetch.calls[2]), { force: true, output_style: "studio" });
  await client.avatars.generateVoice(2, { generationNote: "warm" });
  assert.deepEqual(jsonBody(fetch.calls[3]), { generation_note: "warm" });
  const doc = await client.avatars.consentDocument(2, null, { kind: "release" });
  assert.deepEqual(doc, Buffer.from("DOCX"));
  assert.ok(fetch.calls[4].url.endsWith("/api/v1/avatar/2/consent-document?kind=release"));
});

test("bulk upload images is multipart and wait returns the final state", async () => {
  const { client, fetch } = apiClient([
    makeResponse({ uploaded: 2, items: [] }, 201),
    makeResponse({ id: "b1", status: "processing" }),
    makeResponse({ id: "b1", status: "partially_completed" })
  ]);
  const out = await client.bulk.uploadImages("b1", [Buffer.from("one"), Buffer.from("two")]);
  assert.equal(out.uploaded, 2);
  const form = fetch.calls[0].options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.getAll("files").length, 2);
  assert.equal(form.getAll("files")[0].name, "image");
  const final = await client.bulk.wait("b1", { interval: 0, timeout: 5 });
  assert.equal(final.status, "partially_completed");
});

test("bulk wait times out", async () => {
  const { client } = apiClient([makeResponse({ id: "b1", status: "processing" })]);
  await assert.rejects(() => client.bulk.wait("b1", { interval: 0, timeout: 0 }), PollTimeoutError);
});

test("bulk download generated filters items", async () => {
  const { client, fetch } = apiClient([makeResponse(Buffer.from("PK"), 200, { "Content-Type": "application/zip" })]);
  const zip = await client.bulk.downloadGenerated("b1", null, { item_ids: [1, 2] });
  assert.deepEqual(zip, Buffer.from("PK"));
  assert.ok(fetch.calls.at(-1).url.endsWith("item_ids=1%2C2"));
});

test("bulk item routes", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ id: "b1" }), 201),
    makeResponse({ ok: true }),
    makeResponse({ ok: true }),
    makeResponse({ ok: true }),
    makeResponse(Buffer.from("IMG"))
  ]);
  await client.bulk.create({ prompt: "on a table", avatarId: 4 });
  assert.deepEqual(jsonBody(fetch.calls[0]), { prompt: "on a table", avatar_id: 4 });
  await client.bulk.start("b1");
  assert.equal(fetch.calls[1].options.body, undefined);
  await client.bulk.regenerateItem("b1", 9, { promptOverride: "closer", verify_until_ok: true });
  assert.deepEqual(jsonBody(fetch.calls[2]), { prompt_override: "closer", verify_until_ok: true });
  await client.bulk.selectAttempt("b1", 9, 2);
  assert.deepEqual(jsonBody(fetch.calls[3]), { attempt_index: 2 });
  await client.bulk.downloadItem("b1", 9);
  assert.deepEqual(fetch.calls.map((call) => new URL(call.url).pathname), [
    "/api/v1/bulk",
    "/api/v1/bulk/b1/start",
    "/api/v1/bulk/b1/items/9/regenerate",
    "/api/v1/bulk/b1/items/9/attempts/select",
    "/api/v1/bulk/b1/items/9/download"
  ]);
});

test("asset create is multipart", async () => {
  const { client, fetch } = apiClient([makeResponse({ id: 9, name: "Bag" }, 201)]);
  const out = await client.assets.create("Bag", Buffer.from("img"), { category_id: 4 });
  assert.equal(out.id, 9);
  const form = fetch.calls[0].options.body;
  assert.ok(form instanceof FormData);
  assert.ok(form.get("primary_image") instanceof Blob);
  assert.equal(form.get("category_id"), "4");
  assert.equal(form.get("name"), "Bag");
  assert.equal(form.has("product_description"), false);
});

test("collections and backgrounds use JSON without a file and multipart with one", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({ id: 1 })),
    makeResponse(ok({ id: 2 })),
    makeResponse(ok({ id: 3 })),
    makeResponse(ok({ id: 4 }))
  ]);
  await client.collections.create("Summer");
  assert.deepEqual(jsonBody(fetch.calls[0]), { name: "Summer" });
  await client.collections.create("Winter", { description: "cold", cover: Buffer.from("c") });
  const form = fetch.calls[1].options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("description"), "cold");
  assert.ok(form.get("cover") instanceof Blob);

  await client.backgrounds.create({ imageUrl: "https://x/bg.jpg", name: "Marble" });
  assert.deepEqual(jsonBody(fetch.calls[2]), { name: "Marble", image_url: "https://x/bg.jpg" });
  await client.backgrounds.create({ file: Buffer.from("bg"), source: "upload" });
  assert.ok(fetch.calls[3].options.body instanceof FormData);
  assert.equal(fetch.calls[3].options.body.get("source"), "upload");
});

test("collections and categories coerce ids to integers", async () => {
  const { client, fetch } = apiClient([
    makeResponse(ok({})),
    makeResponse(ok({})),
    makeResponse(ok({}))
  ]);
  await client.collections.addGeneration(2, "15");
  assert.deepEqual(jsonBody(fetch.calls[0]), { log_id: 15 });
  await client.categories.setSelected(["1", 2]);
  assert.deepEqual(jsonBody(fetch.calls[1]), { category_ids: [1, 2] });
  await client.collections.moveGeneration(2, 15, "3");
  assert.equal(fetch.calls[2].options.method, "PATCH");
  assert.deepEqual(jsonBody(fetch.calls[2]), { target_collection_id: 3 });
});

test("agency act-as and topup", async () => {
  const { client, fetch } = apiClient([
    makeResponse({ ok: true }),
    makeResponse(ok({ generation_id: "g" }), 202),
    makeResponse({ relationship: { id: 4 } })
  ]);
  await client.agency.topup(4, 25.0);
  assert.deepEqual(jsonBody(fetch.calls[0]), { amount: 25.0 });
  await client.withManagedUser(77).images.generate("https://x/p.jpg", { avatar_id: 1 });
  assert.equal(fetch.calls[1].options.headers["X-Managed-User-Id"], "77");
  const rel = await client.agency.client(4);
  assert.equal(rel.relationship.id, 4);
  assert.equal(fetch.calls[2].url, `${BASE}/api/v1/agency/managed-clients/4`);
});

test("agency and brand termination bodies", async () => {
  const { client, fetch } = apiClient([
    makeResponse({ ok: true }),
    makeResponse({ ok: true }),
    makeResponse({ ok: true }),
    makeResponse({ ok: true })
  ]);
  await client.agency.respondTermination(4, 1, { reason: "ok" });
  assert.deepEqual(jsonBody(fetch.calls[0]), { accept: true, response_reason: "ok" });
  await client.agency.createClient("Acme", "IT", { terms: true }, { vatNumber: "IT123", image_pct: 10 });
  assert.deepEqual(jsonBody(fetch.calls[1]), {
    company_name: "Acme",
    company_country: "IT",
    legal_consents: { terms: true },
    vat_number: "IT123",
    image_pct: 10
  });
  await client.brand.respondTermination(false);
  assert.deepEqual(jsonBody(fetch.calls[2]), { accept: false });
  await client.brand.acceptManagerInvite("tok");
  assert.deepEqual(fetch.calls.map((call) => new URL(call.url).pathname), [
    "/api/v1/agency/managed-clients/4/termination/respond",
    "/api/v1/agency/managed-clients/direct",
    "/api/v1/brand/manager-relationship/termination/respond",
    "/api/v1/brand/manager-invite/tok/accept"
  ]);
});

test("legal templates download and attach", async () => {
  const { client, fetch } = jwtClient([
    makeResponse(Buffer.from("DOCX")),
    makeResponse({ ok: true }),
    makeResponse({ ok: true })
  ]);
  assert.equal(client.usesApiKey, false);
  assert.deepEqual(await client.legal.liberatoriaTemplate(), Buffer.from("DOCX"));
  assert.equal(fetch.calls[0].url, `${BASE}/api/legal/byo/liberatoria-template`);
  await client.legal.attachLiberatoria(10, "3", {
    release_doc_url: "r",
    idDocUrl: "i",
    model_email: "m@x.com",
    model_dob: "1990-01-01"
  });
  assert.deepEqual(jsonBody(fetch.calls[1]), {
    avatar_id: 3,
    release_doc_url: "r",
    id_doc_url: "i",
    model_email: "m@x.com",
    model_dob: "1990-01-01"
  });
  await client.legal.uploadManleva(10, Buffer.from("pdf"), { signedByName: "Mario" });
  const form = fetch.calls[2].options.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("signed_by_name"), "Mario");
  assert.ok(form.get("file") instanceof Blob);
});

test("uploads consent document and reference audio", async () => {
  const { client, fetch } = jwtClient([
    makeResponse({ public_url: "https://cdn/c.pdf" }),
    makeResponse({ public_url: "https://cdn/a.wav" })
  ]);
  await client.uploads.consentDocument(Buffer.from("pdf"));
  assert.equal(fetch.calls[0].options.body.get("folder"), "avatar-consents");
  await client.uploads.referenceAudio(Buffer.from("wav"));
  assert.equal(fetch.calls[1].url, `${BASE}/upload/reference-audio`);
  assert.ok(fetch.calls[1].options.body.get("file") instanceof Blob);
});

test("client.download writes nested destinations and forwards params", async () => {
  const { client, fetch } = apiClient([makeResponse(Buffer.from("zip"))]);
  const dir = await tmpDir();
  const dest = path.join(dir, "a", "b", "bulk.zip");
  const saved = await client.download("/api/v1/bulk/b1/download-generated", dest, { params: { item_ids: "1", x: null } });
  assert.equal(saved, dest);
  assert.equal(await fs.readFile(dest, "utf8"), "zip");
  assert.ok(fetch.calls[0].url.endsWith("?item_ids=1"));
});

test("long video wait stops at segments_ready", async () => {
  const { client } = apiClient([
    makeResponse(ok({ job_id: 5, status: "generating" })),
    makeResponse(ok({ job_id: 5, status: "segments_ready", final_video_url: null,
      segments: [{ index: 1, video_url: "https://cdn/1.mp4" }] }))
  ]);
  const out = await client.longvideo.wait(5, { interval: 0, timeout: 5 });
  assert.equal(out.status, "segments_ready");
  assert.ok(out.segments[0].video_url.endsWith("1.mp4"));
});

test("long video render exports then waits for the final video", async () => {
  const { client, fetch } = jwtClient([
    makeResponse(ok({ status: "segments_ready" })),
    makeResponse({ job_id: 5, status: "concatenating" }, 202),
    makeResponse(ok({ status: "concatenating" })),
    makeResponse(ok({ status: "done", final_video_url: "https://cdn/final.mp4" }))
  ]);
  const out = await client.longvideo.render(5, { interval: 0, timeout: 5 });
  assert.ok(out.final_video_url.endsWith("final.mp4"));
  const exportCall = fetch.calls.find((c) => c.url.endsWith("/export"));
  assert.equal(exportCall.url, `${BASE}/api/auth/long-video/5/export`);
  assert.deepEqual(jsonBody(exportCall), {});
});

test("invalid_or_expired_token triggers one relogin", async () => {
  const fetch = makeFetch([
    makeResponse({ success: false, error: { code: "invalid_or_expired_token", message: "x" } }, 401),
    makeResponse({ token: "fresh" }),
    makeResponse({ status: "concatenating" }, 202)
  ]);
  const client = new HeroShotsClient({ baseUrl: BASE, token: "stale", email: "a@b.com", password: "pw", fetch });
  const out = await client.longvideo.export(5);
  assert.equal(out.status, "concatenating");
  assert.equal(client.token, "fresh");
});

test("login rejects non-string credentials before any request", async () => {
  const { ValidationError } = require("../src");
  const fetch = makeFetch([]);
  const client = new HeroShotsClient({ baseUrl: BASE, fetch });
  await assert.rejects(client.login("a@b.com", { password: "x" }), ValidationError);
  await assert.rejects(client.login({ email: "a@b.com" }, "pw"), ValidationError);
  assert.equal(fetch.calls.length, 0);
});

test("fromLogin also accepts a single options object", async () => {
  const fetch = makeFetch([makeResponse({ token: "jwt-1" })]);
  const client = await HeroShotsClient.fromLogin({ email: "a@b.com", password: "pw", baseUrl: BASE, fetch });
  assert.equal(client.token, "jwt-1");
  assert.deepEqual(JSON.parse(fetch.calls[0].options.body), { email: "a@b.com", password: "pw" });
});
