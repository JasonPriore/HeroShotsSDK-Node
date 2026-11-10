"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  Client,
  HeroShotsClient,
  NotFoundError,
  ProviderError,
  RateLimitError,
  TokenExpiredError,
  ValidationError,
  PollTimeoutError
} = require("../src");

const BASE = "https://api.test";

function makeResponse(json, status = 200, headers = {}) {
  const text = typeof json === "string" ? json : JSON.stringify(json);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer
  };
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

function makeClient(responses, options = {}) {
  const fetch = makeFetch(responses);
  const client = new HeroShotsClient({ baseUrl: BASE, token: "tok", autoRelogin: false, fetch, ...options });
  client._sleep = async () => {};
  return { client, fetch };
}

test("login stores token and sends bearer header", async () => {
  const fetch = makeFetch([
    makeResponse({ token: "jwt-123", user_id: 7 }),
    makeResponse({ user_id: 7 })
  ]);
  const client = await Client.fromLogin("a@b.com", "pw", { baseUrl: BASE, fetch });
  assert.equal(client.token, "jwt-123");

  await client.me();
  assert.equal(fetch.calls.at(-1).options.headers.Authorization, "Bearer jwt-123");
});

test("v1 envelope is unwrapped with _meta", async () => {
  const { client } = makeClient([
    makeResponse({
      success: true,
      data: { generation_id: "g1", status: "pending" },
      meta: { credits_remaining: 5 }
    })
  ]);

  const out = await client.images.generate("https://x/p.jpg");
  assert.equal(out.generation_id, "g1");
  assert.equal(out._meta.credits_remaining, 5);
});

test("managed user header is sent for agency act-as", async () => {
  const { client, fetch } = makeClient([
    makeResponse({
      success: true,
      data: { generation_id: "g1", status: "pending" }
    })
  ], { token: "agency-key", managedUserId: 12345 });

  const out = await client.images.generate("https://x/p.jpg");
  assert.equal(out.generation_id, "g1");
  assert.equal(fetch.calls[0].options.headers.Authorization, "Bearer agency-key");
  assert.equal(fetch.calls[0].options.headers["X-Managed-User-Id"], "12345");
});

test("managed user header is absent by default and with auth disabled", async () => {
  const { client, fetch } = makeClient([
    makeResponse({
      success: true,
      data: { generation_id: "g1", status: "pending" }
    }),
    makeResponse({ token: "fresh" })
  ]);

  await client.images.generate("https://x/p.jpg");
  assert.equal(fetch.calls[0].options.headers["X-Managed-User-Id"], undefined);

  await client.withManagedUser(12345).login("a@b.com", "pw");
  assert.equal(fetch.calls[1].options.headers["X-Managed-User-Id"], undefined);
});

test("balance is compact and stats is raw", async () => {
  const statsPayload = {
    hs_credits: 120,
    total_credits_used: 30,
    current_month_generations: 4,
    plan: { wallet_balance: 9.5, template_id: "free" },
    recent_generations: [{ id: 1 }],
    offered_plans: [{ id: 1 }]
  };

  const { client } = makeClient([
    makeResponse(statsPayload),
    makeResponse(statsPayload)
  ]);

  const balance = await client.balance();
  assert.equal(balance.hs_credits, 120);
  assert.equal(balance.wallet_balance, 9.5);
  assert.equal(balance.plan.wallet_balance, 9.5);
  assert.equal(balance.current_month_generations, 4);
  assert.equal(balance.recent_generations, undefined);
  assert.equal(balance.offered_plans, undefined);

  const stats = await client.stats();
  assert.equal(stats.recent_generations[0].id, 1);
  assert.equal(stats.offered_plans[0].id, 1);
});

test("structured errors map to specific classes", async () => {
  const { client } = makeClient([
    makeResponse({ success: false, error: { code: "validation_error", message: "custom_prompt is required" } }, 400)
  ]);

  await assert.rejects(
    () => client.storyboard.candidates("", 30, "https://x/p.jpg"),
    (err) => err instanceof ValidationError && err.code === "validation_error" && err.status === 400
  );
});

