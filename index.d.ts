export type JsonObject = Record<string, any>;
export type ProgressCallback = (payload: JsonObject) => void;

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
export class RateLimitError extends ApiError {}
export class InternalError extends ApiError {}
export class PollTimeoutError extends HeroShotsError {}

export interface ClientOptions {
  baseUrl?: string;
  token?: string | null;
  email?: string | null;
  password?: string | null;
  timeout?: number;
  fetch?: typeof fetch;
  autoRelogin?: boolean;
}

export interface WaitOptions {
  interval?: number;
  timeout?: number;
  onProgress?: ProgressCallback | null;
}

export class HeroShotsClient {
  constructor(options?: ClientOptions | string);
  static fromLogin(email: string, password: string, options?: ClientOptions): Promise<HeroShotsClient>;

  baseUrl: string;
  token: string | null;
  avatars: Avatars;
  images: Images;
  longvideo: LongVideo;
  stilllife: StillLife;
  storyboard: Storyboard;
  uploads: Uploads;
  videos: Videos;

  login(email: string, password: string): Promise<JsonObject>;
  me(): Promise<JsonObject>;
  stats(): Promise<JsonObject>;
  balance(): Promise<JsonObject>;
  request(method: string, path: string, options?: JsonObject): Promise<any>;
}

export { HeroShotsClient as Client };

export class Avatars {
  list(params?: JsonObject): Promise<JsonObject>;
  get(avatarId: number): Promise<JsonObject>;
  generate(payload?: JsonObject): Promise<JsonObject>;
}

export class Images {
  generate(productImageUrl: string, subjectImageUrl?: string | null | JsonObject, payload?: JsonObject): Promise<JsonObject>;
  candidates(productImageUrl: string, subjectImageUrl?: string | null | JsonObject, payload?: JsonObject): Promise<JsonObject>;
  selectCandidate(token: string, payload?: JsonObject): Promise<JsonObject>;
  status(generationId: string): Promise<JsonObject>;
  download(logId: string): Promise<JsonObject>;
  wait(generationId: string, options?: WaitOptions): Promise<JsonObject>;
}

export class Videos {
  generate(imageUrl?: string | null, payload?: JsonObject): Promise<JsonObject>;
  status(taskId: string): Promise<JsonObject>;
  wait(taskId: string, options?: WaitOptions): Promise<JsonObject>;
}

export class LongVideo {
  start(imageUrl?: string | null, payload?: JsonObject): Promise<JsonObject>;
  status(jobId: number): Promise<JsonObject>;
  view(token: string): Promise<JsonObject>;
  wait(jobId: number, options?: WaitOptions): Promise<JsonObject>;
}

export class StillLife {
  start(productUrl: string, backgroundUrl: string, payload?: JsonObject): Promise<JsonObject>;
  status(taskId: string): Promise<JsonObject>;
  wait(taskId: string, options?: WaitOptions): Promise<JsonObject>;
  previewBackground(taskId: string, payload?: JsonObject): Promise<JsonObject>;
  changeBackground(taskId: string, payload?: JsonObject): Promise<JsonObject>;
  changeBackgroundStatus(taskId: string): Promise<JsonObject>;
}

export class Storyboard {
  briefSuggestions(productImageUrl?: string | null, subjectImageUrl?: string | null, payload?: JsonObject): Promise<string[] | JsonObject>;
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
  frames(storyboard: JsonObject, productImageUrl?: string | null, subjectImageUrl?: string | null, payload?: JsonObject): Promise<JsonObject>;
  revise(revisionRequest: string, customPrompt: string, durationSeconds: number, storyboard: JsonObject, payload?: JsonObject): Promise<JsonObject>;
  status(jobId: string): Promise<JsonObject>;
  wait(jobId: string, options?: WaitOptions): Promise<JsonObject>;
  subjectMeasurements(payload?: JsonObject): Promise<JsonObject>;
  analyzeProduct(payload?: JsonObject): Promise<JsonObject>;
  creativity(payload?: JsonObject): Promise<JsonObject>;
}

export const FOLDERS: string[];
export const DURATIONS: number[];
