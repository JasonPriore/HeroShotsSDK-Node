"use strict";

const { Resource } = require("./base");
const polling = require("../polling");

function normalizeSubjectPayload(subjectImageUrl, payload) {
  if (subjectImageUrl && typeof subjectImageUrl === "object" && !Array.isArray(subjectImageUrl)) {
    return [null, subjectImageUrl];
  }
  return [subjectImageUrl, payload || {}];
}

class Images extends Resource {
  async generate(productImageUrl, subjectImageUrl = null, payload = {}) {
    const [subject, bodyPayload] = normalizeSubjectPayload(subjectImageUrl, payload);
    const body = {
      ...bodyPayload,
      product_image_url: await this._resolveImage(productImageUrl, "products")
    };
    if (subject !== null && subject !== undefined) {
      body.subject_image_url = await this._resolveImage(subject, "subjects");
    }
    return this._post("/api/v1/image/generate", { json: body });
  }

  async candidates(productImageUrl, subjectImageUrl = null, payload = {}) {
    const [subject, bodyPayload] = normalizeSubjectPayload(subjectImageUrl, payload);
    const body = {
      ...bodyPayload,
      product_image_url: await this._resolveImage(productImageUrl, "products")
    };
    if (subject !== null && subject !== undefined) {
      body.subject_image_url = await this._resolveImage(subject, "subjects");
    }
    return this._post("/api/auth/image/generate/candidates", { json: body });
  }

  selectCandidate(token, payload = {}) {
    return this._post(`/api/auth/image/generate/candidates/${token}/select`, { json: payload });
  }

  status(generationId) {
    return this._get(`/api/v1/image/status/${generationId}`);
  }

  download(logId) {
    return this._get(`/api/v1/image/${logId}/download`);
  }

  wait(generationId, { interval = 3.0, timeout = 600.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(generationId),
      { terminalOk: polling.MEDIA_OK, terminalFail: polling.MEDIA_FAIL, interval, timeout, onProgress }
    );
  }
}

module.exports = { Images };