test("404 and 429 map to specific classes", async () => {
  const notFound = makeClient([
    makeResponse({ success: false, error: { code: "not_found", message: "expired" } }, 404)
  ]);
  await assert.rejects(() => notFound.client.storyboard.status("missing"), NotFoundError);

  const rateLimited = makeClient([makeResponse("too many", 429, { "Retry-After": "7" })], { maxRetries: 0 });
  await assert.rejects(
    () => rateLimited.client.balance(),
    (err) => err instanceof RateLimitError && err.retryAfter === 7
  );
});

test("429 without Retry-After is retried with exponential backoff, then raises", async () => {
  const { client, fetch } = makeClient([
    makeResponse("too many", 429),
    makeResponse("too many", 429),
    makeResponse("too many", 429)
  ]);
  const delays = [];
  client._sleep = async (seconds) => {
    delays.push(seconds);
  };
  await assert.rejects(() => client.stats(), (err) => err instanceof RateLimitError && err.retryAfter === null);
  assert.equal(fetch.calls.length, 3);
  assert.deepEqual(delays, [1, 2]);
});

test("Retry-After is capped at 60 seconds", async () => {
  const { client } = makeClient([
    makeResponse("too many", 429, { "Retry-After": "120" }),
    makeResponse({ ok: true })
  ]);
  const delays = [];
  client._sleep = async (seconds) => {
    delays.push(seconds);
  };
  assert.deepEqual(await client.stats(), { ok: true });
  assert.deepEqual(delays, [60]);
});

test("multipart uploads are not retried on 429", async () => {
  const { client, fetch } = makeClient([makeResponse("too many", 429)]);
  await assert.rejects(() => client.uploads.image(Buffer.from("x"), "products"), RateLimitError);
  assert.equal(fetch.calls.length, 1);
});

test("token expiry auto relogins once when credentials exist", async () => {
  const fetch = makeFetch([
    makeResponse({ success: false, error: { code: "token_expired", message: "expired" } }, 401),
    makeResponse({ token: "fresh" }),
    makeResponse({ user_id: 1 })
  ]);
  const client = new HeroShotsClient({
    baseUrl: BASE,
    token: "stale",
    email: "a@b.com",
    password: "pw",
    fetch
  });

  const out = await client.me();
  assert.equal(out.user_id, 1);
  assert.equal(client.token, "fresh");
});

test("token expiry raises without credentials", async () => {
  const { client } = makeClient([
    makeResponse({ success: false, error: { code: "token_expired", message: "expired" } }, 401)
  ]);
  await assert.rejects(() => client.me(), TokenExpiredError);
});

test("upload sends FormData and local path auto-uploads before generate", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hs-node-"));
  const img = path.join(tmpDir, "product.png");
  await fs.writeFile(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const { client, fetch } = makeClient([
    makeResponse({ public_url: "https://cdn/up.png", filename: "product.png", folder: "products" }),
    makeResponse({ success: true, data: { generation_id: "g", status: "pending" }, meta: {} })
  ]);

  const out = await client.images.generate(img);
  assert.equal(out.generation_id, "g");

  assert.ok(fetch.calls[0].options.body instanceof FormData);
  const body = JSON.parse(fetch.calls[1].options.body);
  assert.equal(body.product_image_url, "https://cdn/up.png");
});

test("storyboard brief suggestions returns list", async () => {
  const { client } = makeClient([
    makeResponse({ suggestions: ["a", "b", "c"] })
  ]);
  assert.deepEqual(await client.storyboard.briefSuggestions("https://x/p.jpg"), ["a", "b", "c"]);
});

