/// <reference types="node" />

export type JsonObject = Record<string, any>;
export type ProgressCallback = (payload: JsonObject) => void;
export type Id = string | number;
/** A local file path, raw bytes or a Blob (multipart uploads). */
export type FileInput = string | Buffer | Uint8Array | ArrayBuffer | Blob;

export class HeroShotsError extends Error {}
export class ApiError extends HeroShotsError {
  code: string | null;
  status: number | null;
  details: JsonObject;
}
export class AuthError extends ApiError {}
export class TokenExpiredError extends AuthError {}
export class ValidationError extends ApiError {}
export class NotFoundError extends ApiError {}
export class ForbiddenError extends ApiError {}
export class ConflictError extends ApiError {}
export class QuotaExceededError extends ApiError {}
export class PayloadTooLargeError extends ApiError {}
export class ProviderError extends ApiError {}
export class ServiceUnavailableError extends ApiError {}
export class RateLimitError extends ApiError {
  /** Server hint in seconds (Retry-After header), or null. */
  retryAfter: number | null;
}
/** No payment method, or billing/VAT details missing (`no_payment_method`, `wallet_vat_validation_required`). */
export class BillingError extends ApiError {}
export class InternalError extends ApiError {}
export class PollTimeoutError extends HeroShotsError {}

export function errorFromResponse(status: number, body: any): ApiError;

export interface ClientOptions {
  /** Defaults to HEROSHOTS_BASE_URL or https://app.heroshots.ai. */
  baseUrl?: string;
  /** Portal JWT or API key. */
  token?: string | null;
  /** B2B API key (`lz_live_...`); alias of `token`. Defaults to HEROSHOTS_API_KEY. */
  apiKey?: string | null;
  email?: string | null;
  password?: string | null;
  managedUserId?: string | number | null;
  /** Per-request timeout in milliseconds (default 120000). */
  timeout?: number;
  /** Retries on HTTP 429 (default 2). Multipart bodies are never retried. */
  maxRetries?: number;
  fetch?: typeof fetch;
  autoRelogin?: boolean;
}

export interface RequestOptions {
  json?: any;
  params?: JsonObject | null;
  formData?: FormData | null;
  auth?: boolean;
  unwrap?: boolean | null;
  /** Return the response body as a Buffer. */
  raw?: boolean;
}

export interface WaitOptions {
  interval?: number;
  timeout?: number;
  onProgress?: ProgressCallback | null;
}

export const DEFAULT_TIMEOUT: number;
export const DEFAULT_BASE_URL: string;
export const DEFAULT_MAX_RETRIES: number;

export class HeroShotsClient {
  constructor(options?: ClientOptions | string);
  static fromLogin(email: string, password: string, options?: ClientOptions): Promise<HeroShotsClient>;
  static fromLogin(options: ClientOptions & { email: string; password: string }): Promise<HeroShotsClient>;

  baseUrl: string;
  token: string | null;
  managedUserId: string | number | null;
  timeout: number;
  maxRetries: number;
  /** True when the bearer is a B2B API key (`lz_...`), not a portal JWT. */
  readonly usesApiKey: boolean;

  account: Account;
  images: Images;
  videos: Videos;
  longvideo: LongVideo;
  stilllife: StillLife;
  storyboard: Storyboard;
  avatars: Avatars;
  bulk: Bulk;
  generations: Generations;
  pricing: Pricing;
  assets: Assets;
  collections: Collections;
  backgrounds: Backgrounds;
  categories: Categories;
  uploads: Uploads;
  /** Voices for the video voiceover (portal JWT). */
  audio: Audio;
  legal: Legal;
  agency: Agency;
  brand: Brand;

  login(email: string, password: string): Promise<JsonObject>;
  /** `/api/v1/me` with an API key, `/api/auth/me` with a portal JWT. */
  me(): Promise<JsonObject>;
  stats(): Promise<JsonObject>;
  /**
   * API key: `{hs_credits, currency_credit, wallet_balance, billing_type}` from `/api/v1/me`.
   * Portal JWT: compact view of `/api/auth/stats` (credits, usage counters, `plan`, `wallet_balance`).
   */
  balance(): Promise<JsonObject>;
  withManagedUser(managedUserId: string | number | null): HeroShotsClient;
  /**
   * `path` is an API path or an absolute `http(s)://` URL; with an absolute URL the
   * token and `X-Managed-User-Id` are sent only when it is the API host (`baseUrl`).
   */
  request(method: string, path: string, options: RequestOptions & { raw: true }): Promise<Buffer>;
  request(method: string, path: string, options?: RequestOptions): Promise<any>;
  /**
   * GET a binary endpoint or an absolute file URL (`final_video_url`,
   * `captioned_final_video_url`). The token is sent only to the API host.
   */
  download(path: string, dest?: null, options?: { params?: JsonObject | null }): Promise<Buffer>;
  download(path: string, dest: string, options?: { params?: JsonObject | null }): Promise<string>;
}

