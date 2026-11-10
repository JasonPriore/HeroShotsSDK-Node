"use strict";

/**
 * Agency: managed brands (agency API key or JWT, /api/v1/agency).
 *
 * To generate *as* a managed brand, set `managedUserId` on the client
 * (`client.withManagedUser(...)`) and call the normal resources.
 */

const { Resource, compact, takeOptions } = require("./base");

const BASE = "/api/v1/agency/managed-clients";

class Agency extends Resource {
  /** GET /api/v1/agency/managed-clients -> `{clients: [...]}`. */
  clients() {
    return this._get(BASE);
  }

  /** GET /api/v1/agency/managed-clients/{id} -> relationship, wallet, generations. */
  client(relationshipId) {
    return this._get(`${BASE}/${relationshipId}`);
  }

  /**
   * POST /api/v1/agency/managed-clients/invite -> invite a brand by email.
   * Optional markup terms: `markup_terms` or the flat `image_fixed`,
   * `image_pct`, `video_short_fixed`... fields.
   */
  inviteClient(inviteEmail, terms = {}) {
    return this._post(`${BASE}/invite`, { json: { invite_email: inviteEmail, ...(terms || {}) } });
  }

  /** POST /api/v1/agency/managed-clients/direct -> create a brand without invite. */
  createClient(companyName, companyCountry, legalConsents, options = {}) {
    const [named, terms] = takeOptions(options, ["vat_number"]);
    const body = compact({
      company_name: companyName,
      company_country: companyCountry,
      legal_consents: legalConsents,
      vat_number: named.vat_number,
      ...terms
    });
    return this._post(`${BASE}/direct`, { json: body });
  }

  /** PATCH /api/v1/agency/managed-clients/{id} (`access_mode`: autonomous | read_only). */
  updateClient(relationshipId, options = {}) {
    const [named] = takeOptions(options, ["access_mode"]);
    return this._patch(`${BASE}/${relationshipId}`, { json: { access_mode: named.access_mode } });
  }

  /** POST /api/v1/agency/managed-clients/{id}/resend-invite. */
  resendInvite(relationshipId) {
    return this._post(`${BASE}/${relationshipId}/resend-invite`);
  }

  /** POST /api/v1/agency/managed-clients/{id}/claim-invite -> portal access link. */
  claimInvite(relationshipId, inviteEmail) {
    return this._post(`${BASE}/${relationshipId}/claim-invite`, { json: { invite_email: inviteEmail } });
  }

  /** POST /api/v1/agency/managed-clients/{id}/topup -> move EUR from the agency wallet. */
  topup(relationshipId, amount) {
    return this._post(`${BASE}/${relationshipId}/topup`, { json: { amount } });
  }

  /** POST /api/v1/agency/managed-clients/{id}/termination. */
  requestTermination(relationshipId, reason) {
    return this._post(`${BASE}/${relationshipId}/termination`, { json: { reason } });
  }

  /** POST /api/v1/agency/managed-clients/{id}/termination/respond. */
  respondTermination(relationshipId, accept, { reason = undefined } = {}) {
    const body = compact({ accept: Boolean(accept), response_reason: reason });
    return this._post(`${BASE}/${relationshipId}/termination/respond`, { json: body });
  }

  /** POST /api/v1/agency/managed-clients/{id}/termination/cancel. */
  cancelTermination(relationshipId) {
    return this._post(`${BASE}/${relationshipId}/termination/cancel`);
  }
}

module.exports = { Agency };
