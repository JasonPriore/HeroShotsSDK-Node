"use strict";

const { Resource } = require("./base");

/** Voices for the video voiceover (portal JWT only). */
class Audio extends Resource {
  /**
   * GET /audio/voices -> `{configured, voices: [{voice_id, name, category, labels, description, preview_url}]}`.
   *
   * The voices the StudioHero voice picker offers. Pass a `voice_id` (one, or one
   * per speaking role) to `longvideo.startFromStoryboard(storyboard, { voice_id })`
   * or `storyboard.voiceCast()`. `configured` is false (and `voices` empty) when
   * no voice provider is set up.
   */
  voices() {
    return this._get("/audio/voices");
  }
}

module.exports = { Audio };