export { HeroShotsClient as Client };

export class Account {
  /** GET /api/v1/me -> `{user, credits_remaining: {hs_credits, currency_credit}}`. */
  me(): Promise<JsonObject>;
  /** GET /api/v1/health (no auth). */
  health(): Promise<JsonObject>;
}

export interface ImagePayload extends JsonObject {
  avatar_id?: number;
  avatar_image_set?: "original" | "generated" | string;
  still_life?: boolean;
  custom_prompt?: string;
  size?: "720p" | "1080p" | "2K" | "4K" | string;
  aspect_ratio?: string;
  view_type?: string;
  background_image_url?: string;
  body_posture_image_url?: string;
  hairstyle_reference_image_url?: string;
  text_detail_image_url?: string;
  worn_scale_reference_url?: string;
  additional_product_image_urls?: string[];
  quality_mode?: string;
  text_fidelity_mode?: string;
  edit_generation_id?: string;
  previous_output_image_url?: string;
}

export interface UsageRight extends JsonObject {
  type?: "organic" | "paid_digital" | "broadcast" | string;
  duration?: "4_weeks" | "6_months" | "2_years" | "perpetual" | string;
}

export interface UsageRightsQuoteOptions {
  usage_rights_type?: string;
  usageRightsType?: string;
  usage_rights_duration?: string;
  usageRightsDuration?: string;
}

export interface GenerateBackgroundOptions extends JsonObject {
  aspect_ratio?: string;
  aspectRatio?: string;
  size?: "2K" | "4K" | string;
  async_generation?: boolean;
  asyncGeneration?: boolean;
}

export class Images {
  generate(productImageUrl: string, subjectImageUrl?: string | null, payload?: ImagePayload): Promise<JsonObject>;
  generate(productImageUrl: string, payload: ImagePayload): Promise<JsonObject>;
  generateBackground(prompt: string, options?: GenerateBackgroundOptions): Promise<JsonObject>;
  candidates(productImageUrl: string, subjectImageUrl?: string | null, payload?: ImagePayload): Promise<JsonObject>;
  candidates(productImageUrl: string, payload: ImagePayload): Promise<JsonObject>;
  selectCandidate(token: string, payload?: JsonObject): Promise<JsonObject>;
  status(generationId: string): Promise<JsonObject>;
  wait(generationId: string, options?: WaitOptions): Promise<JsonObject>;
  download(logId: Id, dest?: null): Promise<Buffer>;
  download(logId: Id, dest: string): Promise<string>;
  /** GET with `usage_rights_type` + `usage_rights_duration`, POST with a `usageRights` array. */
  usageRightsQuote(logId: Id, usageRights?: UsageRight[] | null, options?: UsageRightsQuoteOptions): Promise<JsonObject>;
  usageRightsQuote(logId: Id, options: UsageRightsQuoteOptions): Promise<JsonObject>;
  usageRightsUpgrade(logId: Id, usageRights: UsageRight[]): Promise<JsonObject>;
  analyzeEditRegion(cropImage: string, feedback: string): Promise<JsonObject>;
}

export interface VideoPayload extends JsonObject {
  duration_seconds?: number;
  custom_prompt?: string;
  product_image_url?: string;
  subject_image_url?: string;
  avatar_id?: number;
  script?: string;
  tts_voice_id?: string;
  language_code?: string;
  ratio?: string;
  resolution?: string;
  reference_video_url?: string;
}

export class Videos {
  generate(imageUrl?: string | null, payload?: VideoPayload): Promise<JsonObject>;
  generate(payload: VideoPayload): Promise<JsonObject>;
  status(taskId: string, options?: { provider?: string | null }): Promise<JsonObject>;
  wait(taskId: string, options?: WaitOptions): Promise<JsonObject>;
  download(logId: Id, dest?: null): Promise<Buffer>;
  download(logId: Id, dest: string): Promise<string>;
}

