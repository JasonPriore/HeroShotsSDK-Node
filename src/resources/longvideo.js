"use strict";

const { Resource, compact } = require("./base");
const polling = require("../polling");

/** Long / multi-segment video (API key or portal JWT, /api/v1/long-video). */
class LongVideo extends Resource {
  /**
   * POST /api/v1/long-video/start -> `{job_id, status, segment_count, ...}`.
   *
   * Provide `imageUrl` (local paths auto-upload with a portal JWT) or
   * `image_generation_id` / `product_image_url` + `subject_image_url`.
   * `duration_seconds` is 30, 45 or 60. Pass a `storyboard` produced by
   * `client.storyboard` to drive a planned multi-segment render.
   */
  async start(imageUrl = null, {
    custom_prompt = undefined,
    customPrompt = undefined,
    storyboard = undefined,
    duration_seconds = undefined,
    durationSeconds = undefined,
    ratio = "16:9",
    resolution = "1080p",
    ...payload
  } = {}) {
    const body = { ratio, resolution, ...payload };
    if (imageUrl !== null && imageUrl !== undefined) {
      body.image_url = await this._resolveImage(imageUrl, "products");
    }
    Object.assign(body, compact({
      custom_prompt: custom_prompt ?? customPrompt,
      storyboard,
      duration_seconds: duration_seconds ?? durationSeconds
    }));
    return this._post("/api/v1/long-video/start", { json: body });
  }

  /** GET /api/v1/long-video/status/{jobId} -> segments + `final_video_url`. */
  status(jobId) {
    return this._get(`/api/v1/long-video/status/${jobId}`);
  }

  /**
   * POST /api/v1/long-video/{jobId}/segments/{segmentIndex}/regenerate.
   *
   * `comment` tells the model what to change; `cascade: true` also re-renders
   * the following segments so they stay continuous.
   */
  regenerateSegment(jobId, segmentIndex, { comment = undefined, cascade = undefined } = {}) {
    const body = compact({ comment, cascade });
    return this._post(`/api/v1/long-video/${jobId}/segments/${segmentIndex}/regenerate`, { json: body });
  }

  /** GET /api/auth/long-video/view/{token} (share link payload, portal JWT). */
  view(token) {
    return this._get(`/api/auth/long-video/view/${token}`);
  }

  /** Poll until `done`/`failed` -> payload with `final_video_url`. */
  wait(jobId, { interval = 5.0, timeout = 1800.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(jobId),
      { terminalOk: polling.STORYBOARD_OK, terminalFail: polling.STORYBOARD_FAIL, interval, timeout, onProgress }
    );
  }
}

module.exports = { LongVideo };
