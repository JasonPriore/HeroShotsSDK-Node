"use strict";

const { HeroShotsError, ProviderError } = require("./errors");

class TimeoutError extends HeroShotsError {}

const STORYBOARD_OK = ["done", "succeeded", "completed"];
const STORYBOARD_FAIL = ["failed", "error", "cancelled", "canceled"];
const MEDIA_OK = ["succeeded", "done", "completed"];
const MEDIA_FAIL = ["failed", "error", "cancelled", "canceled"];

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function wait(getFn, {
  terminalOk = STORYBOARD_OK,
  terminalFail = STORYBOARD_FAIL,
  statusKey = "status",
  interval = 3.0,
  timeout = 600.0,
  onProgress = null
} = {}) {
  const ok = new Set(terminalOk.map((value) => String(value).toLowerCase()));
  const fail = new Set(terminalFail.map((value) => String(value).toLowerCase()));
  const deadline = Date.now() + timeout * 1000;

  while (true) {
    const payload = await getFn();
    if (onProgress) {
      onProgress(payload);
    }

    const status = String(payload?.[statusKey] || "").toLowerCase();
    if (ok.has(status)) {
      return payload;
    }
    if (fail.has(status)) {
      const err = payload?.error;
      if (err && typeof err === "object" && !Array.isArray(err)) {
        throw new ProviderError(err.message || `job ${status}`, {
          code: err.code || "provider_error",
          details: err
        });
      }
      throw new ProviderError(String(err || `job ${status}`), { code: "provider_error" });
    }
    if (Date.now() >= deadline) {
      throw new TimeoutError(`job did not finish within ${timeout}s (last status=${JSON.stringify(status)})`);
    }
    if (interval > 0) {
      await sleep(interval);
    }
  }
}

module.exports = {
  TimeoutError,
  STORYBOARD_OK,
  STORYBOARD_FAIL,
  MEDIA_OK,
  MEDIA_FAIL,
  wait
};
