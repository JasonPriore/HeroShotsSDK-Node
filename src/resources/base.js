"use strict";

const fs = require("node:fs");

class Resource {
  constructor(client) {
    this.client = client;
  }

  _get(path, options = {}) {
    return this.client.request("GET", path, options);
  }

  _post(path, options = {}) {
    return this.client.request("POST", path, options);
  }

  _patch(path, options = {}) {
    return this.client.request("PATCH", path, options);
  }

  _put(path, options = {}) {
    return this.client.request("PUT", path, options);
  }

  _delete(path, options = {}) {
    return this.client.request("DELETE", path, options);
  }

  async _resolveImage(value, folder = "references") {
    if (!value) {
      return value;
    }
    if (typeof value !== "string") {
      return value;
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }
    if (fs.existsSync(value)) {
      const upload = await this.client.uploads.image(value, folder);
      return upload.public_url;
    }
    return value;
  }
}

module.exports = { Resource };
