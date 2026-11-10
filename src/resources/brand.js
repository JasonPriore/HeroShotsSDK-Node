"use strict";

const { Resource, compact } = require("./base");

/** Brand side of an agency relationship (brand API key or JWT, /api/v1/brand). */
class Brand extends Resource {
  /** POST /api/v1/brand/manager-invite/{token}/accept. */
  acceptManagerInvite(token) {
    return this._post(`/api/v1/brand/manager-invite/${token}/accept`);
  }

  /** POST /api/v1/brand/manager-invite/{token}/reject. */
  rejectManagerInvite(token) {
    return this._post(`/api/v1/brand/manager-invite/${token}/reject`);
  }

  /** GET /api/v1/brand/manager-relationship -> current managing agency, if any. */
  managerRelationship() {
    return this._get("/api/v1/brand/manager-relationship");
  }

  /** GET /api/v1/brand/manager-relationships -> relationship history. */
  managerRelationships() {
    return this._get("/api/v1/brand/manager-relationships");
  }

  /** POST /api/v1/brand/manager-relationship/termination. */
  requestTermination(reason) {
    return this._post("/api/v1/brand/manager-relationship/termination", { json: { reason } });
  }

  /** POST /api/v1/brand/manager-relationship/termination/respond. */
  respondTermination(accept, { reason = undefined } = {}) {
    const body = compact({ accept: Boolean(accept), response_reason: reason });
    return this._post("/api/v1/brand/manager-relationship/termination/respond", { json: body });
  }

  /** POST /api/v1/brand/manager-relationship/termination/cancel. */
  cancelTermination() {
    return this._post("/api/v1/brand/manager-relationship/termination/cancel");
  }
}

module.exports = { Brand };
