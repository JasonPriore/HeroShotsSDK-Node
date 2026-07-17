"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { errorFromResponse, TokenExpiredError } = require("./errors");
const { Avatars } = require("./resources/avatars");
const { Images } = require("./resources/images");
const { LongVideo } = require("./resources/longvideo");
const { StillLife } = require("./resources/stilllife");
const { Storyboard } = require("./resources/storyboard");
const { Uploads } = require("./resources/uploads");
const { Videos } = require("./resources/videos");

const DEFAULT_TIMEOUT = 120000;
const DEFAULT_BASE_URL = "https://app.heroshots.ai";

class HeroShotsClient {
  constructor(options = {}) {
    if (typeof options === "string") {
      options = { token: options };
    }

    const {
      baseUrl = process.env.HEROSHOTS_BASE_URL || DEFAULT_BASE_URL,
      token = null,
      email = null,
      password = null,
      managedUserId = null,
      timeout = DEFAULT_TIMEOUT,
      fetch: fetchImpl = globalThis.fetch,
      autoRelogin = true
    } = options;

    if (typeof fetchImpl !== "function") {
      throw new Error("global fetch is not available. Use Node.js 18+ or pass { fetch }.");
    }

    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.token = token;
    this.managedUserId = managedUserId;
    this._email = email;
    this._password = password;
    this._autoRelogin = autoRelogin;
    this.timeout = timeout;
    this.fetch = fetchImpl;

    this.avatars = new Avatars(this);
    this.images = new Images(this);
    this.longvideo = new LongVideo(this);
    this.stilllife = new StillLife(this);
    this.storyboard = new Storyboard(this);
    this.uploads = new Uploads(this);
    this.videos = new Videos(this);
  }

  static async fromLogin(email, password, options = {}) {
    const client = new HeroShotsClient({ ...options, email, password });
    await client.login(email, password);
    return client;
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

  me() {
    return this.request("GET", "/api/auth/me");
  }

  stats() {
    return this.request("GET", "/api/auth/stats");
  }

  async balance() {
    const stats = await this.stats();
    const plan = stats && typeof stats.plan === "object" && !Array.isArray(stats.plan) ? stats.plan : {};
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
      if (stats && Object.prototype.hasOwnProperty.call(stats, key)) {
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
      if (Object.prototype.hasOwnProperty.call(plan, key)) {
        compactPlan[key] = plan[key];
      }
    }
    if (Object.keys(compactPlan).length) {
      out.plan = compactPlan;
    }
    if (Object.prototype.hasOwnProperty.call(compactPlan, "wallet_balance")) {
      out.wallet_balance = compactPlan.wallet_balance;
    }
    return out;
  }

  withManagedUser(managedUserId) {
    this.managedUserId = managedUserId;
    return this;
  }

  async request(method, requestPath, options = {}, retried = false) {
    const {
      json = undefined,
      params = null,
      formData = null,
      auth = true,
      unwrap = null
    } = options;

    const url = new URL(this.baseUrl + requestPath);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const headers = {};
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let response;
    try {
      response = await this.fetch(url, {
        method: method.toUpperCase(),
        headers,
        body,
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error(`request timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const parsed = await parseResponse(response);
    if (!response.ok) {
      const apiError = errorFromResponse(response.status, parsed);
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

    const shouldUnwrap = unwrap === null ? requestPath.startsWith("/api/v1/") : unwrap;
    if (shouldUnwrap && parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data" in parsed) {
      const data = parsed.data;
      if (data && typeof data === "object" && !Array.isArray(data) && parsed.meta !== undefined && data._meta === undefined) {
        data._meta = parsed.meta;
      }
      return data;
    }
    return parsed;
  }

  async _multipartFile(file, field = "file") {
    const formData = new FormData();
    if (typeof file === "string") {
      const bytes = await fs.readFile(file);
      const blob = new Blob([bytes]);
      formData.append(field, blob, path.basename(file));
    } else if (Buffer.isBuffer(file)) {
      formData.append(field, new Blob([file]), "file");
    } else if (file instanceof Blob) {
      formData.append(field, file, file.name || "file");
    } else {
      formData.append(field, file);
    }
    return formData;
  }
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
  DEFAULT_BASE_URL
};
