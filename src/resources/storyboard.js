"use strict";

const { Resource } = require("./base");
const polling = require("../polling");

const DURATIONS = [6, 8, 12, 15, 30, 45, 60];

class Storyboard extends Resource {
  async briefSuggestions(productImageUrl = null, subjectImageUrl = null, payload = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    const response = await this._post("/video/storyboard/brief-suggestions", { json: body });
    return response && typeof response === "object" && "suggestions" in response ? response.suggestions : response;
  }

  async candidates(customPrompt, durationSeconds, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = false,
    asyncStoryboard = undefined,
    ...payload
  } = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    body.custom_prompt = customPrompt;
    body.duration_seconds = durationSeconds;
    if (asyncStoryboard ?? async_storyboard) {
      body.async_storyboard = true;
    }
    const response = await this._post("/video/storyboard/candidates", { json: body });
    return response && typeof response === "object" && "candidates" in response ? response.candidates : response;
  }

  async generate(customPrompt, durationSeconds, selectedCandidate = null, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = true,
    asyncStoryboard = undefined,
    defer_reference_frames = true,
    deferReferenceFrames = undefined,
    ...payload
  } = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    body.custom_prompt = customPrompt;
    body.duration_seconds = durationSeconds;
    body.async_storyboard = asyncStoryboard ?? async_storyboard;
    body.defer_reference_frames = deferReferenceFrames ?? defer_reference_frames;
    if (selectedCandidate !== null && selectedCandidate !== undefined) {
      body.selected_candidate = selectedCandidate;
    }
    return this._post("/video/storyboard", { json: body });
  }

  async frames(storyboard, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = true,
    asyncStoryboard = undefined,
    ...payload
  } = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    body.storyboard = storyboard;
    body.async_storyboard = asyncStoryboard ?? async_storyboard;
    return this._post("/video/storyboard/frames", { json: body });
  }

  revise(revisionRequest, customPrompt, durationSeconds, storyboard, payload = {}) {
    const body = {
      revision_request: revisionRequest,
      custom_prompt: customPrompt,
      duration_seconds: durationSeconds,
      storyboard,
      ...payload
    };
    return this._post("/video/storyboard/revise", { json: body });
  }

  status(jobId) {
    return this._get(`/video/storyboard/status/${jobId}`);
  }

  wait(jobId, { interval = 3.0, timeout = 300.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(jobId),
      { terminalOk: polling.STORYBOARD_OK, terminalFail: polling.STORYBOARD_FAIL, interval, timeout, onProgress }
    );
  }

  subjectMeasurements(payload = {}) {
    return this._post("/subject/estimate-measurements", { json: payload });
  }

  analyzeProduct(payload = {}) {
    return this._post("/product/analyze", { json: payload });
  }

  creativity(payload = {}) {
    return this._post("/creativity/generate", { json: payload });
  }

  async _imageBody(productImageUrl, subjectImageUrl, payload) {
    const body = { ...(payload || {}) };
    if (productImageUrl !== null && productImageUrl !== undefined) {
      body.product_image_url = await this._resolveImage(productImageUrl, "products");
    }
    if (subjectImageUrl !== null && subjectImageUrl !== undefined) {
      body.subject_image_url = await this._resolveImage(subjectImageUrl, "subjects");
    }
    if (body.image_url) {
      body.image_url = await this._resolveImage(body.image_url, "references");
    }
    return body;
  }
}

module.exports = { Storyboard, DURATIONS };