export type LogoMode = "in_video" | "end_only" | "off";
export type VideoType = "ugc" | "cinema" | "spot_tv" | "sas_software";
export type UgcStyle = "amateur" | "top_creator";
/** Avatar views the render accepts as `avatar_view_type` ("avatar" is not one). */
export type AvatarViewType =
  | "fullbody"
  | "profile_left"
  | "profile_right"
  | "mezzo_busto"
  | "closeup"
  | "ear"
  | "wrist"
  | "feet"
  | "bust_only"
  | "legs_lower";

/** Auto-edit request (graphics, karaoke captions, logo, end card). */
export interface MontageRequest extends JsonObject {
  brief?: string;
  language_code?: string;
  logo_url?: string;
  logo_mode?: LogoMode | string;
  /** Images shown only in the montage. */
  inserts?: Array<{ url: string; label?: string }>;
  /** "outro" = only the animated logo closing. */
  kind?: string;
}

/** One speaking role of a storyboard. */
export interface VoiceRole {
  /** e.g. `subject_1`, `subject_2`, `voice_over`. */
  key: string;
  label: string;
  role_type: "subject" | "narrator" | string;
  text: string;
  tts_text: string;
}

export interface VoiceCastEntry {
  label: string;
  role_type: "subject" | "narrator" | string;
  voice_id: string;
  text: string;
  tts_text: string;
}

/** `voiceover_cast`: `{role_key: {label, role_type, voice_id, text, tts_text}}`. */
export type VoiceCast = Record<string, VoiceCastEntry>;
/** One voice id for every role, or `{role_key: voice_id}`. */
export type VoiceIds = string | Record<string, string> | null | undefined;

export interface LongVideoStartOptions extends JsonObject {
  custom_prompt?: string;
  customPrompt?: string;
  /**
   * Storyboard (or the `storyboard.wait()` payload): sent as `custom_prompt` =
   * `optimized_prompt`, `studiohero_segment_prompts`,
   * `studiohero_segment_reference_image_urls` and `duration_seconds` (explicit options win).
   */
  storyboard?: JsonObject;
  /** Auto-edit after the export; the edited video is `captioned_final_video_url`. */
  montage?: MontageRequest | boolean | null;
  /** One voice per speaking role (see `storyboard.voiceCast`); `tts_voice_id` defaults to its first voice. */
  voiceover_cast?: VoiceCast | VoiceCastEntry[];
  voiceoverCast?: VoiceCast | VoiceCastEntry[];
  captions?: boolean;
  /** 30, 45 or 60. */
  duration_seconds?: number;
  durationSeconds?: number;
  ratio?: string;
  resolution?: string;
  image_generation_id?: string;
  product_image_url?: string;
  subject_image_url?: string;
  reference_video_url?: string;
  script?: string;
  tts_voice_id?: string;
  language_code?: string;
}

/** Options of `longvideo.startFromStoryboard` (snake_case or camelCase; extra keys forwarded and win). */
export interface StartFromStoryboardOptions extends JsonObject {
  product_image_url?: string;
  productImageUrl?: string;
  subject_image_url?: string;
  subjectImageUrl?: string;
  image_url?: string;
  imageUrl?: string;
  avatar_id?: Id;
  avatarId?: Id;
  avatar_view_type?: AvatarViewType | string;
  avatarViewType?: AvatarViewType | string;
  avatar_image_set?: "original" | "generated" | string;
  avatarImageSet?: "original" | "generated" | string;
  additional_product_image_urls?: string[];
  additionalProductImageUrls?: string[];
  product_box_closed_url?: string;
  productBoxClosedUrl?: string;
  product_box_open_url?: string;
  productBoxOpenUrl?: string;
  extra_products?: Array<{ image_url: string; box_closed_url?: string; box_open_url?: string } & JsonObject>;
  extraProducts?: Array<{ image_url: string; box_closed_url?: string; box_open_url?: string } & JsonObject>;
  brand_logo_url?: string;
  brandLogoUrl?: string;
  brand_logo_mode?: LogoMode;
  brandLogoMode?: LogoMode;
  background_image_url?: string;
  backgroundImageUrl?: string;
  body_posture_image_url?: string;
  bodyPostureImageUrl?: string;
  /** One voice for every speaking role, or `{role_key: voice_id}` covering every role. */
  voice_id?: VoiceIds;
  voiceId?: VoiceIds;
  /** Spoken language (default "it"). */
  language_code?: string;
  languageCode?: string;
  /** `true` = auto-edit with the portal defaults; an object sets the fields (missing ones filled). */
  montage?: MontageRequest | boolean | null;
  brief?: string;
  /** Overrides the storyboard's `optimized_prompt`. */
  custom_prompt?: string;
  customPrompt?: string;
  duration_seconds?: number;
  durationSeconds?: number;
  ratio?: string;
  resolution?: string;
}

