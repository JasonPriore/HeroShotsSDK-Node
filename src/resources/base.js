"use strict";

const fs = require("node:fs");

const { HeroShotsError } = require("../errors");

/** Drop null/undefined values so optional arguments are not sent. */
function compact(payload = {}) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function camelCase(name) {
  return name.replace(/_([a-z0-9])/g, (_match, chr) => chr.toUpperCase());
}

/**
 * Split named options out of an options object.
 *
 * Each name is given in snake_case; the camelCase spelling is accepted too
 * (snake_case wins when both are set). Returns `[named, rest]`: `named` uses
 * snake_case keys, `rest` holds every other key, forwarded verbatim.
 */
function takeOptions(options, names) {
  const rest = { ...(options || {}) };
  const named = {};
  for (const name of names) {
    const camel = camelCase(name);
    const value = rest[name] !== undefined ? rest[name] : rest[camel];
    delete rest[name];
    delete rest[camel];
    named[name] = value;
  }
  return [named, rest];
}

/** Coerce an id to an integer (like Python's int()). */
function toInt(value) {
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) {
    throw new TypeError(`expected an integer id, got ${JSON.stringify(value)}`);
  }
  return Math.trunc(number);
}

class Resource {
  constructor(client) {
    this._client = client;
  }

  /** The owning HeroShotsClient. */
  get client() {
    return this._client;
  }

  _get(path, options = {}) {
    return this._client.request("GET", path, options);
  }

  _post(path, options = {}) {
    return this._client.request("POST", path, options);
  }

  _patch(path, options = {}) {
    return this._client.request("PATCH", path, options);
  }

  _put(path, options = {}) {
    return this._client.request("PUT", path, options);
  }

  _delete(path, options = {}) {
    return this._client.request("DELETE", path, options);
  }

  /**
   * If `value` is a local file path, upload it and return the hosted URL.
   *
   * Pass-through for empty values, http(s):// and data: URLs and anything that
   * is not an existing file. Uploading needs a portal JWT: with an API key,
   * pass public https:// URLs.
   */
  async _resolveImage(value, folder = "references") {
    if (!value || typeof value !== "string") {
      return value;
    }
    if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
      return value;
    }
    if (fs.existsSync(value)) {
      if (this._client.usesApiKey) {
        throw new HeroShotsError(
          `Cannot upload local file '${value}' with an API key: /upload/image ` +
            "accepts only a portal login. Pass a public https:// URL instead, " +
            "or use Client.fromLogin()."
        );
      }
      const upload = await this._client.uploads.image(value, folder);
      return upload.public_url;
    }
    return value;
  }
}

module.exports = { Resource, compact, takeOptions, toInt };
