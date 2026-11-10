"use strict";

const { Resource } = require("./base");
const polling = require("../polling");

/** Short video generation (API key or portal JWT, /api/v1/video). */
class Videos extends Resource {
  /**
   * POST /api/v1/video/generate -> `{video_id, status, ...}` (async).
   *
   * Local file paths in `imageUrl`, `product_image_url` and `subject_image_url`
   * are auto-uploaded (portal JWT only).
   */
  async generate(imageUrl = null, payload = {}) {
    if (imageUrl && typeof imageUrl === "object" && !Array.isArray(imageUrl)) {
      payload = imageUrl;
      imageUrl = null;
    }
    const body = { ...(payload || {}) };
    if (imageUrl !== null && imageUrl !== undefined) {
      body.image_url = await this._resolveImage(imageUrl, "products");
    }
    for (const [key, folder] of [["product_image_url", "products"], ["subject_image_url", "subjects"]]) {
      if (key in body) {
        body[key] = await this._resolveImage(body[key], folder);
      }
    }
    return this._post("/api/v1/video/generate", { json: body });
  }

  /** GET /api/v1/video/status/{taskId} -> `{status, video_url, ...}`. */
  status(taskId, { provider = null } = {}) {
    const params = provider ? { provider } : null;
    return this._get(`/api/v1/video/status/${taskId}`, { params });
  }

  /** Poll video status until `succeeded`/`failed` -> payload with `video_url`. */
  wait(taskId, { interval = 5.0, timeout = 900.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(taskId),
      { terminalOk: polling.MEDIA_OK, terminalFail: polling.MEDIA_FAIL, interval, timeout, onProgress }
    );
  }

  /** GET /api/v1/video/{logId}/download -> MP4 Buffer (or saved to `dest`). */
  download(logId, dest = null) {
    return this._client.download(`/api/v1/video/${logId}/download`, dest);
  }
}

module.exports = { Videos };
