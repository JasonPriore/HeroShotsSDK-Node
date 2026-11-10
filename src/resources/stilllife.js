"use strict";

const { Resource, compact } = require("./base");
const polling = require("../polling");

/** Still-life product video (API key or portal JWT, /api/v1/stilllife-video). */
class StillLife extends Resource {
  /**
   * POST /api/v1/stilllife-video/start -> `{task_id, status, ...}`.
   *
   * `productUrl` and `backgroundUrl` are required (local paths auto-upload
   * with a portal JWT).
   */
  async start(productUrl, backgroundUrl, {
    custom_prompt = undefined,
    customPrompt = undefined,
    detail_image_url = undefined,
    detailImageUrl = undefined,
    reference_video_url = undefined,
    referenceVideoUrl = undefined,
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
    Object.assign(body, compact({
      custom_prompt: custom_prompt ?? customPrompt,
      detail_image_url: await this._resolveImage(detail_image_url ?? detailImageUrl, "products"),
      reference_video_url: reference_video_url ?? referenceVideoUrl
    }));
    return this._post("/api/v1/stilllife-video/start", { json: body });
  }

  /** GET /api/v1/stilllife-video/status/{taskId}. */
  status(taskId) {
    return this._get(`/api/v1/stilllife-video/status/${taskId}`);
  }

  /** Poll until terminal -> payload with the finished video URL. */
  wait(taskId, { interval = 5.0, timeout = 900.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(taskId),
      { terminalOk: polling.MEDIA_OK, terminalFail: polling.MEDIA_FAIL, interval, timeout, onProgress }
    );
  }

  // -- background edits (portal JWT only) ------------------------------------

  /** POST /api/auth/stilllife-video/{taskId}/preview-background (portal JWT). */
  previewBackground(taskId, payload = {}) {
    return this._post(`/api/auth/stilllife-video/${taskId}/preview-background`, { json: payload });
  }

  /** POST /api/auth/stilllife-video/{taskId}/change-background (portal JWT). */
  changeBackground(taskId, payload = {}) {
    return this._post(`/api/auth/stilllife-video/${taskId}/change-background`, { json: payload });
  }

  /** GET /api/auth/stilllife-video/{taskId}/change-background/status (portal JWT). */
  changeBackgroundStatus(taskId) {
    return this._get(`/api/auth/stilllife-video/${taskId}/change-background/status`);
  }
}

module.exports = { StillLife };
