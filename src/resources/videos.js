"use strict";

const { Resource } = require("./base");
const polling = require("../polling");

class Videos extends Resource {
  async generate(imageUrl = null, payload = {}) {
    const body = { ...payload };
    if (imageUrl !== null && imageUrl !== undefined) {
      body.image_url = await this._resolveImage(imageUrl, "products");
    }
    return this._post("/api/v1/video/generate", { json: body });
  }

  status(taskId) {
    return this._get(`/video/status/${taskId}`);
  }

  wait(taskId, { interval = 5.0, timeout = 900.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(taskId),
      { terminalOk: polling.MEDIA_OK, terminalFail: polling.MEDIA_FAIL, interval, timeout, onProgress }
    );
  }
}

module.exports = { Videos };