export interface MontageOptions extends JsonObject {
  brief?: string;
  language_code?: string;
  languageCode?: string;
  logo_url?: string;
  logoUrl?: string;
  logo_mode?: LogoMode | string;
  logoMode?: LogoMode | string;
  inserts?: Array<{ url: string; label?: string }>;
}

export class LongVideo {
  start(imageUrl?: string | null, options?: LongVideoStartOptions): Promise<JsonObject>;
  /** The StudioHero portal's render in one call (inputs, prompts, frames, references, voices, montage). */
  startFromStoryboard(storyboard: JsonObject, options?: StartFromStoryboardOptions): Promise<JsonObject>;
  /** Portal JWT only. Auto-edit an existing job; result in `captioned_final_video_url`. */
  montage(jobId: Id, options?: MontageOptions): Promise<JsonObject>;
  /** Portal JWT only. Can this server run the auto-edit? */
  montageAvailable(): Promise<boolean>;
  /** True when no auto-edit is asked, it is done, or it stopped (failed / expired). */
  montageSettled(job: JsonObject): boolean;
  static montageSettled(job: JsonObject): boolean;
  status(jobId: Id): Promise<JsonObject>;
  regenerateSegment(jobId: Id, segmentIndex: number, options?: { comment?: string; cascade?: boolean }): Promise<JsonObject>;
  /** Portal JWT only. Joins the ready clips into `final_video_url`. */
  export(jobId: Id, options?: { segment_order?: number[]; segmentOrder?: number[]; timeline?: JsonObject }): Promise<JsonObject>;
  view(token: string): Promise<JsonObject>;
  /** Resolves at `segments_ready`, `done` (after the auto-edit, if asked) or rejects on `failed`. */
  wait(jobId: Id, options?: WaitOptions): Promise<JsonObject>;
  /** Portal JWT only: wait + export + wait for `final_video_url` (and the auto-edit, if asked). */
  render(jobId: Id, options?: WaitOptions & { segment_order?: number[]; segmentOrder?: number[] }): Promise<JsonObject>;
}

export interface StillLifeStartOptions extends JsonObject {
  custom_prompt?: string;
  customPrompt?: string;
  detail_image_url?: string;
  detailImageUrl?: string;
  reference_video_url?: string;
  referenceVideoUrl?: string;
  ratio?: string;
  resolution?: string;
  duration_seconds?: number;
  durationSeconds?: number;
}

export class StillLife {
  start(productUrl: string, backgroundUrl: string, options?: StillLifeStartOptions): Promise<JsonObject>;
  status(taskId: Id): Promise<JsonObject>;
  wait(taskId: Id, options?: WaitOptions): Promise<JsonObject>;
  /** Portal JWT only. */
  previewBackground(taskId: Id, payload?: JsonObject): Promise<JsonObject>;
  /** Portal JWT only. */
  changeBackground(taskId: Id, payload?: JsonObject): Promise<JsonObject>;
  /** Portal JWT only. */
  changeBackgroundStatus(taskId: Id): Promise<JsonObject>;
}

export interface BriefSuggestion extends JsonObject {
  title: string;
  brief: string;
  pros?: string[];
  cons?: string[];
}

/**
 * Fields the portal sends with every storyboard call (all optional, forwarded verbatim).
 * `product_image_url` / `subject_image_url` here are uploaded like the positional ones.
 */
export interface StoryboardPayload extends JsonObject {
  product_image_url?: string;
  subject_image_url?: string;
  duration_seconds?: number;
  ratio?: string;
  resolution?: string;
  language_code?: string;
  video_type?: VideoType | string;
  ugc_style?: UgcStyle | string;
  look_mode?: "current" | "custom" | string;
  look_description?: string;
  still_life?: boolean;
  reference_video_url?: string;
  video_provider?: string;
  storyboard_reference_frames_required?: boolean;
  storyboard_board_required?: boolean;
  avatar_id?: Id;
  avatar_view_type?: AvatarViewType | string;
  avatar_image_set?: string;
  additional_product_image_urls?: string[];
  background_image_url?: string;
  body_posture_image_url?: string;
  brand_logo_url?: string;
  brand_logo_mode?: LogoMode;
  product_box_closed_url?: string;
  product_box_open_url?: string;
  extra_products?: JsonObject[];
}

