"use strict";

const { Resource, compact, takeOptions } = require("./base");

/** Public price list and quotes (API key or portal JWT, /api/v1/pricing). */
class Pricing extends Resource {
  /** GET /api/v1/pricing/catalog -> image/video prices for the caller's plan. */
  catalog() {
    return this._get("/api/v1/pricing/catalog");
  }

  /**
   * POST /api/v1/pricing/quote -> cost of one generation before running it.
   *
   * `callType` is "image", "video" or "background". For videos pass
   * `duration_seconds`; usage-rights fields are accepted as well.
   */
  quote(callType, payload = {}) {
    return this._post("/api/v1/pricing/quote", { json: { call_type: callType, ...(payload || {}) } });
  }

  /** GET /api/v1/pricing/video-packages/catalog -> volume package tiers. */
  videoPackagesCatalog() {
    return this._get("/api/v1/pricing/video-packages/catalog");
  }

  /** POST /api/v1/pricing/video-packages/quote (`tier`: starter | growth | scale). */
  videoPackagesQuote(tier, payload = {}) {
    const [named, rest] = takeOptions(payload, ["usage_rights"]);
    const body = compact({ tier, usage_rights: named.usage_rights, ...rest });
    return this._post("/api/v1/pricing/video-packages/quote", { json: body });
  }

  /** GET /api/v1/pricing/usage-rights/rules -> allowed usage-rights combinations. */
  usageRightsRules() {
    return this._get("/api/v1/pricing/usage-rights/rules");
  }
}

module.exports = { Pricing };
