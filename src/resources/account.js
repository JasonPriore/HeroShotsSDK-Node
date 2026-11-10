"use strict";

const { Resource } = require("./base");

/** Account endpoints on the public API (API key or portal JWT). */
class Account extends Resource {
  /** GET /api/v1/me -> `{user, credits_remaining: {hs_credits, currency_credit}}`. */
  me() {
    return this._get("/api/v1/me");
  }

  /** GET /api/v1/health -> service health (no auth needed). */
  health() {
    return this._get("/api/v1/health", { auth: false });
  }
}

module.exports = { Account };
