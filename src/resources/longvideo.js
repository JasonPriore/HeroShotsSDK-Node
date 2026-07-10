"use strict";

const { Resource } = require("./base");
const polling = require("../polling");

class LongVideo extends Resource {
  async start(imageUrl = null, {
    custom_prompt = undefined,
    customPrompt = undefined,
    storyboard = undefined,
    ratio = "16:9",
    resolution = "1080p",
    ...payload
  } = {}) {
    const body = { ratio, resolution, ...payload };
    if (imageUrl !== null && imageUrl !== undefined) {
      body.image_url = await this._resolveImage(imageUrl, "products");
    }
    const prompt = custom_prompt ?? customPrompt;
    if (prompt !== undefined) {
      body.custom_prompt = prompt;
    }
    if (storyboard !== undefined) {
      body.storyboard = storyboard;
    }
    return this._post("/api/auth/long-video/start", { json: body });
  }

  status(jobId) {
    return this._get(`/api/auth/long-video/status/${jobId}`);
  }

  view(token) {
    return this._get(`/api/auth/long-video/view/${token}`);
  }

  wait(jobId, { interval = 5.0, timeout = 1800.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(jobId),
      { terminalOk: polling.STORYBOARD_OK, terminalFail: polling.STORYBOARD_FAIL, interval, timeout, onProgress }
    );
  }
}

module.exports = { LongVideo };
