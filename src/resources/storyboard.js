"use strict";

/**
 * StudioHero storyboard intelligence (portal JWT only).
 *
 * This is the creative brain the web app uses: brief suggestions -> selectable
 * candidates (+ the recommended one) -> full storyboard (async) -> deferred 4K
 * reference frames (async) -> optional board / revision. Feed the resulting
 * storyboard into `client.longvideo.startFromStoryboard` (the portal's render).
 *
 * Request fields the portal sends with every storyboard call (pass them in the
 * final payload object, they are forwarded verbatim):
 *
 * - `video_type`: "ugc" | "cinema" | "spot_tv" | "sas_software"
 * - `ugc_style`: "amateur" | "top_creator"
 * - `look_mode`: "current" (keep the subject's outfit) or "custom" with
 *   `look_description`
 * - `ratio`, `resolution`, `language_code` (default "it"), `still_life`,
 *   `reference_video_url`, `video_provider`
 * - `storyboard_reference_frames_required` / `storyboard_board_required`: whether
 *   the 4K reference frames / the storyboard board are part of the flow
 * - inputs: `product_image_url`, `subject_image_url`, `avatar_id` +
 *   `avatar_view_type` (a real view: `fullbody`, `mezzo_busto`, `closeup`...),
 *   `avatar_image_set`, `additional_product_image_urls`, `background_image_url`,
 *   `body_posture_image_url`, `brand_logo_url` + `brand_logo_mode`
 *   (`in_video` | `end_only` | `off`), `product_box_closed_url` /
 *   `product_box_open_url`, `extra_products` (`[{image_url, box_closed_url?,
 *   box_open_url?}]`)
 */

const { Resource } = require("./base");
const polling = require("../polling");
const studiohero = require("../studiohero");
const { ValidationError } = require("../errors");

const DURATIONS = [6, 8, 12, 15, 30, 45, 60];
const RECOMMEND_KINDS = ["brief", "concept"];

class Storyboard extends Resource {
  /**
   * POST /video/storyboard/brief-suggestions -> list of `{title, brief, pros, cons}`.
   *
   * Pass `suggestion.brief` as `customPrompt` to `candidates()`.
   */
  async briefSuggestions(productImageUrl = null, subjectImageUrl = null, payload = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    const response = await this._post("/video/storyboard/brief-suggestions", { json: body });
    return response && typeof response === "object" && "suggestions" in response ? response.suggestions : response;
  }

