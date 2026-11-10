"use strict";

/**
 * HeroShots API client.
 *
 * Authenticates with a B2B API key (`lz_live_...`) or a portal JWT, both sent
 * as `Authorization: Bearer <token>`. Portal JWTs come from
 * `POST /api/auth/login` (HS256, 7-day TTL, no refresh endpoint - the client
 * re-logs in once on `token_expired` when it knows the credentials).
 *
 * Which credential works where:
 *
 * - `/api/v1/*` (images, videos, long video, still life, avatars, library, bulk,
 *   pricing, agency, brand) accepts both API keys and portal JWTs.
 * - Portal routes (storyboard, uploads, image candidates, still-life background
 *   edits, legal) accept only a portal JWT.
 * - API keys are refused on the Free plan (`plan_not_allowed`), except for
 *   agency accounts.
 *
 * Response envelopes: `/api/v1/*` -> `{success, data, meta}` is unwrapped to
 * `data` (`meta` is kept under `data._meta`); everything else is returned as-is.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const { errorFromResponse, RateLimitError, TokenExpiredError } = require("./errors");
const { Account } = require("./resources/account");
const { Agency } = require("./resources/agency");
const { Avatars } = require("./resources/avatars");
const { Brand } = require("./resources/brand");
const { Bulk } = require("./resources/bulk");
const { Generations } = require("./resources/generations");
const { Images } = require("./resources/images");
const { Legal } = require("./resources/legal");
const { Assets, Backgrounds, Categories, Collections } = require("./resources/library");
const { LongVideo } = require("./resources/longvideo");
const { Pricing } = require("./resources/pricing");
const { StillLife } = require("./resources/stilllife");
const { Storyboard } = require("./resources/storyboard");
const { Uploads } = require("./resources/uploads");
const { Videos } = require("./resources/videos");
const { version: SDK_VERSION } = require("../package.json");

const DEFAULT_TIMEOUT = 120000;
const DEFAULT_BASE_URL = "https://app.heroshots.ai";
const DEFAULT_MAX_RETRIES = 2;
const API_KEY_PREFIX = "lz_";

class HeroShotsClient {
  constructor(options = {}) {
    if (typeof options === "string") {
      options = { token: options };
    }

    const {
      baseUrl = process.env.HEROSHOTS_BASE_URL || DEFAULT_BASE_URL,
      token = null,
      apiKey = null,
      email = null,
      password = null,
      managedUserId = null,
      timeout = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
      fetch: fetchImpl = globalThis.fetch,
      autoRelogin = true
    } = options;

    if (typeof fetchImpl !== "function") {
      throw new Error("global fetch is not available. Use Node.js 18+ or pass { fetch }.");
    }

    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = token || apiKey || process.env.HEROSHOTS_API_KEY || null;
    this.managedUserId = managedUserId;
    this._email = email;
    this._password = password;
    this._autoRelogin = autoRelogin;
    this.timeout = timeout;
    this.maxRetries = Math.max(0, Math.trunc(Number(maxRetries) || 0));
    this.fetch = fetchImpl;

    // Account / auth helpers.
    this.account = new Account(this);
    // Generation.
    this.images = new Images(this);
    this.videos = new Videos(this);
    this.longvideo = new LongVideo(this);
    this.stilllife = new StillLife(this);
    this.storyboard = new Storyboard(this);
    this.avatars = new Avatars(this);
    this.bulk = new Bulk(this);
    this.generations = new Generations(this);
    this.pricing = new Pricing(this);
    // Library.
    this.assets = new Assets(this);
    this.collections = new Collections(this);
    this.backgrounds = new Backgrounds(this);
    this.categories = new Categories(this);
    // Files, compliance, relationships.
    this.uploads = new Uploads(this);
    this.legal = new Legal(this);
    this.agency = new Agency(this);
    this.brand = new Brand(this);
  }

  static async fromLogin(email, password, options = {}) {
    const client = new HeroShotsClient({ ...options, email, password });
    await client.login(email, password);
    return client;
  }

  /** True when the bearer is a B2B API key (`lz_live_...`), not a portal JWT. */
  get usesApiKey() {
    return Boolean(this.token) && String(this.token).startsWith(API_KEY_PREFIX);
  }

  async login(email, password) {
    const data = await this.request("POST", "/api/auth/login", {
      json: { email, password },
      auth: false
    });
    this.token = data?.token || null;
    this._email = email;
    this._password = password;
    return data;
  }

  /**
   * Current account. With an API key: `GET /api/v1/me` (`{user, credits_remaining}`).
   * With a portal JWT: `GET /api/auth/me` (full portal profile).
   */
  me() {
    if (this.usesApiKey) {
      return this.account.me();
    }
    return this.request("GET", "/api/auth/me");
  }

  /** GET /api/auth/stats -> full raw portal stats (portal JWT only). */
  stats() {
    return this.request("GET", "/api/auth/stats");
  }

  /**
   * Compact credit/wallet view. With an API key it reads `/api/v1/me`
   * (`currency_credit` is the wallet in EUR); with a portal JWT it reads
   * `/api/auth/stats` and also returns plan and usage counters.
   */
  async balance() {
    if (this.usesApiKey) {
      const me = await this.account.me();
      const credits = isPlainObject(me) && isPlainObject(me.credits_remaining) ? me.credits_remaining : {};
      const user = isPlainObject(me) && isPlainObject(me.user) ? me.user : {};
      const out = {};
      if (hasOwn(credits, "hs_credits")) {
        out.hs_credits = credits.hs_credits;
      }
      const wallet = hasOwn(credits, "currency_credit") ? credits.currency_credit : user.currency_credit;
      if (wallet !== undefined && wallet !== null) {
        out.currency_credit = wallet;
        out.wallet_balance = wallet;
      }
      if (hasOwn(user, "currency_billing_type")) {
        out.billing_type = user.currency_billing_type;
      }
      return out;
    }

    const stats = await this.stats();
    const plan = isPlainObject(stats) && isPlainObject(stats.plan) ? stats.plan : {};
    const keys = [
      "hs_credits",
      "total_credits_used",
      "total_cost_charged",
      "current_month_cost",
      "current_month_generations",
      "total_generations",
      "video_package_credits_remaining",
      "free_preview_videos_remaining",
      "use_wallet"
    ];
    const out = {};
    for (const key of keys) {
      if (isPlainObject(stats) && hasOwn(stats, key)) {
        out[key] = stats[key];
      }
    }

    const planKeys = [
      "wallet_balance",
      "template_id",
      "billing_type",
      "output_resolution",
      "has_watermark",
      "offered_plan_id",
      "monthly_price"
    ];
    const compactPlan = {};
    for (const key of planKeys) {
      if (hasOwn(plan, key)) {
        compactPlan[key] = plan[key];
      }
    }
    if (Object.keys(compactPlan).length) {
      out.plan = compactPlan;
    }
    if (hasOwn(compactPlan, "wallet_balance")) {
      out.wallet_balance = compactPlan.wallet_balance;
    }
    return out;
  }

  /** Set the managed brand target for agency act-as requests (`null` clears it). */
  withManagedUser(managedUserId) {
    this.managedUserId = managedUserId;
    return this;
  }

  /**
   * Perform an HTTP request and return decoded JSON (or throw an `ApiError`).
   *
   * Options: `json`, `params` (null/undefined dropped), `formData`, `auth`
   * (default true), `unwrap` (default: inferred from `/api/v1/` paths) and
   * `raw` (return the body as a Buffer, for file downloads).
   */
  async request(method, requestPath, options = {}, retried = false) {
    const {
      json = undefined,
      params = null,
      formData = null,
      auth = true,
      unwrap = null,
      raw = false
    } = options;

    const url = new URL(this.baseUrl + requestPath);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const headers = { "User-Agent": `heroshots-node/${SDK_VERSION}` };
    if (!raw) {
      headers.Accept = "application/json";
    }
    if (auth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (auth && this.managedUserId !== null && this.managedUserId !== undefined) {
      headers["X-Managed-User-Id"] = String(this.managedUserId);
    }

    let body;
    if (formData) {
      body = formData;
    } else if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    }

    let attempt = 0;
    let response;
    while (true) {
      response = await this._send(url, { method: method.toUpperCase(), headers, body });
      // 429 means the request was not processed: safe to retry, also for POST.
      // Multipart bodies are not retried (mirrors the Python SDK).
      if (response.status === 429 && attempt < this.maxRetries && !formData) {
        attempt += 1;
        await discardBody(response);
        await this._sleep(retryDelay(response, attempt));
        continue;
      }
      break;
    }

    if (!response.ok) {
      const parsed = await parseResponse(response);
      const apiError = errorFromResponse(response.status, parsed);
      if (apiError instanceof RateLimitError) {
        apiError.retryAfter = retryAfterSeconds(response);
      }
      // One automatic re-login attempt on an expired token.
      if (
        apiError instanceof TokenExpiredError &&
        this._autoRelogin &&
        !retried &&
        this._email &&
        this._password
      ) {
        await this.login(this._email, this._password);
        return this.request(method, requestPath, options, true);
      }
      throw apiError;
    }

    if (raw) {
      return readBuffer(response);
    }

    const parsed = await parseResponse(response);
    const shouldUnwrap = unwrap === null ? requestPath.startsWith("/api/v1/") : unwrap;
    if (shouldUnwrap && isPlainObject(parsed) && "data" in parsed) {
      const data = parsed.data;
      if (isPlainObject(data) && parsed.meta !== undefined && parsed.meta !== null && data._meta === undefined) {
        // Surface billing/credits metadata without losing the typed shape.
        data._meta = parsed.meta;
      }
      return data;
    }
    return parsed;
  }

  /**
   * GET a binary endpoint. Resolves to a Buffer, or writes `dest` (creating
   * parent directories) and resolves to its path.
   */
  async download(requestPath, dest = null, { params = null } = {}) {
    const content = await this.request("GET", requestPath, { params, raw: true });
    if (dest === null || dest === undefined) {
      return content;
    }
    const target = path.normalize(String(dest));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    return target;
  }

  async _send(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error(`request timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Wait between 429 retries (seconds). Overridable, e.g. in tests. */
  _sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Build a FormData from file parts and extra string fields.
   *
   * `parts` is an array of `[field, file, defaultName?]`; a file is a local path
   * string, a Buffer / Uint8Array, a Blob, or any value FormData accepts.
   * `fields` values that are null/undefined are skipped.
   */
  async _multipart(parts = [], fields = {}) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields || {})) {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    }
    for (const [field, file, defaultName = "file"] of parts) {
      await appendFile(formData, field, file, defaultName);
    }
    return formData;
  }

  /** FormData with a single file part (`field`, default "file"). */
  async _multipartFile(file, field = "file") {
    return this._multipart([[field, file]]);
  }
}

async function appendFile(formData, field, file, defaultName = "file") {
  if (typeof file === "string") {
    const bytes = await fs.readFile(file);
    formData.append(field, new Blob([bytes]), path.basename(file));
  } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
    formData.append(field, new Blob([file]), defaultName);
  } else if (file instanceof Blob) {
    formData.append(field, file, file.name || defaultName);
  } else {
    formData.append(field, file);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function getHeader(response, name) {
  const headers = response && response.headers;
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return null;
}

function retryAfterSeconds(response) {
  const value = getHeader(response, "Retry-After");
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const seconds = Number(String(value).trim());
  if (!Number.isFinite(seconds)) {
    return null;
  }
  return Math.max(0, seconds);
}

function retryDelay(response, attempt) {
  const after = retryAfterSeconds(response);
  if (after !== null) {
    return Math.min(after, 60);
  }
  return Math.min(2 ** (attempt - 1), 30);
}

async function discardBody(response) {
  try {
    if (response.body && typeof response.body.cancel === "function") {
      await response.body.cancel();
    }
  } catch (_err) {
    // Ignore: the body is not needed.
  }
}

async function readBuffer(response) {
  if (typeof response.arrayBuffer === "function") {
    return Buffer.from(await response.arrayBuffer());
  }
  return Buffer.from(await response.text());
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

module.exports = {
  HeroShotsClient,
  Client: HeroShotsClient,
  DEFAULT_TIMEOUT,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES
};
