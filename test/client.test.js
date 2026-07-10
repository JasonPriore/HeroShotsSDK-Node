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

function makeResponse(json, status = 200) {
  const text = typeof json === "string" ? json : JSON.stringify(json);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text
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

  const rateLimited = makeClient([makeResponse("too many", 429)]);
  await assert.rejects(() => rateLimited.client.balance(), RateLimitError);
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

  const failure = makeClient([
    makeResponse({ job_id: 9, status: "failed", error: { code: "provider_error", message: "boom" } })
  ]);
  await assert.rejects(() => failure.client.longvideo.wait(9, { interval: 0, timeout: 5 }), ProviderError);

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
