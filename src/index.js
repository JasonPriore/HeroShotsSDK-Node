"use strict";

const client = require("./client");
const errors = require("./errors");
const polling = require("./polling");
const studiohero = require("./studiohero");
const { FOLDERS } = require("./resources/uploads");
const { DURATIONS } = require("./resources/storyboard");
const { VIEW_TYPES } = require("./resources/avatars");
const { montageSettled } = require("./resources/longvideo");
const { version: VERSION } = require("../package.json");

module.exports = {
  ...client,
  ...errors,
  PollTimeoutError: polling.TimeoutError,
  FOLDERS,
  DURATIONS,
  VIEW_TYPES,
  VERSION,
  // StudioHero helpers (pure functions, no HTTP): storyboard -> render fields, voices.
  studiohero,
  montageSettled
};