export interface RecommendOption {
  title: string;
  text: string;
}

/** StudioHero storyboard intelligence (portal JWT only). */
export class Storyboard {
  /** Brief suggestions: `[{title, brief, pros, cons}]`. */
  briefSuggestions(productImageUrl?: string | null, subjectImageUrl?: string | null, payload?: StoryboardPayload): Promise<BriefSuggestion[]>;
  candidates(
    customPrompt: string,
    durationSeconds: number,
    productImageUrl?: string | null,
    subjectImageUrl?: string | null,
    payload?: JsonObject
  ): Promise<any>;
  generate(
    customPrompt: string,
    durationSeconds: number,
    selectedCandidate?: JsonObject | null,
    productImageUrl?: string | null,
    subjectImageUrl?: string | null,
    payload?: JsonObject
  ): Promise<JsonObject>;
  /** Deferred 4K reference frames: sends the storyboard's `segments`. Merge the result with `merge()`. */
  frames(storyboard: JsonObject, productImageUrl?: string | null, subjectImageUrl?: string | null, payload?: StoryboardPayload): Promise<JsonObject>;
  /** Storyboard board image (async). Merge the result with `merge()`. */
  board(storyboard: JsonObject, productImageUrl?: string | null, subjectImageUrl?: string | null, payload?: StoryboardPayload): Promise<JsonObject>;
  /** The portal's "Consigliato": `{recommended_index, reason}`. */
  recommend(
    kind: "brief" | "concept",
    options: Array<string | RecommendOption | JsonObject>,
    productImageUrl?: string | null,
    subjectImageUrl?: string | null,
    payload?: StoryboardPayload & { chosen_brief?: string; chosenBrief?: string; custom_prompt?: string }
  ): Promise<{ recommended_index: number; reason?: string } & JsonObject>;
  revise(revisionRequest: string, customPrompt: string, durationSeconds: number, storyboard: JsonObject, payload?: JsonObject): Promise<JsonObject>;
  status(jobId: string): Promise<JsonObject>;
  wait(jobId: string, options?: WaitOptions): Promise<JsonObject>;
  /** Storyboard with a `frames()` / `board()` job result applied (new object). */
  merge(storyboard: JsonObject, result: JsonObject): JsonObject;
  segmentPrompts(storyboard: JsonObject): string[];
  segmentReferenceImageUrls(storyboard: JsonObject): string[][];
  voiceRoles(storyboard: JsonObject): VoiceRole[];
  voiceCast(storyboard: JsonObject, voiceIds?: VoiceIds): VoiceCast;
  missingVoiceRoles(storyboard: JsonObject, voiceIds?: VoiceIds): string[];
  static merge(storyboard: JsonObject, result: JsonObject): JsonObject;
  static segmentPrompts(storyboard: JsonObject): string[];
  static segmentReferenceImageUrls(storyboard: JsonObject): string[][];
  static voiceRoles(storyboard: JsonObject): VoiceRole[];
  static voiceCast(storyboard: JsonObject, voiceIds?: VoiceIds): VoiceCast;
  static missingVoiceRoles(storyboard: JsonObject, voiceIds?: VoiceIds): string[];
  subjectMeasurements(payload?: JsonObject): Promise<JsonObject>;
  analyzeProduct(payload?: JsonObject): Promise<JsonObject>;
  creativity(payload?: JsonObject): Promise<JsonObject>;
}

export type ViewType = "closeup" | "fullbody" | "profile" | "back" | "profile_left" | "profile_right" | "mez";

export interface AvatarListFilters extends JsonObject {
  gender?: string;
  nationality?: string;
  min_age?: number;
  max_age?: number;
  avatar_type?: string;
  category_id?: Id;
  q?: string;
  tab?: string;
  page?: number;
  per_page?: number;
}

