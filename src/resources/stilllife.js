"use strict";

const { Resource } = require("./base");
const polling = require("../polling");

class StillLife extends Resource {
  async start(productUrl, backgroundUrl, {
    custom_prompt = undefined,
    customPrompt = undefined,
    ratio = "16:9",
    resolution = "1080p",
    duration_seconds = 5,
    durationSeconds = undefined,
    ...payload
  } = {}) {
    const body = {
      product_url: await this._resolveImage(productUrl, "products"),
      background_url: await this._resolveImage(backgroundUrl, "background"),
      ratio,
      resolution,
      duration_seconds: durationSeconds ?? duration_seconds,
      ...payload
    };
    const prompt = custom_prompt ?? customPrompt;
    if (prompt !== undefined) {
      body.custom_prompt = prompt;
    }
    return this._post("/api/auth/stilllife-video/start", { json: body });
  }

  status(taskId) {
    return this._get(`/api/auth/stilllife-video/status/${taskId}`);
  }

  wait(taskId, { interval = 5.0, timeout = 900.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(taskId),
      { terminalOk: polling.MEDIA_OK, terminalFail: polling.MEDIA_FAIL, interval, timeout, onProgress }
    );
  }

  previewBackground(taskId, payload = {}) {
    return this._post(`/api/auth/stilllife-video/${taskId}/preview-background`, { json: payload });
  }

  changeBackground(taskId, payload = {}) {
    return this._post(`/api/auth/stilllife-video/${taskId}/change-background`, { json: payload });
  }

  changeBackgroundStatus(taskId) {
    return this._get(`/api/auth/stilllife-video/${taskId}/change-background/status`);
  }
}

module.exports = { StillLife };
