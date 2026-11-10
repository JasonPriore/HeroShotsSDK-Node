"use strict";

/**
 * Bulk image generation (API key or portal JWT, /api/v1/bulk).
 *
 * Flow: `create` -> `uploadImages` (one item per product photo) -> `start`
 * -> `wait` -> `downloadGenerated` (zip) or per-item `downloadItem`.
 */

const { Resource, compact, takeOptions } = require("./base");
const polling = require("../polling");

const BULK_DONE = ["completed", "partially_completed", "failed"];

class Bulk extends Resource {
  /** GET /api/v1/bulk -> your bulks. */
  list() {
    return this._get("/api/v1/bulk");
  }

  /** POST /api/v1/bulk -> new draft bulk (`prompt`, `avatar_id`, ...). */
  create(fields = {}) {
    const [named, rest] = takeOptions(fields, ["prompt", "avatar_id"]);
    return this._post("/api/v1/bulk", { json: compact({ ...named, ...rest }) });
  }

  /** GET /api/v1/bulk/{id} -> status, progress and items. */
  get(bulkId) {
    return this._get(`/api/v1/bulk/${bulkId}`);
  }

  /** PATCH /api/v1/bulk/{id} -> prompt, avatar_id, view_type, avatar_image_set... */
  update(bulkId, fields = {}) {
    return this._patch(`/api/v1/bulk/${bulkId}`, { json: fields });
  }

  /** DELETE /api/v1/bulk/{id}. */
  delete(bulkId) {
    return this._delete(`/api/v1/bulk/${bulkId}`);
  }

  /**
   * POST /api/v1/bulk/{id}/images (multipart `files`) -> `{uploaded, items}`.
   * `files` is an array of paths, Buffers or Blobs.
   */
  async uploadImages(bulkId, files) {
    const parts = Array.from(files || [], (file) => ["files", file, "image"]);
    const formData = await this._client._multipart(parts);
    return this._post(`/api/v1/bulk/${bulkId}/images`, { formData });
  }

  /** DELETE /api/v1/bulk/{id}/items/{itemId}. */
  removeItem(bulkId, itemId) {
    return this._delete(`/api/v1/bulk/${bulkId}/items/${itemId}`);
  }

  /** POST /api/v1/bulk/{id}/items/{itemId}/replace-product (multipart `file`). */
  async replaceProduct(bulkId, itemId, file) {
    const formData = await this._client._multipartFile(file);
    return this._post(`/api/v1/bulk/${bulkId}/items/${itemId}/replace-product`, { formData });
  }

  /** POST /api/v1/bulk/{id}/start -> begins generation for every item. */
  start(bulkId) {
    return this._post(`/api/v1/bulk/${bulkId}/start`);
  }

  /** POST /api/v1/bulk/{id}/items/{itemId}/cancel. */
  cancelItem(bulkId, itemId) {
    return this._post(`/api/v1/bulk/${bulkId}/items/${itemId}/cancel`);
  }

  /**
   * POST /api/v1/bulk/{id}/items/{itemId}/regenerate.
   * Options: `prompt_override`, `verify_until_ok`, `refine_last`.
   */
  regenerateItem(bulkId, itemId, options = {}) {
    const [named] = takeOptions(options, ["prompt_override", "verify_until_ok", "refine_last"]);
    return this._post(`/api/v1/bulk/${bulkId}/items/${itemId}/regenerate`, { json: compact(named) });
  }

  /** POST /api/v1/bulk/{id}/regenerate-all. */
  regenerateAll(bulkId) {
    return this._post(`/api/v1/bulk/${bulkId}/regenerate-all`);
  }

  /** GET /api/v1/bulk/{id}/items/previews -> base64 previews per item. */
  previews(bulkId) {
    return this._get(`/api/v1/bulk/${bulkId}/items/previews`);
  }

  /** GET /api/v1/bulk/{id}/items/{itemId}/attempts. */
  attempts(bulkId, itemId) {
    return this._get(`/api/v1/bulk/${bulkId}/items/${itemId}/attempts`);
  }

  /** POST /api/v1/bulk/{id}/items/{itemId}/attempts/select -> make it the official result. */
  selectAttempt(bulkId, itemId, attemptIndex) {
    return this._post(`/api/v1/bulk/${bulkId}/items/${itemId}/attempts/select`, {
      json: { attempt_index: attemptIndex }
    });
  }

  /** GET /api/v1/bulk/{id}/items/{itemId}/download-product -> uploaded product image. */
  downloadProduct(bulkId, itemId, dest = null) {
    return this._client.download(`/api/v1/bulk/${bulkId}/items/${itemId}/download-product`, dest);
  }

  /** GET /api/v1/bulk/{id}/items/{itemId}/download -> generated image. */
  downloadItem(bulkId, itemId, dest = null) {
    return this._client.download(`/api/v1/bulk/${bulkId}/items/${itemId}/download`, dest);
  }

  /** GET /api/v1/bulk/{id}/download-generated -> zip of generated images (`item_ids` filter). */
  downloadGenerated(bulkId, dest = null, options = {}) {
    if (dest && typeof dest === "object" && !Buffer.isBuffer(dest)) {
      options = dest;
      dest = null;
    }
    const [{ item_ids: itemIds }] = takeOptions(options, ["item_ids"]);
    const ids = typeof itemIds === "string" ? [itemIds].filter(Boolean) : itemIds ? Array.from(itemIds, String) : [];
    const params = ids.length ? { item_ids: ids.join(",") } : null;
    return this._client.download(`/api/v1/bulk/${bulkId}/download-generated`, dest, { params });
  }

  /**
   * Poll until the bulk is `completed`, `partially_completed` or `failed`.
   *
   * Unlike single jobs, a failed bulk is returned (not thrown): check `status`
   * and the per-item results.
   */
  async wait(bulkId, { interval = 10.0, timeout = 3600.0, onProgress = null } = {}) {
    const deadline = Date.now() + timeout * 1000;
    while (true) {
      const bulk = await this.get(bulkId);
      if (onProgress) {
        onProgress(bulk);
      }
      const status = String(bulk?.status || "").toLowerCase();
      if (BULK_DONE.includes(status)) {
        return bulk;
      }
      if (Date.now() >= deadline) {
        throw new polling.TimeoutError(
          `bulk did not finish within ${timeout}s (last status=${JSON.stringify(status)})`
        );
      }
      if (interval > 0) {
        await polling.sleep(interval);
      }
    }
  }
}

module.exports = { Bulk, BULK_DONE };
