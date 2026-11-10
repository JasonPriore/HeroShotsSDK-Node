"use strict";

const { Resource, compact, takeOptions } = require("./base");

// Photo views accepted by the avatar endpoints.
const VIEW_TYPES = ["closeup", "fullbody", "profile", "back", "profile_left", "profile_right", "mez"];

/** Avatars (API key or portal JWT, /api/v1/avatar). */
class Avatars extends Resource {
  // -- read ---------------------------------------------------------------------

  /**
   * GET /api/v1/avatar/list -> `{avatars, total, page, pages, counts, ...}`.
   *
   * Filters: `gender`, `nationality`, `min_age`, `max_age`, `avatar_type`,
   * `category_id`, `q`, `tab`, `page`, `per_page`.
   */
  list(params = {}) {
    const query = compact(params);
    return this._get("/api/v1/avatar/list", { params: Object.keys(query).length ? query : null });
  }

  /** GET /api/v1/avatar/{id}. */
  get(avatarId) {
    return this._get(`/api/v1/avatar/${avatarId}`);
  }

  /** GET /api/v1/avatar/{id}/consent-document -> signed consent (DOCX Buffer, or saved to `dest`). */
  consentDocument(avatarId, dest = null, { kind = null } = {}) {
    const params = kind ? { kind } : null;
    return this._client.download(`/api/v1/avatar/${avatarId}/consent-document`, dest, { params });
  }

  // -- create ---------------------------------------------------------------------

  /**
   * POST /api/v1/avatar/generate -> new avatar (AI or from `image_url`).
   *
   * AI: `generate_with_ai: true` + `prompt` (and `gender`, `age`,
   * `nationality`, body measurements). Real person: `image_url` plus
   * `release_doc_url`, `id_doc_url`, `model_email`, `model_dob`.
   * Call as `generate(name, payload)` or `generate(payload)`.
   */
  async generate(name = null, payload = {}) {
    if (name && typeof name === "object" && !Array.isArray(name)) {
      payload = name;
      name = null;
    }
    const body = { ...(payload || {}) };
    if (name !== null && name !== undefined) {
      body.name = name;
    }
    if ("image_url" in body) {
      body.image_url = await this._resolveImage(body.image_url, "avatars");
    }
    return this._post("/api/v1/avatar/generate", { json: body });
  }

  /** POST /api/v1/avatar/create-from-steps -> avatar from one photo per view. */
  async createFromSteps(name, imagesByView, payload = {}) {
    const views = {};
    for (const [view, url] of Object.entries(imagesByView || {})) {
      views[view] = await this._resolveImage(url, "avatars");
    }
    return this._post("/api/v1/avatar/create-from-steps", {
      json: { name, images_by_view: views, ...(payload || {}) }
    });
  }

  /** POST /api/v1/avatar/improve-prompt -> `{improved_prompt}`. */
  improvePrompt(prompt, payload = {}) {
    return this._post("/api/v1/avatar/improve-prompt", { json: { prompt, ...(payload || {}) } });
  }

  /** POST /api/v1/avatar/analyze-attributes -> gender/age/nationality inferred from text. */
  analyzeAttributes(prompt) {
    return this._post("/api/v1/avatar/analyze-attributes", { json: { prompt } });
  }

  // -- edit ---------------------------------------------------------------------

  /** PATCH /api/v1/avatar/{id} -> name, age, gender, nationality, measurements... */
  update(avatarId, fields = {}) {
    return this._patch(`/api/v1/avatar/${avatarId}`, { json: fields });
  }

  /** DELETE /api/v1/avatar/{id}. */
  delete(avatarId) {
    return this._delete(`/api/v1/avatar/${avatarId}`);
  }

  /** POST /api/v1/avatar/{id}/upload-view -> add/replace one photo view. */
  async uploadView(avatarId, viewType, imageUrl) {
    return this._post(`/api/v1/avatar/${avatarId}/upload-view`, {
      json: { view_type: viewType, image_url: await this._resolveImage(imageUrl, "avatars") }
    });
  }

  /** POST /api/v1/avatar/{id}/regenerate-view (async, 202). Options: `prompt`, `output_style`. */
  regenerateView(avatarId, viewType, options = {}) {
    const [named] = takeOptions(options, ["prompt", "output_style"]);
    const body = compact({ view_type: viewType, ...named });
    return this._post(`/api/v1/avatar/${avatarId}/regenerate-view`, { json: body });
  }

  /** POST /api/v1/avatar/{id}/regenerate-variants (async, 202). Options: `output_style`. */
  regenerateVariants(avatarId, options = {}) {
    const [named] = takeOptions(options, ["output_style"]);
    return this._post(`/api/v1/avatar/${avatarId}/regenerate-variants`, { json: compact(named) });
  }

  /**
   * POST /api/v1/avatar/{id}/generated-version -> AI version of a photo avatar (async).
   * Options: `prompt`, `extra_reference_urls`, `output_style`.
   */
  generatedVersion(avatarId, options = {}) {
    const [named] = takeOptions(options, ["prompt", "extra_reference_urls", "output_style"]);
    return this._post(`/api/v1/avatar/${avatarId}/generated-version`, { json: compact(named) });
  }

  /** POST /api/v1/avatar/{id}/image-set -> use `original` or `generated` photos. */
  setImageSet(avatarId, mode) {
    return this._post(`/api/v1/avatar/${avatarId}/image-set`, { json: { mode } });
  }

  /** POST /api/v1/avatar/{id}/generate-avatar-sheet (`force: true` regenerates). */
  generateSheet(avatarId, options = {}) {
    const [named] = takeOptions(options, ["force", "prompt", "output_style"]);
    return this._post(`/api/v1/avatar/${avatarId}/generate-avatar-sheet`, { json: compact(named) });
  }

  /** POST /api/v1/avatar/{id}/generate-voice -> avatar voice (async, 202). */
  generateVoice(avatarId, options = {}) {
    const [named] = takeOptions(options, ["generation_note", "force"]);
    return this._post(`/api/v1/avatar/${avatarId}/generate-voice`, { json: compact(named) });
  }

  // -- outfit ---------------------------------------------------------------------

  /** POST /api/v1/avatar/outfit/resolve-link -> product photos behind a shop link. */
  resolveOutfitLink(url) {
    return this._post("/api/v1/avatar/outfit/resolve-link", { json: { url } });
  }

  /** POST /api/v1/avatar/{id}/outfit -> dress the avatar (top, bottom, shoes...). */
  changeOutfit(avatarId, items, options = {}) {
    const [named] = takeOptions(options, ["regenerate_views"]);
    const body = compact({ items, ...named });
    return this._post(`/api/v1/avatar/${avatarId}/outfit`, { json: body });
  }

  /** POST /api/v1/avatar/{id}/outfit/restore -> undo the last outfit change. */
  restoreOutfit(avatarId) {
    return this._post(`/api/v1/avatar/${avatarId}/outfit/restore`, { json: {} });
  }
}

module.exports = { Avatars, VIEW_TYPES };
