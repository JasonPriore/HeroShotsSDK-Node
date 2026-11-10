"use strict";

const client = require("./client");
const errors = require("./errors");
const polling = require("./polling");
const { FOLDERS } = require("./resources/uploads");
const { DURATIONS } = require("./resources/storyboard");
const { VIEW_TYPES } = require("./resources/avatars");

module.exports = {
  ...client,
  ...errors,
  PollTimeoutError: polling.TimeoutError,
  FOLDERS,
  DURATIONS,
  VIEW_TYPES
};
