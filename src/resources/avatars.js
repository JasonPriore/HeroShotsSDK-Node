"use strict";

const { Resource } = require("./base");

class Avatars extends Resource {
  list(params = {}) {
    return this._get("/api/v1/avatar/list", { params: Object.keys(params).length ? params : null });
  }

  get(avatarId) {
    return this._get(`/api/v1/avatar/${avatarId}`);
  }

  generate(payload = {}) {
    return this._post("/api/v1/avatar/generate", { json: payload });
  }
}

module.exports = { Avatars };
