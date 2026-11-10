"use strict";

const { Resource, compact, takeOptions } = require("./base");

const FILTERS = ["type", "page", "per_page", "date_from", "date_to", "collection_id", "generated_by_user_id"];

/** Generation history (API key or portal JWT, /api/v1/generations). */
class Generations extends Resource {
  /**
   * GET /api/v1/generations -> `{generations, total, page, per_page, pages}`.
   *
   * Filters: `type` ("image" | "video"), `page`, `per_page`, `date_from`,
   * `date_to`, `collection_id`, `generated_by_user_id` (camelCase accepted).
   * Other keys are forwarded verbatim as query params.
   */
  list(filters = {}) {
    const [named, rest] = takeOptions(filters, FILTERS);
    const query = compact({ ...named, ...rest });
    return this._get("/api/v1/generations", { params: Object.keys(query).length ? query : null });
  }

  /** Async generator yielding every generation across all pages. */
  async *iterate(filters = {}) {
    const [{ per_page: perPage = 50 }, rest] = takeOptions(filters, ["per_page", "page"]);
    let page = 1;
    while (true) {
      const resp = await this.list({ ...rest, page, per_page: perPage ?? 50 });
      for (const item of (resp && resp.generations) || []) {
        yield item;
      }
      const pages = (resp && resp.pages) || 1;
      if (page >= pages) {
        return;
      }
      page += 1;
    }
  }
}

module.exports = { Generations };
