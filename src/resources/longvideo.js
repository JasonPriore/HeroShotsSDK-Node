"use strict";

const { Resource, compact, takeOptions } = require("./base");
const polling = require("../polling");
const studiohero = require("../studiohero");
const { ProviderError, ValidationError } = require("../errors");

// The job pauses here when every segment is rendered: the clips are ready
// (`segments[].video_url`) and the final cut is made by `export()`.
const SEGMENTS_READY = "segments_ready";
const WAIT_OK = [...polling.STORYBOARD_OK, SEGMENTS_READY];

/** Long / multi-segment video (API key or portal JWT, /api/v1/long-video). */
class LongVideo extends Resource {
  /**
   * POST /api/v1/long-video/start -> `{job_id, status, segment_count, ...}`.
   *
   * Provide `imageUrl` (local paths auto-upload with a portal JWT) or
   * `image_generation_id` / `product_image_url` + `subject_image_url`.
   * `duration_seconds` is 30, 45 or 60.
   *
   * `storyboard` (from `client.storyboard.wait` / `revise`) is turned into the
   * fields the portal sends: `custom_prompt` = its `optimized_prompt`,
   * `studiohero_segment_prompts`, `studiohero_segment_reference_image_urls` and
   * `duration_seconds`. Explicit options win. The raw storyboard is not sent
   * (the backend does not read it). For the whole portal render (inputs,
   * reference images, voices, montage) use `startFromStoryboard()`.
   *
   * `montage` asks the auto-edit after the export (graphics, karaoke captions,
   * logo, end card): `{brief, language_code, logo_url, logo_mode:
   * "in_video"|"end_only"|"off", inserts: [{url, label}]}`. The edited video
   * arrives in `captioned_final_video_url`.
   *
   * `voiceover_cast` is one voice per speaking role (build it with
   * `client.storyboard.voiceCast`); `tts_voice_id` defaults to its first voice.
   * Optional: `reference_video_url`, `script`, `tts_voice_id`, `language_code`,
   * `captions`.
   */
  async start(imageUrl = null, {
    custom_prompt = undefined,
    customPrompt = undefined,
    storyboard = undefined,
    duration_seconds = undefined,
    durationSeconds = undefined,
    ratio = "16:9",
    resolution = "1080p",
    montage = undefined,
    voiceover_cast = undefined,
    voiceoverCast = undefined,
    ...payload
  } = {}) {
    const body = { ratio, resolution };
    if (storyboard !== undefined && storyboard !== null) {
      Object.assign(body, studiohero.storyboardStartFields(storyboard));
    }
    Object.assign(body, payload);
    if (imageUrl !== null && imageUrl !== undefined) {
      body.image_url = await this._resolveImage(imageUrl, "products");
    }
    Object.assign(body, compact({
      custom_prompt: custom_prompt ?? customPrompt,
      duration_seconds: duration_seconds ?? durationSeconds
    }));
    if (montage !== undefined && montage !== null && montage !== false) {
      body.montage = montage;
    }
    const cast = voiceover_cast ?? voiceoverCast;
    if (studiohero.truthy(cast)) {
      body.voiceover_cast = cast;
      const voice = studiohero.firstVoiceId(cast);
      if (voice && !body.tts_voice_id) {
        body.tts_voice_id = voice;
      }
    }
    return this._post("/api/v1/long-video/start", { json: body });
  }