export class Avatars {
  list(params?: AvatarListFilters): Promise<JsonObject>;
  get(avatarId: Id): Promise<JsonObject>;
  consentDocument(avatarId: Id, dest?: null, options?: { kind?: string | null }): Promise<Buffer>;
  consentDocument(avatarId: Id, dest: string, options?: { kind?: string | null }): Promise<string>;
  generate(name?: string | null, payload?: JsonObject): Promise<JsonObject>;
  generate(payload: JsonObject): Promise<JsonObject>;
  createFromSteps(name: string, imagesByView: Partial<Record<ViewType | string, string>>, payload?: JsonObject): Promise<JsonObject>;
  improvePrompt(prompt: string, payload?: JsonObject): Promise<JsonObject>;
  analyzeAttributes(prompt: string): Promise<JsonObject>;
  update(avatarId: Id, fields?: JsonObject): Promise<JsonObject>;
  delete(avatarId: Id): Promise<JsonObject>;
  uploadView(avatarId: Id, viewType: ViewType | string, imageUrl: string): Promise<JsonObject>;
  regenerateView(
    avatarId: Id,
    viewType: ViewType | string,
    options?: { prompt?: string; output_style?: string; outputStyle?: string }
  ): Promise<JsonObject>;
  regenerateVariants(avatarId: Id, options?: { output_style?: string; outputStyle?: string }): Promise<JsonObject>;
  generatedVersion(
    avatarId: Id,
    options?: {
      prompt?: string;
      extra_reference_urls?: string[];
      extraReferenceUrls?: string[];
      output_style?: string;
      outputStyle?: string;
    }
  ): Promise<JsonObject>;
  setImageSet(avatarId: Id, mode: "original" | "generated" | string): Promise<JsonObject>;
  generateSheet(
    avatarId: Id,
    options?: { force?: boolean; prompt?: string; output_style?: string; outputStyle?: string }
  ): Promise<JsonObject>;
  generateVoice(
    avatarId: Id,
    options?: { generation_note?: string; generationNote?: string; force?: boolean }
  ): Promise<JsonObject>;
  resolveOutfitLink(url: string): Promise<JsonObject>;
  changeOutfit(
    avatarId: Id,
    items: JsonObject[],
    options?: { regenerate_views?: boolean; regenerateViews?: boolean }
  ): Promise<JsonObject>;
  restoreOutfit(avatarId: Id): Promise<JsonObject>;
}

export class Bulk {
  list(): Promise<any>;
  create(fields?: { prompt?: string; avatar_id?: number; avatarId?: number } & JsonObject): Promise<JsonObject>;
  get(bulkId: Id): Promise<JsonObject>;
  update(bulkId: Id, fields?: JsonObject): Promise<JsonObject>;
  delete(bulkId: Id): Promise<JsonObject>;
  uploadImages(bulkId: Id, files: Iterable<FileInput>): Promise<JsonObject>;
  removeItem(bulkId: Id, itemId: Id): Promise<JsonObject>;
  replaceProduct(bulkId: Id, itemId: Id, file: FileInput): Promise<JsonObject>;
  start(bulkId: Id): Promise<JsonObject>;
  cancelItem(bulkId: Id, itemId: Id): Promise<JsonObject>;
  regenerateItem(
    bulkId: Id,
    itemId: Id,
    options?: {
      prompt_override?: string;
      promptOverride?: string;
      verify_until_ok?: boolean;
      verifyUntilOk?: boolean;
      refine_last?: boolean;
      refineLast?: boolean;
    }
  ): Promise<JsonObject>;
  regenerateAll(bulkId: Id): Promise<JsonObject>;
  previews(bulkId: Id): Promise<JsonObject>;
  attempts(bulkId: Id, itemId: Id): Promise<JsonObject>;
  selectAttempt(bulkId: Id, itemId: Id, attemptIndex: number): Promise<JsonObject>;
  downloadProduct(bulkId: Id, itemId: Id, dest?: null): Promise<Buffer>;
  downloadProduct(bulkId: Id, itemId: Id, dest: string): Promise<string>;
  downloadItem(bulkId: Id, itemId: Id, dest?: null): Promise<Buffer>;
  downloadItem(bulkId: Id, itemId: Id, dest: string): Promise<string>;
  downloadGenerated(bulkId: Id, dest?: null, options?: { item_ids?: Iterable<Id>; itemIds?: Iterable<Id> }): Promise<Buffer>;
  downloadGenerated(bulkId: Id, dest: string, options?: { item_ids?: Iterable<Id>; itemIds?: Iterable<Id> }): Promise<string>;
  downloadGenerated(bulkId: Id, options: { item_ids?: Iterable<Id>; itemIds?: Iterable<Id> }): Promise<Buffer>;
  /** Resolves on `completed`, `partially_completed` or `failed` (a failed bulk is returned, not thrown). */
  wait(bulkId: Id, options?: WaitOptions): Promise<JsonObject>;
}