  async candidates(customPrompt, durationSeconds, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = false,
    asyncStoryboard = undefined,
    ...payload
  } = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    body.custom_prompt = customPrompt;
    body.duration_seconds = durationSeconds;
    if (asyncStoryboard ?? async_storyboard) {
      body.async_storyboard = true;
    }
    const response = await this._post("/video/storyboard/candidates", { json: body });
    return response && typeof response === "object" && "candidates" in response ? response.candidates : response;
  }

  async generate(customPrompt, durationSeconds, selectedCandidate = null, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = true,
    asyncStoryboard = undefined,
    defer_reference_frames = true,
    deferReferenceFrames = undefined,
    ...payload
  } = {}) {
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    body.custom_prompt = customPrompt;
    body.duration_seconds = durationSeconds;
    body.async_storyboard = asyncStoryboard ?? async_storyboard;
    body.defer_reference_frames = deferReferenceFrames ?? defer_reference_frames;
    if (selectedCandidate !== null && selectedCandidate !== undefined) {
      body.selected_candidate = selectedCandidate;
    }
    return this._post("/video/storyboard", { json: body });
  }

  /**
   * POST /video/storyboard/frames -> renders deferred 4K reference frames.
   *
   * Sends the storyboard's `segments` (what the backend reads), plus
   * `selected_candidate` and `duration_seconds`. The finished job (`wait()`)
   * carries the result under `frames` (`{segments, reference_image_urls}`): use
   * `merge()` to put the frames back into the storyboard.
   */
  async frames(storyboard, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = true,
    asyncStoryboard = undefined,
    ...payload
  } = {}) {
    const body = await this._storyboardBody(storyboard, productImageUrl, subjectImageUrl, payload);
    body.async_storyboard = asyncStoryboard ?? async_storyboard;
    return this._post("/video/storyboard/frames", { json: body });
  }

  /**
   * POST /video/storyboard/board -> the storyboard board image (async -> `{job_id}`).
   *
   * The finished job carries `board` (`{storyboard_board_image_url, ...}`):
   * `merge()` adds it to the storyboard, and `longvideo.startFromStoryboard()`
   * sends it as the first reference image.
   */
  async board(storyboard, productImageUrl = null, subjectImageUrl = null, {
    async_storyboard = true,
    asyncStoryboard = undefined,
    ...payload
  } = {}) {
    const body = await this._storyboardBody(storyboard, productImageUrl, subjectImageUrl, payload);
    if (!("storyboard_board_required" in body)) {
      body.storyboard_board_required = true;
    }
    body.async_storyboard = asyncStoryboard ?? async_storyboard;
    return this._post("/video/storyboard/board", { json: body });
  }

  /**
   * POST /video/storyboard/recommend -> `{recommended_index, reason}`.
   *
   * `kind` is "brief" (`options` = the brief suggestions) or "concept"
   * (`options` = the candidates; pass the chosen brief as `chosen_brief`).
   * Options can be strings, `{title, text}`, brief suggestions or concept
   * candidates (turned into `{title, text}` like the portal). Send the same
   * fields as the storyboard call (`custom_prompt`, `duration_seconds`, `ratio`,
   * `video_type`, `ugc_style`, `language_code`...).
   */
  async recommend(kind, options, productImageUrl = null, subjectImageUrl = null, {
    chosen_brief = undefined,
    chosenBrief = undefined,
    ...payload
  } = {}) {
    if (!RECOMMEND_KINDS.includes(kind)) {
      throw new ValidationError("recommend(kind): kind must be 'brief' or 'concept'", { code: "validation_error" });
    }
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    body.kind = kind;
    body.options = (options || []).map((item) => studiohero.recommendOption(item));
    const brief = chosen_brief ?? chosenBrief;
    if (brief) {
      body.chosen_brief = brief;
    }
    return this._post("/video/storyboard/recommend", { json: body });
  }

  /** POST /video/storyboard/revise -> the revised storyboard (the response is the storyboard). */
  revise(revisionRequest, customPrompt, durationSeconds, storyboard, payload = {}) {
    const body = {
      revision_request: revisionRequest,
      custom_prompt: customPrompt,
      duration_seconds: durationSeconds,
      storyboard,
      ...payload
    };
    return this._post("/video/storyboard/revise", { json: body });
  }

  status(jobId) {
    return this._get(`/video/storyboard/status/${jobId}`);
  }

  wait(jobId, { interval = 3.0, timeout = 300.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(jobId),
      { terminalOk: polling.STORYBOARD_OK, terminalFail: polling.STORYBOARD_FAIL, interval, timeout, onProgress }
    );
  }

  // -- portal helpers (no HTTP) ---------------------------------------------
  // Available on the instance (`client.storyboard.merge(...)`) and as statics.

  /**
   * Storyboard with the result of a `frames()` or `board()` job applied.
   *
   * `result` is the `wait()` payload (`frames` / `board` / `storyboard` key) or
   * the inner result. Returns a new object (the input is not modified).
   */
  merge(storyboard, result) {
    return merge(storyboard, result);
  }

  /** `studiohero_segment_prompts`: each segment's `visual_prompt` (or `seedance_prompt`). */
  segmentPrompts(storyboard) {
    return studiohero.segmentPrompts(storyboard);
  }

  /** `studiohero_segment_reference_image_urls`: reference + control frame URLs per segment. */
  segmentReferenceImageUrls(storyboard) {
    return studiohero.segmentReferenceImageUrls(storyboard);
  }

  /** Speaking roles (`[{key, label, role_type, text, tts_text}]`): pick a voice for each `key`. */
  voiceRoles(storyboard) {
    return studiohero.voiceRoles(storyboard);
  }

  /**
   * `voiceover_cast` for the render: `{role_key: {label, role_type, voice_id, text, tts_text}}`.
   *
   * `voiceIds`: one voice id for every role, or `{role_key: voice_id}`. Voice ids
   * come from `client.audio.voices()`.
   */
  voiceCast(storyboard, voiceIds = null) {
    return studiohero.voiceCast(storyboard, voiceIds);
  }

  /** Speaking roles without a voice (the portal refuses to render until there are none). */
  missingVoiceRoles(storyboard, voiceIds = null) {
    return studiohero.missingVoiceRoles(storyboard, voiceIds);
  }

  static merge(storyboard, result) {
    return merge(storyboard, result);
  }

  static segmentPrompts(storyboard) {
    return studiohero.segmentPrompts(storyboard);
  }

  static segmentReferenceImageUrls(storyboard) {
    return studiohero.segmentReferenceImageUrls(storyboard);
  }

  static voiceRoles(storyboard) {
    return studiohero.voiceRoles(storyboard);
  }

  static voiceCast(storyboard, voiceIds = null) {
    return studiohero.voiceCast(storyboard, voiceIds);
  }

  static missingVoiceRoles(storyboard, voiceIds = null) {
    return studiohero.missingVoiceRoles(storyboard, voiceIds);
  }

  // -- creative helpers -----------------------------------------------------
  subjectMeasurements(payload = {}) {
    return this._post("/subject/estimate-measurements", { json: payload });
  }

  analyzeProduct(payload = {}) {
    return this._post("/product/analyze", { json: payload });
  }

  creativity(payload = {}) {
    return this._post("/creativity/generate", { json: payload });
  }

  /** Image body + the storyboard's `segments`, `selected_candidate`, `duration_seconds` (payload wins). */
  async _storyboardBody(storyboard, productImageUrl, subjectImageUrl, payload) {
    const sb = studiohero.unwrapStoryboard(storyboard);
    const body = await this._imageBody(productImageUrl, subjectImageUrl, payload);
    if (!("segments" in body)) {
      body.segments = sb.segments || [];
    }
    if (sb.selected_candidate !== undefined && sb.selected_candidate !== null && !("selected_candidate" in body)) {
      body.selected_candidate = sb.selected_candidate;
    }
    if (sb.duration_seconds && !("duration_seconds" in body)) {
      body.duration_seconds = sb.duration_seconds;
    }
    return body;
  }

  async _imageBody(productImageUrl, subjectImageUrl, payload) {
    const body = { ...(payload || {}) };
    // The images can also come in the payload (`{product_image_url, ...common}`).
    if (productImageUrl !== null && productImageUrl !== undefined) {
      body.product_image_url = await this._resolveImage(productImageUrl, "products");
    } else if (body.product_image_url) {
      body.product_image_url = await this._resolveImage(body.product_image_url, "products");
    }
    if (subjectImageUrl !== null && subjectImageUrl !== undefined) {
      body.subject_image_url = await this._resolveImage(subjectImageUrl, "subjects");
    } else if (body.subject_image_url) {
      body.subject_image_url = await this._resolveImage(body.subject_image_url, "subjects");
    }
    if (body.image_url) {
      body.image_url = await this._resolveImage(body.image_url, "references");
    }
    return body;
  }
}

function merge(storyboard, result) {
  const sb = studiohero.unwrapStoryboard(storyboard);
  let res = isPlainObject(result) ? result : {};
  if (isPlainObject(res.frames)) {
    res = res.frames;
  } else if (isPlainObject(res.board)) {
    res = res.board;
  } else if (isPlainObject(res.storyboard) && !("segments" in res)) {
    return { ...res.storyboard };
  }
  if (Array.isArray(res.segments) && res.segments.length) {
    sb.segments = res.segments;
    sb.reference_image_urls = studiohero.truthy(res.reference_image_urls)
      ? res.reference_image_urls
      : sb.reference_image_urls;
    sb.reference_frames_deferred = false;
  }
  const boardUrl = String(res.storyboard_board_image_url || "").trim();
  if (boardUrl) {
    sb.storyboard_board_enabled = res.storyboard_board_enabled !== false;
    sb.storyboard_board_deferred = false;
    sb.storyboard_board_image_url = boardUrl;
    sb.storyboard_board_duration_seconds = res.storyboard_board_duration_seconds || sb.duration_seconds;
  }
  return sb;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = { Storyboard, DURATIONS };