  /**
   * Start the long video exactly like the StudioHero portal's render.
   *
   * `storyboard` is the accepted storyboard (`storyboard.wait()` payload or the
   * storyboard itself, after `storyboard.merge()` for frames / board). Builds:
   * the inputs (product, subject or avatar + `avatar_view_type`, extra product
   * views, product boxes, `extra_products`, brand logo), `custom_prompt` =
   * `optimized_prompt`, `duration` + `duration_seconds`, `ratio`, `resolution`,
   * the per-segment prompts and reference frames, `reference_image_urls` (board
   * image, product, extra views, subject, background, posture), the voice cast
   * and the montage.
   *
   * `voice_id`: one voice for every speaking role, or `{role_key: voice_id}`
   * (keys from `storyboard.voiceRoles()`; ids from `client.audio.voices()`). An
   * object must cover every speaking role. `language_code` is the spoken
   * language (default "it", as the storyboard endpoints).
   *
   * `montage`: `true` for the auto-edit with the defaults the portal uses
   * (`brief`, `language_code`, the brand logo and its mode), or an object to set
   * the fields yourself (missing ones are filled the same way). With no montage
   * and `brand_logo_mode: "end_only"` the animated logo closing is asked alone
   * (`kind: "outro"`), like the portal.
   *
   * `avatar_view_type` must be a real view of the avatar (`fullbody`,
   * `mezzo_busto`, `closeup`...): "avatar" is rejected. Options are snake_case
   * or camelCase; extra keys are forwarded verbatim and win over everything.
   */
  async startFromStoryboard(storyboard, options = {}) {
    const [o, payload] = takeOptions(options, [
      "product_image_url",
      "subject_image_url",
      "image_url",
      "avatar_id",
      "avatar_view_type",
      "avatar_image_set",
      "additional_product_image_urls",
      "product_box_closed_url",
      "product_box_open_url",
      "extra_products",
      "brand_logo_url",
      "brand_logo_mode",
      "background_image_url",
      "body_posture_image_url",
      "voice_id",
      "language_code",
      "montage",
      "brief",
      "custom_prompt",
      "duration_seconds",
      "ratio",
      "resolution"
    ]);
    const sb = studiohero.unwrapStoryboard(storyboard);
    if (!studiohero.truthy(sb.segments)) {
      throw new ValidationError("startFromStoryboard: the storyboard has no segments", { code: "validation_error" });
    }
    const view = String(o.avatar_view_type || "").trim() || null;
    if (view === "avatar") {
      throw new ValidationError(
        `avatar_view_type must be a view of the avatar (e.g. ${studiohero.AVATAR_VIEW_TYPES.slice(0, 5).join(", ")}), not 'avatar'`,
        { code: "validation_error" }
      );
    }
    if (o.brand_logo_mode !== undefined && o.brand_logo_mode !== null && !studiohero.LOGO_MODES.includes(o.brand_logo_mode)) {
      throw new ValidationError(`brand_logo_mode must be one of ${studiohero.LOGO_MODES.join(", ")}`, {
        code: "validation_error"
      });
    }

    const product = await this._resolveImage(o.product_image_url, "products");
    const subject = await this._resolveImage(o.subject_image_url, "subjects");
    const extras = [];
    for (const url of o.additional_product_image_urls || []) {
      if (url) {
        extras.push(await this._resolveImage(url, "products"));
      }
    }
    const background = await this._resolveImage(o.background_image_url, "background");
    const posture = await this._resolveImage(o.body_posture_image_url, "body_posture");
    const logo = await this._resolveImage(o.brand_logo_url, "references");
    const logoMode = o.brand_logo_mode || (logo ? "in_video" : null);
    const language = o.language_code || "it";
    const duration = o.duration_seconds || sb.duration_seconds;
    const fields = studiohero.storyboardStartFields(sb);
    const hasAvatar = o.avatar_id !== undefined && o.avatar_id !== null;

    const body = {};
    if (o.image_url !== undefined && o.image_url !== null) {
      body.image_url = await this._resolveImage(o.image_url, "products");
    }
    Object.assign(body, compact({
      product_image_url: product,
      subject_image_url: subject,
      avatar_id: o.avatar_id,
      avatar_view_type: hasAvatar ? view : null,
      avatar_image_set: hasAvatar ? o.avatar_image_set : null,
      additional_product_image_urls: extras.length ? extras : null,
      background_image_url: background,
      body_posture_image_url: posture,
      brand_logo_url: logo,
      brand_logo_mode: logo ? logoMode : null,
      product_box_closed_url: await this._resolveImage(o.product_box_closed_url, "products"),
      product_box_open_url: await this._resolveImage(o.product_box_open_url, "products"),
      extra_products: studiohero.truthy(o.extra_products) ? o.extra_products : null,
      custom_prompt: fields.custom_prompt || o.brief,
      duration: duration || null,
      duration_seconds: duration || null,
      ratio: o.ratio ?? "16:9",
      resolution: o.resolution ?? "1080p",
      studiohero_segment_prompts: fields.studiohero_segment_prompts,
      studiohero_segment_reference_image_urls: fields.studiohero_segment_reference_image_urls
    }));
    const refs = studiohero.dedupeUrls([sb.storyboard_board_image_url, product, ...extras, subject, background, posture]);
    if (refs.length) {
      body.reference_image_urls = refs;
    }

    if (studiohero.truthy(o.voice_id)) {
      const missing = studiohero.missingVoiceRoles(sb, o.voice_id);
      if (missing.length) {
        throw new ValidationError(`voice_id has no voice for the speaking role(s): ${missing.join(", ")}`, {
          code: "validation_error"
        });
      }
      const cast = studiohero.voiceCast(sb, o.voice_id);
      if (Object.keys(cast).length) {
        body.voiceover_cast = cast;
        body.tts_voice_id = studiohero.firstVoiceId(cast);
        body.language_code = language;
      }
    }

    const montageBody = montageRequest(o.montage, {
      brief: o.brief,
      languageCode: language,
      logoUrl: logo,
      logoMode
    });
    if (montageBody !== null) {
      body.montage = montageBody;
    }

    if (o.custom_prompt !== undefined && o.custom_prompt !== null) {
      body.custom_prompt = o.custom_prompt;
    }
    Object.assign(body, payload);
    return this._post("/api/v1/long-video/start", { json: body });
  }

