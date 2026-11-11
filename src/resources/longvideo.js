"use strict";

const { Resource, compact } = require("./base");
const polling = require("../polling");
const { ProviderError } = require("../errors");

// The job pauses here when every segment is rendered: the clips are ready
// (`segments[].video_url`) and the final cut is made by `export()`.
const SEGMENTS_READY = "segments_ready";
const WAIT_OK = [...polling.STORYBOARD_OK, SEGMENTS_READY];

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

  /**
   * POST /api/auth/long-video/{jobId}/export -> joins the clips into `final_video_url`.
   *
   * Portal JWT only. Needs every segment done (`segments_ready` or `done`).
   * `segment_order` (1-based indexes) reorders the clips. Not billed.
   */
  export(jobId, { segment_order = undefined, segmentOrder = undefined, timeline = undefined } = {}) {
    const body = compact({ segment_order: segment_order ?? segmentOrder, timeline });
    return this._post(`/api/auth/long-video/${jobId}/export`, { json: body });
  }

  /** GET /api/auth/long-video/view/{token} (share link payload, portal JWT). */
  view(token) {
    return this._get(`/api/auth/long-video/view/${token}`);
  }

  /**
   * Poll until the clips are ready (`segments_ready`), `done` or `failed`.
   *
   * At `segments_ready` every `segments[i].video_url` is set but `final_video_url`
   * is still empty: call `export()` (or use `render()`) to get the joined video.
   * Dubbed jobs go straight to `done`.
   */
  wait(jobId, { interval = 5.0, timeout = 1800.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(jobId),
      { terminalOk: WAIT_OK, terminalFail: polling.STORYBOARD_FAIL, interval, timeout, onProgress }
    );
  }

  /**
   * Wait for the clips, export them and wait for `final_video_url` (portal JWT).
   * Resolves with the final status payload (`status === "done"`).
   */
  async render(jobId, {
    segment_order = undefined,
    segmentOrder = undefined,
    interval = 5.0,
    timeout = 2400.0,
    onProgress = null
  } = {}) {
    const deadline = Date.now() + timeout * 1000;
    let job = await this.wait(jobId, { interval, timeout, onProgress });
    if (String(job.status).toLowerCase() === "done" && job.final_video_url) {
      return job;
    }
    await this.export(jobId, { segment_order: segment_order ?? segmentOrder });
    while (true) {
      job = await this.status(jobId);
      if (onProgress) {
        onProgress(job);
      }
      const status = String(job?.status || "").toLowerCase();
      if (status === "done" && job.final_video_url) {
        return job;
      }
      if (polling.STORYBOARD_FAIL.includes(status)) {
        throw new ProviderError(String(job.error || `long video ${status}`), { code: "provider_error" });
      }
      if (Date.now() >= deadline) {
        throw new polling.TimeoutError(
          `long video export did not finish within ${timeout}s (last status=${JSON.stringify(status)})`
        );
      }
      if (interval > 0) {
        await polling.sleep(interval);
      }
    }
  }
}

module.exports = { LongVideo, SEGMENTS_READY };