test("wait helpers handle success, failure and timeout", async () => {
  const success = makeClient([
    makeResponse({ task_id: "t1", status: "succeeded", video_url: "https://cdn/v.mp4" })
  ]);
  const video = await success.client.videos.wait("t1", { interval: 0, timeout: 5 });
  assert.equal(video.video_url, "https://cdn/v.mp4");
  assert.ok(success.fetch.calls[0].url.endsWith("/api/v1/video/status/t1"));

  const failure = makeClient([
    makeResponse({ job_id: 9, status: "failed", error: { code: "provider_error", message: "boom" } })
  ]);
  await assert.rejects(() => failure.client.longvideo.wait(9, { interval: 0, timeout: 5 }), ProviderError);
  assert.ok(failure.fetch.calls[0].url.endsWith("/api/v1/long-video/status/9"));

  const timeout = makeClient([
    makeResponse({ job_id: "slow", status: "queued" })
  ]);
  await assert.rejects(() => timeout.client.storyboard.wait("slow", { interval: 0, timeout: 0 }), PollTimeoutError);
});

test("avatars list uses v1 endpoint", async () => {
  const { client, fetch } = makeClient([
    makeResponse({ success: true, data: { avatars: [{ id: 1 }] }, meta: {} })
  ]);
  const out = await client.avatars.list();
  assert.equal(out.avatars.length, 1);
  assert.ok(fetch.calls[0].url.includes("/api/v1/avatar/list"));
});

test("video wait unwraps the v1 status envelope", async () => {
  const { client, fetch } = makeClient([
    makeResponse({ success: true, data: { status: "succeeded", video_url: "https://cdn/v.mp4" } })
  ]);
  const out = await client.videos.wait("t1", { interval: 0, timeout: 5 });
  assert.equal(out.video_url, "https://cdn/v.mp4");
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/video/status/t1`);
});

test("long video start, status and view use the right routes", async () => {
  const { client, fetch } = makeClient([
    makeResponse({ success: true, data: { job_id: 5, status: "queued" } }, 202),
    makeResponse({ success: true, data: { job_id: 5, status: "running" } }),
    makeResponse({ job_id: 5, final_video_url: "https://cdn/f.mp4" })
  ]);
  const job = await client.longvideo.start("https://x/p.jpg", { customPrompt: "spot", durationSeconds: 30 });
  assert.equal(job.job_id, 5);
  assert.equal(fetch.calls[0].url, `${BASE}/api/v1/long-video/start`);
  assert.deepEqual(JSON.parse(fetch.calls[0].options.body), {
    ratio: "16:9",
    resolution: "1080p",
    image_url: "https://x/p.jpg",
    custom_prompt: "spot",
    duration_seconds: 30
  });

  await client.longvideo.status(5);
  assert.equal(fetch.calls[1].url, `${BASE}/api/v1/long-video/status/5`);

  await client.longvideo.view("share-tok");
  assert.equal(fetch.calls[2].url, `${BASE}/api/auth/long-video/view/share-tok`);
});

test("still-life background edits stay on the portal routes", async () => {
  const { client, fetch } = makeClient([
    makeResponse({ ok: true }),
    makeResponse({ ok: true }),
    makeResponse({ status: "done" })
  ]);
  await client.stilllife.previewBackground(8, { background_url: "https://x/bg.jpg" });
  await client.stilllife.changeBackground(8, { background_url: "https://x/bg.jpg" });
  await client.stilllife.changeBackgroundStatus(8);
  assert.deepEqual(fetch.calls.map((call) => call.url), [
    `${BASE}/api/auth/stilllife-video/8/preview-background`,
    `${BASE}/api/auth/stilllife-video/8/change-background`,
    `${BASE}/api/auth/stilllife-video/8/change-background/status`
  ]);
});

test("JSON requests send User-Agent and Accept headers", async () => {
  const { client, fetch } = makeClient([makeResponse({ user_id: 1 })]);
  await client.me();
  const headers = fetch.calls[0].options.headers;
  assert.equal(headers["User-Agent"], `heroshots-node/${require("../package.json").version}`);
  assert.equal(headers.Accept, "application/json");
  assert.equal(fetch.calls[0].url, `${BASE}/api/auth/me`);
});