export interface GenerationFilters extends JsonObject {
  type?: "image" | "video" | string;
  page?: number;
  per_page?: number;
  perPage?: number;
  date_from?: string;
  dateFrom?: string;
  date_to?: string;
  dateTo?: string;
  collection_id?: Id;
  collectionId?: Id;
  generated_by_user_id?: Id;
  generatedByUserId?: Id;
}

export class Generations {
  list(filters?: GenerationFilters): Promise<JsonObject>;
  /** Async generator walking every page (default `per_page` 50). */
  iterate(filters?: GenerationFilters): AsyncGenerator<JsonObject, void, unknown>;
}

export class Pricing {
  catalog(): Promise<JsonObject>;
  /** `callType`: "image" | "video" | "background". */
  quote(callType: string, payload?: JsonObject): Promise<JsonObject>;
  videoPackagesCatalog(): Promise<JsonObject>;
  /** `tier`: starter | growth | scale. */
  videoPackagesQuote(tier: string, payload?: { usage_rights?: UsageRight[]; usageRights?: UsageRight[] } & JsonObject): Promise<JsonObject>;
  usageRightsRules(): Promise<JsonObject>;
}

export class Assets {
  list(options?: { category_id?: Id; categoryId?: Id }): Promise<JsonObject>;
  create(
    name: string,
    primaryImage: FileInput,
    options?: {
      category_id?: Id;
      categoryId?: Id;
      product_description?: string;
      productDescription?: string;
      product_details?: string;
      productDetails?: string;
    }
  ): Promise<JsonObject>;
  importAmazon(url: string, options?: { language_code?: string; languageCode?: string }): Promise<JsonObject>;
  get(assetId: Id): Promise<JsonObject>;
  update(assetId: Id, fields?: JsonObject): Promise<JsonObject>;
  delete(assetId: Id): Promise<JsonObject>;
  addImage(assetId: Id, file: FileInput): Promise<JsonObject>;
  removeImage(assetId: Id, imageId: Id): Promise<JsonObject>;
}

export class Collections {
  list(params?: JsonObject): Promise<JsonObject>;
  create(name: string, options?: { description?: string; cover?: FileInput }): Promise<JsonObject>;
  get(collectionId: Id): Promise<JsonObject>;
  update(collectionId: Id, options?: { name?: string; description?: string; cover?: FileInput }): Promise<JsonObject>;
  delete(collectionId: Id): Promise<JsonObject>;
  generations(collectionId: Id, params?: JsonObject): Promise<JsonObject>;
  addGeneration(collectionId: Id, logId: Id): Promise<JsonObject>;
  removeGeneration(collectionId: Id, logId: Id): Promise<JsonObject>;
  moveGeneration(collectionId: Id, logId: Id, targetCollectionId: Id): Promise<JsonObject>;
  availableGenerations(collectionId: Id, params?: { limit?: number; offset?: number } & JsonObject): Promise<JsonObject>;
}

export class Backgrounds {
  list(params?: { limit?: number; offset?: number; q?: string } & JsonObject): Promise<JsonObject>;
  create(options?: {
    file?: FileInput;
    image_url?: string;
    imageUrl?: string;
    name?: string;
    source?: string;
    prompt?: string;
  }): Promise<JsonObject>;
  get(backgroundId: Id): Promise<JsonObject>;
  update(backgroundId: Id, fields?: JsonObject): Promise<JsonObject>;
  delete(backgroundId: Id): Promise<JsonObject>;
}

export class Categories {
  list(): Promise<any>;
  selected(): Promise<JsonObject>;
  setSelected(categoryIds: Iterable<Id>): Promise<JsonObject>;
}

/** File uploads -> hosted URLs (portal JWT only). */
export class Uploads {
  image(file: FileInput, folder?: string | null): Promise<JsonObject>;
  /** Signed release / ID document, stored privately (folder `avatar-consents`). */
  consentDocument(file: FileInput): Promise<JsonObject>;
  referenceAudio(file: FileInput): Promise<JsonObject>;
}

export interface Voice extends JsonObject {
  voice_id: string;
  name: string;
  category?: string;
  labels?: JsonObject;
  description?: string;
  preview_url?: string;
}

/** Voices for the video voiceover (portal JWT only). */
export class Audio {
  /** GET /audio/voices -> `{configured, voices}`. */
  voices(): Promise<{ configured: boolean; voices: Voice[] } & JsonObject>;
}