  /** GET /api/v1/long-video/status/{jobId} -> segments + `final_video_url`. */
  status(jobId) {
    return this._get(`/api/v1/long-video/status/${jobId}`);
  }

  /**
   * POST /api/v1/long-video/{jobId}/segments/{segmentIndex}/regenerate.
   *
   * `comment` tells the model what to change; `cascade: true` also re-renders
   * the following segments so they stay continuous.
   */
  regenerateSegment(jobId, segmentIndex, { comment = undefined, cascade = undefined } = {}) {
    const body = compact({ comment, cascade });
    return this._post(`/api/v1/long-video/${jobId}/segments/${segmentIndex}/regenerate`, { json: body });
  }

  /**
   * POST /api/auth/long-video/{jobId}/export -> joins the clips into `final_video_url`.
   *
   * Portal JWT only. Needs every segment done (`segments_ready` or `done`).
   * `segment_order` (1-based indexes) reorders the clips. Not billed.
   */
  export(jobId, { segment_order = undefined, segmentOrder = undefined, timeline = undefined } = {}) {
    const body = compact({ segment_order: segment_order ?? segmentOrder, timeline });
    return this._post(`/api/auth/long-video/${jobId}/export`, { json: body });
  }

  /**
   * POST /api/auth/long-video/{jobId}/montage -> auto-edit a generated video (portal JWT).
   *
   * Graphics, karaoke captions, logo and end card on the exported video; the
   * result lands in `captioned_final_video_url` (`final_video_url` stays the
   * plain cut). Omitted fields take the job's defaults. Resolves with the job
   * status: HTTP 202 when it starts now (status `captioning`), or
   * `needs_export: true` when the video is not exported yet (the next `export()`
   * runs it). Follow it with `render()` (or `wait()`) until `montage_done`.
   */
  montage(jobId, options = {}) {
    const [named, fields] = takeOptions(options, ["brief", "language_code", "logo_url", "logo_mode", "inserts"]);
    const body = compact({ ...named, ...fields });
    return this._post(`/api/auth/long-video/${jobId}/montage`, { json: body });
  }

  /** GET /api/auth/studio/montage-availability -> can this server run the auto-edit? */
  async montageAvailable() {
    const response = await this._get("/api/auth/studio/montage-availability");
    return Boolean(response && typeof response === "object" && response.available);
  }

  /** True when no auto-edit is asked, it is done, or it stopped (failed / expired). */
  montageSettled(job) {
    return montageSettled(job);
  }

