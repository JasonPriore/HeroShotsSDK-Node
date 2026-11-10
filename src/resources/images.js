"use strict";

const { Resource, compact, takeOptions } = require("./base");
const polling = require("../polling");

// Extra image URL fields resolved (local path -> upload) with their folder.
const IMAGE_URL_FIELDS = [
  ["background_image_url", "background"],
  ["body_posture_image_url", "body_posture"],
  ["hairstyle_reference_image_url", "references"],
  ["text_detail_image_url", "products"],
  ["worn_scale_reference_url", "references"]
];

function normalizeSubjectPayload(subjectImageUrl, payload) {
  if (subjectImageUrl && typeof subjectImageUrl === "object" && !Array.isArray(subjectImageUrl)) {
    return [null, subjectImageUrl];
  }
  return [subjectImageUrl, payload || {}];
}

/** Image generation (API key or portal JWT on /api/v1; candidates flow). */
class Images extends Resource {
  /**
   * POST /api/v1/image/generate (async) -> `{generation_id, status, ...}`.
   *
   * Provide `subjectImageUrl` or `avatar_id` (`avatar_image_set`: original |
   * generated) unless `still_life: true`. Local file paths are auto-uploaded
   * (portal JWT only).
   */
  async generate(productImageUrl, subjectImageUrl = null, payload = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    return this._post("/api/v1/image/generate", { json: body });
  }

  /** POST /api/v1/background/generate -> AI background image (`size`: 2K | 4K). */
  generateBackground(prompt, options = {}) {
    const [named, payload] = takeOptions(options, ["aspect_ratio", "size", "async_generation"]);
    const body = compact({ prompt, ...named, ...payload });
    return this._post("/api/v1/background/generate", { json: body });
  }

  /** POST /api/auth/image/generate/candidates -> persistent candidate batch (portal JWT). */
  async candidates(productImageUrl, subjectImageUrl = null, payload = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    return this._post("/api/auth/image/generate/candidates", { json: body });
  }

  /** POST /api/auth/image/generate/candidates/{token}/select (portal JWT). */
  selectCandidate(token, payload = {}) {
    return this._post(`/api/auth/image/generate/candidates/${token}/select`, { json: payload });
  }

  /** GET /api/v1/image/status/{generationId}. */
  status(generationId) {
    return this._get(`/api/v1/image/status/${generationId}`);
  }

  /** Poll image status until `succeeded`/`failed`. */
  wait(generationId, { interval = 3.0, timeout = 600.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(generationId),
      { terminalOk: polling.MEDIA_OK, terminalFail: polling.MEDIA_FAIL, interval, timeout, onProgress }
    );
  }

  /**
   * GET /api/v1/image/{logId}/download -> image Buffer (or saved to `dest`).
   * Same watermark and resolution as at generation time.
   */
  download(logId, dest = null) {
    return this._client.download(`/api/v1/image/${logId}/download`, dest);
  }

  // -- usage rights -----------------------------------------------------------

  /**
   * Quote a usage-rights upgrade for an image -> `{delta_eur, new_total_eur, ...}`.
   *
   * Pass a `usageRights` array (POST body) or a single `usage_rights_type`
   * (organic | paid_digital | broadcast) + `usage_rights_duration`
   * (4_weeks | 6_months | 2_years | perpetual) as options (GET query).
   */
  usageRightsQuote(logId, usageRights = null, options = {}) {
    if (usageRights && typeof usageRights === "object" && !Array.isArray(usageRights)) {
      options = usageRights;
      usageRights = null;
    }
    const path = `/api/v1/image/${logId}/usage-rights/quote`;
    if (usageRights !== null && usageRights !== undefined) {
      return this._post(path, { json: { usage_rights: usageRights } });
    }
    const [named] = takeOptions(options, ["usage_rights_type", "usage_rights_duration"]);
    const params = compact(named);
    return this._get(path, { params: Object.keys(params).length ? params : null });
  }

  /** POST /api/v1/image/{logId}/usage-rights/upgrade -> charges the difference. */
  usageRightsUpgrade(logId, usageRights) {
    return this._post(`/api/v1/image/${logId}/usage-rights/upgrade`, { json: { usage_rights: usageRights } });
  }

  /**
   * POST /api/v1/image/analyze-edit-region -> `{edit_prompt}` for a cropped area.
   * `cropImage` is a data URI or URL of the area; `feedback` what should change.
   */
  analyzeEditRegion(cropImage, feedback) {
    return this._post("/api/v1/image/analyze-edit-region", {
      json: { crop_image: cropImage, feedback }
    });
  }

  // -- internal -------------------------------------------------------------

  async _imageBody(productImageUrl, subjectImageUrl, payload) {
    const [subject, bodyPayload] = normalizeSubjectPayload(subjectImageUrl, payload);
    const body = {
      ...bodyPayload,
      product_image_url: await this._resolveImage(productImageUrl, "products")
    };
    if (subject !== null && subject !== undefined) {
      body.subject_image_url = await this._resolveImage(subject, "subjects");
    }
    for (const [key, folder] of IMAGE_URL_FIELDS) {
      if (key in body) {
        body[key] = await this._resolveImage(body[key], folder);
      }
    }
    if (Array.isArray(body.additional_product_image_urls)) {
      const resolved = [];
      for (const url of body.additional_product_image_urls) {
        resolved.push(await this._resolveImage(url, "products"));
      }
      body.additional_product_image_urls = resolved;
    }
    return body;
  }
}

module.exports = { Images };
