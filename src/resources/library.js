"use strict";

/** Library: product assets, collections, backgrounds, categories (/api/v1). */

const { Resource, compact, takeOptions, toInt } = require("./base");

function queryOrNull(params) {
  const query = compact(params);
  return Object.keys(query).length ? query : null;
}

/** Product assets (`/api/v1/assets`). */
class Assets extends Resource {
  /** GET /api/v1/assets (optional `category_id` filter). */
  list(options = {}) {
    const [named] = takeOptions(options, ["category_id"]);
    return this._get("/api/v1/assets", { params: queryOrNull(named) });
  }

  /**
   * POST /api/v1/assets (multipart) -> new product asset.
   * `primaryImage` is a path, Buffer or Blob. Options: `category_id`,
   * `product_description`, `product_details`.
   */
  async create(name, primaryImage, options = {}) {
    const [named] = takeOptions(options, ["category_id", "product_description", "product_details"]);
    const fields = compact({ name, ...named });
    const formData = await this._client._multipart([["primary_image", primaryImage]], fields);
    return this._post("/api/v1/assets", { formData });
  }

  /** POST /api/v1/assets/import-amazon -> asset draft from an Amazon product URL. */
  importAmazon(url, options = {}) {
    const [named] = takeOptions(options, ["language_code"]);
    return this._post("/api/v1/assets/import-amazon", { json: compact({ url, ...named }) });
  }

  /** GET /api/v1/assets/{id}. */
  get(assetId) {
    return this._get(`/api/v1/assets/${assetId}`);
  }

  /** PATCH /api/v1/assets/{id} -> name, category_id, product_description... */
  update(assetId, fields = {}) {
    return this._patch(`/api/v1/assets/${assetId}`, { json: fields });
  }

  /** DELETE /api/v1/assets/{id}. */
  delete(assetId) {
    return this._delete(`/api/v1/assets/${assetId}`);
  }

  /** POST /api/v1/assets/{id}/images (multipart `file`) -> extra product photo. */
  async addImage(assetId, file) {
    const formData = await this._client._multipartFile(file);
    return this._post(`/api/v1/assets/${assetId}/images`, { formData });
  }

  /** DELETE /api/v1/assets/{id}/images/{imageId}. */
  removeImage(assetId, imageId) {
    return this._delete(`/api/v1/assets/${assetId}/images/${imageId}`);
  }
}

/** Collections of generations (`/api/v1/collections`). */
class Collections extends Resource {
  /** GET /api/v1/collections. */
  list(params = {}) {
    return this._get("/api/v1/collections", { params: queryOrNull(params) });
  }

  /** POST /api/v1/collections (JSON, or multipart when a `cover` file is given). */
  async create(name, { description = undefined, cover = undefined } = {}) {
    const fields = compact({ name, description });
    if (cover !== undefined && cover !== null) {
      const formData = await this._client._multipart([["cover", cover]], fields);
      return this._post("/api/v1/collections", { formData });
    }
    return this._post("/api/v1/collections", { json: fields });
  }

  /** GET /api/v1/collections/{id}. */
  get(collectionId) {
    return this._get(`/api/v1/collections/${collectionId}`);
  }

  /** PATCH /api/v1/collections/{id} (multipart when a `cover` file is given). */
  async update(collectionId, { name = undefined, description = undefined, cover = undefined } = {}) {
    const fields = compact({ name, description });
    const path = `/api/v1/collections/${collectionId}`;
    if (cover !== undefined && cover !== null) {
      const formData = await this._client._multipart([["cover", cover]], fields);
      return this._patch(path, { formData });
    }
    return this._patch(path, { json: fields });
  }

  /** DELETE /api/v1/collections/{id}. */
  delete(collectionId) {
    return this._delete(`/api/v1/collections/${collectionId}`);
  }

  /** GET /api/v1/collections/{id}/generations. */
  generations(collectionId, params = {}) {
    return this._get(`/api/v1/collections/${collectionId}/generations`, { params: queryOrNull(params) });
  }

  /** POST /api/v1/collections/{id}/generations. */
  addGeneration(collectionId, logId) {
    return this._post(`/api/v1/collections/${collectionId}/generations`, { json: { log_id: toInt(logId) } });
  }

  /** DELETE /api/v1/collections/{id}/generations/{logId}. */
  removeGeneration(collectionId, logId) {
    return this._delete(`/api/v1/collections/${collectionId}/generations/${logId}`);
  }

  /** PATCH /api/v1/collections/{id}/generations/{logId}/move. */
  moveGeneration(collectionId, logId, targetCollectionId) {
    return this._patch(`/api/v1/collections/${collectionId}/generations/${logId}/move`, {
      json: { target_collection_id: toInt(targetCollectionId) }
    });
  }

  /** GET /api/v1/collections/{id}/available-generations (`limit`, `offset`). */
  availableGenerations(collectionId, params = {}) {
    return this._get(`/api/v1/collections/${collectionId}/available-generations`, {
      params: queryOrNull(params)
    });
  }
}

/** Saved background images (`/api/v1/backgrounds`). */
class Backgrounds extends Resource {
  /** GET /api/v1/backgrounds (`limit`, `offset`, `q`). */
  list(params = {}) {
    return this._get("/api/v1/backgrounds", { params: queryOrNull(params) });
  }

  /** POST /api/v1/backgrounds -> save a background from a `file` or `image_url`. */
  async create(options = {}) {
    const [{ file, ...named }] = takeOptions(options, ["file", "name", "source", "prompt", "image_url"]);
    const fields = compact(named);
    if (file !== undefined && file !== null) {
      const formData = await this._client._multipart([["file", file]], fields);
      return this._post("/api/v1/backgrounds", { formData });
    }
    return this._post("/api/v1/backgrounds", { json: fields });
  }

  /** GET /api/v1/backgrounds/{id}. */
  get(backgroundId) {
    return this._get(`/api/v1/backgrounds/${backgroundId}`);
  }

  /** PATCH /api/v1/backgrounds/{id} (e.g. `name`). */
  update(backgroundId, fields = {}) {
    return this._patch(`/api/v1/backgrounds/${backgroundId}`, { json: fields });
  }

  /** DELETE /api/v1/backgrounds/{id}. */
  delete(backgroundId) {
    return this._delete(`/api/v1/backgrounds/${backgroundId}`);
  }
}

/** Product categories (`/api/v1/categories`). */
class Categories extends Resource {
  /** GET /api/v1/categories -> active categories. */
  list() {
    return this._get("/api/v1/categories");
  }

  /** GET /api/v1/categories/selected -> categories chosen for this account. */
  selected() {
    return this._get("/api/v1/categories/selected");
  }

  /** POST /api/v1/categories/selected. */
  setSelected(categoryIds) {
    return this._post("/api/v1/categories/selected", {
      json: { category_ids: Array.from(categoryIds || [], toInt) }
    });
  }
}

module.exports = { Assets, Collections, Backgrounds, Categories };
