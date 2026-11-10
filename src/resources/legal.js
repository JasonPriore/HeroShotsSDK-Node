"use strict";

/**
 * BYO compliance documents (portal JWT only, /api/legal/byo).
 *
 * Real-person ("bring your own") avatars need the company manleva (once per
 * brand) and a signed liberatoria + identity document for each person.
 */

const { Resource, compact, takeOptions, toInt } = require("./base");

class Legal extends Resource {
  /** GET /api/legal/byo/status -> manleva status and `can_create_byo`. */
  byoStatus() {
    return this._get("/api/legal/byo/status");
  }

  /** GET /api/legal/byo/template -> company manleva template (DOCX Buffer, or saved to `dest`). */
  manlevaTemplate(dest = null) {
    return this._client.download("/api/legal/byo/template", dest);
  }

  /** GET /api/legal/byo/liberatoria-template -> per-person liberatoria template (DOCX). */
  liberatoriaTemplate(dest = null) {
    return this._client.download("/api/legal/byo/liberatoria-template", dest);
  }

  /**
   * POST /api/legal/byo/{tenantId}/manleva (multipart) -> signed company manleva.
   * Options: `signed_by_name`, `signed_by_role`, `document_version`,
   * `template_download_reference`.
   */
  async uploadManleva(tenantId, file, options = {}) {
    const [named] = takeOptions(options, [
      "signed_by_name",
      "signed_by_role",
      "document_version",
      "template_download_reference"
    ]);
    const formData = await this._client._multipart([["file", file]], compact(named));
    return this._post(`/api/legal/byo/${tenantId}/manleva`, { formData });
  }

  /**
   * POST /api/legal/byo/{tenantId}/avatars -> attach a signed liberatoria to an avatar.
   *
   * Required: `release_doc_url`, `id_doc_url`, `model_email`, `model_dob`.
   * Upload the signed release and the ID with `client.uploads.consentDocument`
   * first and pass the returned URLs.
   */
  attachLiberatoria(tenantId, avatarId, options = {}) {
    const [named, payload] = takeOptions(options, ["release_doc_url", "id_doc_url", "model_email", "model_dob"]);
    const body = { avatar_id: toInt(avatarId), ...named, ...payload };
    return this._post(`/api/legal/byo/${tenantId}/avatars`, { json: body });
  }
}

module.exports = { Legal };