/** BYO compliance documents (portal JWT only). */
export class Legal {
  byoStatus(): Promise<JsonObject>;
  manlevaTemplate(dest?: null): Promise<Buffer>;
  manlevaTemplate(dest: string): Promise<string>;
  liberatoriaTemplate(dest?: null): Promise<Buffer>;
  liberatoriaTemplate(dest: string): Promise<string>;
  uploadManleva(
    tenantId: Id,
    file: FileInput,
    options?: {
      signed_by_name?: string;
      signedByName?: string;
      signed_by_role?: string;
      signedByRole?: string;
      document_version?: string;
      documentVersion?: string;
      template_download_reference?: string;
      templateDownloadReference?: string;
    }
  ): Promise<JsonObject>;
  attachLiberatoria(
    tenantId: Id,
    avatarId: Id,
    options: {
      release_doc_url?: string;
      releaseDocUrl?: string;
      id_doc_url?: string;
      idDocUrl?: string;
      model_email?: string;
      modelEmail?: string;
      model_dob?: string;
      modelDob?: string;
    } & JsonObject
  ): Promise<JsonObject>;
}

export class Agency {
  clients(): Promise<JsonObject>;
  client(relationshipId: Id): Promise<JsonObject>;
  inviteClient(inviteEmail: string, terms?: JsonObject): Promise<JsonObject>;
  createClient(
    companyName: string,
    companyCountry: string,
    legalConsents: JsonObject,
    options?: { vat_number?: string; vatNumber?: string } & JsonObject
  ): Promise<JsonObject>;
  updateClient(
    relationshipId: Id,
    options: { access_mode?: "autonomous" | "read_only" | string; accessMode?: "autonomous" | "read_only" | string }
  ): Promise<JsonObject>;
  resendInvite(relationshipId: Id): Promise<JsonObject>;
  claimInvite(relationshipId: Id, inviteEmail: string): Promise<JsonObject>;
  topup(relationshipId: Id, amount: number): Promise<JsonObject>;
  requestTermination(relationshipId: Id, reason: string): Promise<JsonObject>;
  respondTermination(relationshipId: Id, accept: boolean, options?: { reason?: string }): Promise<JsonObject>;
  cancelTermination(relationshipId: Id): Promise<JsonObject>;
}

export class Brand {
  acceptManagerInvite(token: string): Promise<JsonObject>;
  rejectManagerInvite(token: string): Promise<JsonObject>;
  managerRelationship(): Promise<JsonObject>;
  managerRelationships(): Promise<JsonObject>;
  requestTermination(reason: string): Promise<JsonObject>;
  respondTermination(accept: boolean, options?: { reason?: string }): Promise<JsonObject>;
  cancelTermination(): Promise<JsonObject>;
}

export const FOLDERS: string[];
export const DURATIONS: number[];
export const VIEW_TYPES: ViewType[];
/** SDK version (same as package.json). */
export const VERSION: string;

/** True when no auto-edit is asked, it is done, or it stopped (failed / expired). */
export function montageSettled(job: JsonObject): boolean;

/** StudioHero helpers (pure functions, no HTTP): storyboard -> the fields the portal sends. */
export namespace studiohero {
  const AVATAR_VIEW_TYPES: AvatarViewType[];
  const LOGO_MODES: LogoMode[];
  const VIDEO_TYPES: VideoType[];
  const UGC_STYLES: UgcStyle[];
  /** The storyboard itself or the `storyboard.wait()` payload -> a copy of the storyboard. */
  function unwrapStoryboard(storyboard: any): JsonObject;
  function dedupeUrls(urls: Iterable<any>, options?: { allowDataUrls?: boolean }): string[];
  function segmentPrompts(storyboard: any): string[];
  function segmentReferenceImageUrls(storyboard: any): string[][];
  /** `custom_prompt`, `studiohero_segment_prompts`, `studiohero_segment_reference_image_urls`, `duration_seconds`. */
  function storyboardStartFields(storyboard: any): JsonObject;
  function hasSpokenText(value: any): boolean;
  function cleanSpokenText(value: any): string;
  function roleKey(value: any, fallback?: string): string;
  function voiceRoles(storyboard: any): VoiceRole[];
  function voiceCast(storyboard: any, voiceIds?: VoiceIds): VoiceCast;
  function missingVoiceRoles(storyboard: any, voiceIds?: VoiceIds): string[];
  function firstVoiceId(cast: any): string | null;
  function recommendOption(item: any): RecommendOption;
  function truthy(value: any): boolean;
}
