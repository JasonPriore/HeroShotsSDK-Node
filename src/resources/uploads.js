"use strict";

const { Resource } = require("./base");

// Allowed upload folders (backend sensitive_uploads.py).
const FOLDERS = [
  "subjects",
  "products",
  "avatars",
  "avatar-consents",
  "references",
  "background",
  "body_posture",
  "reference-videos"
];

/** File uploads -> hosted URLs (portal JWT only). */
class Uploads extends Resource {
  /**
   * POST /upload/image (multipart `file`) -> `{public_url, filename, folder}`.
   *
   * `file` is a path, Buffer or Blob; `folder` one of FOLDERS (or omitted).
   */
  async image(file, folder = null) {
    const formData = await this._client._multipart([["file", file]], { folder: folder || null });
    return this._post("/upload/image", { formData });
  }

  /**
   * Upload a signed release or ID document (PDF, DOCX, JPEG, PNG, WebP).
   *
   * Stored privately and bound to your account; pass the returned URL as
   * `release_doc_url` / `id_doc_url`.
   */
  consentDocument(file) {
    return this.image(file, "avatar-consents");
  }

  /** POST /upload/reference-audio -> hosted MP3/WAV for video lip-sync. */
  async referenceAudio(file) {
    const formData = await this._client._multipartFile(file);
    return this._post("/upload/reference-audio", { formData });
  }
}

module.exports = { Uploads, FOLDERS };