  /** True when no auto-edit is asked, it is done, or it stopped (failed / expired). */
  static montageSettled(job) {
    return montageSettled(job);
  }

  /** GET /api/auth/long-video/view/{token} (share link payload, portal JWT). */
  view(token) {
    return this._get(`/api/auth/long-video/view/${token}`);
  }

  /**
   * Poll until the clips are ready (`segments_ready`), `done` or `failed`.
   *
   * At `segments_ready` every `segments[i].video_url` is set but `final_video_url`
   * is still empty: call `export()` (or use `render()`) to get the joined video.
   * Dubbed jobs go straight to `done`. When an auto-edit was asked
   * (`montage_requested`), a `done` job is returned only once the montage has
   * finished (see `montageSettled()`).
   */
  wait(jobId, { interval = 5.0, timeout = 1800.0, onProgress = null } = {}) {
    return polling.wait(
      () => this.status(jobId),
      {
        terminalOk: WAIT_OK,
        terminalFail: polling.STORYBOARD_FAIL,
        interval,
        timeout,
        onProgress,
        ready: doneAndSettledOrNotDone
      }
    );
  }

  /**
   * Wait for the clips, export them and wait for `final_video_url` (portal JWT).
   * Resolves with the final status payload (`status === "done"`). With an
   * auto-edit asked (`montage` at start, or `montage()`) it also waits for it
   * (status `done` -> `captioning` -> `done`): the edited video is
   * `captioned_final_video_url` and `montage_done` is true. A failed auto-edit
   * resolves with `montage_done` false, `montage_report.error` and the plain
   * `final_video_url`.
   */
  async render(jobId, {
    segment_order = undefined,
    segmentOrder = undefined,
    interval = 5.0,
    timeout = 2400.0,
    onProgress = null
  } = {}) {
    const deadline = Date.now() + timeout * 1000;
    let job = await this.wait(jobId, { interval, timeout, onProgress });
    if (String(job.status).toLowerCase() === "done" && job.final_video_url && montageSettled(job)) {
      return job;
    }
    await this.export(jobId, { segment_order: segment_order ?? segmentOrder });
    while (true) {
      job = await this.status(jobId);
      if (onProgress) {
        onProgress(job);
      }
      const status = String(job?.status || "").toLowerCase();
      if (status === "done" && job.final_video_url && montageSettled(job)) {
        return job;
      }
      if (polling.STORYBOARD_FAIL.includes(status)) {
        throw new ProviderError(String(job.error || `long video ${status}`), { code: "provider_error" });
      }
      if (Date.now() >= deadline) {
        throw new polling.TimeoutError(
          `long video export did not finish within ${timeout}s (last status=${JSON.stringify(status)})`
        );
      }
      if (interval > 0) {
        await polling.sleep(interval);
      }
    }
  }
}

/** True when no auto-edit is asked, it is done, or it stopped (failed / expired). */
function montageSettled(job) {
  if (!job || !job.montage_requested) {
    return true;
  }
  if (job.montage_done) {
    return true;
  }
  return !job.montage_pending;
}

function doneAndSettledOrNotDone(job) {
  if (String(job?.status || "").toLowerCase() !== "done") {
    return true;
  }
  return montageSettled(job);
}

/** The `montage` field as the portal builds it (null when nothing is asked). */
function montageRequest(montage, { brief, languageCode, logoUrl, logoMode }) {
  const portalLogo = logoUrl && logoMode !== "off" ? logoUrl : null;
  if (montage === undefined || montage === null || montage === false) {
    if (portalLogo && logoMode === "end_only") {
      return compact({ kind: "outro", language_code: languageCode, logo_url: portalLogo, logo_mode: logoMode });
    }
    return null;
  }
  const asked = montage && typeof montage === "object" && !Array.isArray(montage) ? { ...montage } : {};
  const defaults = compact({
    brief: String(brief || "").trim(),
    language_code: languageCode,
    logo_url: portalLogo,
    logo_mode: logoMode
  });
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in asked)) {
      asked[key] = value;
    }
  }
  return asked;
}

module.exports = { LongVideo, SEGMENTS_READY, montageSettled };
