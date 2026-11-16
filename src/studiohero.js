"use strict";

/**
 * StudioHero helpers: turn a storyboard into the fields the web portal sends.
 *
 * Pure functions (no HTTP). They mirror the StudioHero web app (`src/App.jsx`
 * and `src/utils/studioHeroVoiceCast.js` in the portal) so that an SDK render is
 * the same request the portal makes:
 *
 * - `segmentPrompts` -> `studiohero_segment_prompts`
 * - `segmentReferenceImageUrls` -> `studiohero_segment_reference_image_urls`
 * - `voiceRoles` / `voiceCast` -> `voiceover_cast` (one voice per role)
 * - `storyboardStartFields` -> the storyboard part of `/long-video/start`
 *
 * Same behaviour as the Python SDK's `heroshots._studiohero`.
 */

// Avatar views the render accepts as `avatar_view_type` (backend avatar_prompt.py).
// "avatar" is not a view: the render answers "Selected avatar view is not available".
const AVATAR_VIEW_TYPES = [
  "fullbody", "profile_left", "profile_right", "mezzo_busto", "closeup",
  "ear", "wrist", "feet", "bust_only", "legs_lower"
];
const LOGO_MODES = ["in_video", "end_only", "off"];
const VIDEO_TYPES = ["ugc", "cinema", "spot_tv", "sas_software"];
const UGC_STYLES = ["amateur", "top_creator"];

const EMPTY_LINE_RE = new RegExp(
  "^(?:nessuna\\s+(?:battuta|frase)(?:\\s+\\S+)*|nessun(?:a)?\\s+(?:voce|dialogo|parlato)(?:\\s+\\S+)*" +
    "|no\\s+(?:spoken|dialogue|voiceover)(?:\\s+\\S+)*|none|n/a|-)\\.?$",
  "i"
);
const PRODUCTION_CONTROL_RE = new RegExp(
  "(?:^|\\s+)(?:speak the line once\\b|deliver the narration once\\b" +
    "|timeline(?:\\s*&\\s*action plan|\\s+directives)?\\b|shot plan\\b|speech\\s*&\\s*synchronization rule\\b" +
    "|control frame target\\b|seedance controls\\s*:|refs\\s*:|invariant\\s*:|situational sound design\\b" +
    "|guardrails\\s*:|quality constraints\\s*:|audio\\s*/\\s*lip-sync plan\\s*:)",
  "i"
);
// Timing / camera cues inside a spoken line: "(0s-5s on-camera) Line."
const INLINE_CUE_RE = new RegExp(
  "[\\[(]\\s*(?:\\d+(?:[.,]\\d+)?\\s*s?\\s*(?:-|–|—|to)\\s*\\d+(?:[.,]\\d+)?\\s*s(?:ec(?:onds?)?)?\\b[^)\\]\\n]{0,40}" +
    "|(?:on|off)[\\s-]*camera\\b[^)\\]\\n]{0,30})[\\])]\\s*[:\\-–—]?\\s*",
  "gi"
);
const ORPHAN_CAMERA_CUE_RE = /^\s*(?:on|off)[\s-]*camera\s*[)\]]\s*[:\-–—]?\s*/i;
const ROLE_PREFIX_RE = /^["“'‘]?\s*(?:soggetto|subject|narratore|narrator|voice[ -]?over)(?:\s+\d+)?\s*:\s*["“'‘]?/i;
const ROLE_LABELS = {
  subject_1: "Soggetto",
  subject_2: "Soggetto 2",
  subject_3: "Soggetto 3",
  voice_over: "Narratore",
  narrator: "Narratore"
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Python-like `str(value or "")`. */
function str(value) {
  return value ? String(value) : "";
}

/** Python-like truthiness for options (empty strings, arrays and objects are false). */
function truthy(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

// -- storyboard shape -------------------------------------------------------

/** Accept the storyboard itself or the `storyboard.wait()` payload (`{storyboard: {...}}`). Returns a copy. */
function unwrapStoryboard(storyboard) {
  if (!isPlainObject(storyboard)) {
    return {};
  }
  const inner = storyboard.storyboard;
  if (!("segments" in storyboard) && isPlainObject(inner)) {
    return { ...inner };
  }
  return { ...storyboard };
}

function segmentsOf(storyboard) {
  const segments = unwrapStoryboard(storyboard).segments;
  return Array.isArray(segments) ? segments.filter(isPlainObject) : [];
}

function sequenceOf(segment) {
  const seq = segment.script_sequence;
  return isPlainObject(seq) ? seq : {};
}

/** Trimmed, non-empty, first-seen order; `data:` URLs dropped (as the portal does). */
function dedupeUrls(urls, { allowDataUrls = false } = {}) {
  const out = [];
  for (const url of urls || []) {
    const clean = str(url).trim();
    if (!clean || out.includes(clean)) {
      continue;
    }
    if (!allowDataUrls && clean.toLowerCase().startsWith("data:")) {
      continue;
    }
    out.push(clean);
  }
  return out;
}

/** `visual_prompt` (or `seedance_prompt`) of every segment, empty ones skipped. */
function segmentPrompts(storyboard) {
  const out = [];
  for (const seg of segmentsOf(storyboard)) {
    const prompt = seg.visual_prompt || seg.seedance_prompt;
    if (prompt) {
      out.push(prompt);
    }
  }
  return out;
}

/** Per segment: its `reference_frames[].image_url` plus `control_frame.image_url`. */
function segmentReferenceImageUrls(storyboard) {
  const out = [];
  for (const seg of segmentsOf(storyboard)) {
    const seq = sequenceOf(seg);
    const urls = [];
    const frames = Array.isArray(seq.reference_frames) ? seq.reference_frames : [];
    for (const frame of frames) {
      if (isPlainObject(frame) && frame.image_url) {
        urls.push(frame.image_url);
      }
    }
    if (isPlainObject(seq.control_frame) && seq.control_frame.image_url) {
      urls.push(seq.control_frame.image_url);
    }
    out.push(dedupeUrls(urls));
  }
  return out;
}

/**
 * The storyboard part of a portal render: `custom_prompt` (the storyboard's
 * `optimized_prompt`), `studiohero_segment_prompts`,
 * `studiohero_segment_reference_image_urls` (only when at least one segment has
 * frames) and `duration_seconds`.
 */
function storyboardStartFields(storyboard) {
  const sb = unwrapStoryboard(storyboard);
  const fields = {};
  if (sb.optimized_prompt) {
    fields.custom_prompt = sb.optimized_prompt;
  }
  const prompts = segmentPrompts(sb);
  if (prompts.length) {
    fields.studiohero_segment_prompts = prompts;
  }
  const refs = segmentReferenceImageUrls(sb);
  if (refs.some((urls) => urls.length > 0)) {
    fields.studiohero_segment_reference_image_urls = refs;
  }
  if (sb.duration_seconds) {
    fields.duration_seconds = sb.duration_seconds;
  }
  return fields;
}

// -- voice cast -------------------------------------------------------------

function hasSpokenText(value) {
  const clean = str(value).trim();
  return Boolean(clean) && !EMPTY_LINE_RE.test(clean);
}

/** Spoken line without production notes, timing cues, role prefix or wrapping quotes. */
function cleanSpokenText(value) {
  let clean = str(value).trim();
  const marker = PRODUCTION_CONTROL_RE.exec(clean);
  if (marker) {
    clean = clean.slice(0, marker.index).trim();
  }
  clean = clean.replace(INLINE_CUE_RE, " ").trim();
  clean = clean.replace(ORPHAN_CAMERA_CUE_RE, "");
  clean = clean.replace(ROLE_PREFIX_RE, "");
  clean = clean.replace(/\s+/g, " ");
  clean = clean.replace(/^["“'‘]+|["”'’]+$/g, "");
  return clean.trim();
}

/** Normalise a role id: ""/subject/soggetto -> subject_1, narrator/vo/... -> voice_over. */
function roleKey(value, fallback = "subject_1") {
  const clean = str(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!clean) {
    return fallback;
  }
  if (clean === "subject" || clean === "soggetto") {
    return "subject_1";
  }
  if (["voiceover", "voice_over", "narrator", "narratore", "vo"].includes(clean)) {
    return "voice_over";
  }
  const match = /^(?:subject|soggetto)_?(\d+)$/.exec(clean);
  if (match) {
    return `subject_${match[1]}`;
  }
  return clean;
}

function roleKeyFromLabel(label) {
  const clean = str(label).toLowerCase();
  if (clean.includes("2")) {
    return "subject_2";
  }
  if (clean.includes("3")) {
    return "subject_3";
  }
  if (clean.includes("voice") || clean.includes("narrator") || clean.includes("narratore")) {
    return "voice_over";
  }
  return "subject_1";
}

function roleType(key) {
  return key === "voice_over" || key === "narrator" ? "narrator" : "subject";
}

function fallbackLabel(key) {
  if (Object.prototype.hasOwnProperty.call(ROLE_LABELS, key)) {
    return ROLE_LABELS[key];
  }
  const match = /^subject_(\d+)$/.exec(key);
  if (match) {
    return match[1] === "1" ? "Soggetto" : `Soggetto ${match[1]}`;
  }
  return key;
}

function makeEntry(raw, fallbackIndex = 1) {
  if (!isPlainObject(raw)) {
    return null;
  }
  const key = roleKey(raw.role_id || raw.role || raw.key, `subject_${fallbackIndex}`);
  const text = cleanSpokenText(raw.spoken_it || raw.text || raw.spoken_text);
  if (!hasSpokenText(text)) {
    return null;
  }
  const label = str(raw.label_it || raw.label || fallbackLabel(key)).trim() || fallbackLabel(key);
  const type = str(raw.role_type || roleType(key)).trim() || roleType(key);
  return {
    key,
    label,
    role_type: type,
    text,
    tts_text: cleanSpokenText(raw.tts_text) || text
  };
}

const OPENING_QUOTES = "\"'“‘";
const CLOSING_QUOTES = "\"'”’";

function canonicalVoiceover(value) {
  const text = str(value).replace(/(?:^|\s)(?:\(\d+\)|\d+[.)])\s*/g, "\n");
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^[-*]\s*/, "").trim();
    if (line.length >= 2 && OPENING_QUOTES.includes(line[0]) && CLOSING_QUOTES.includes(line[line.length - 1])) {
      line = line.slice(1, -1).trim();
    }
    if (line) {
      lines.push(line);
    }
  }
  return cleanSpokenText(lines.join(" "));
}

function textKey(value) {
  return str(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** A single role whose line is a cut of the segment's voiceover_text speaks the whole text. */
function reconcileSingleRole(segment, entries) {
  if (entries.length !== 1) {
    return entries;
  }
  const canonical = canonicalVoiceover(segment.voiceover_text);
  const canonicalKey = textKey(canonical);
  const currentKey = textKey(entries[0].text);
  if (!canonicalKey || !currentKey || canonicalKey.length <= currentKey.length || !canonicalKey.includes(currentKey)) {
    return entries;
  }
  const tags = /^\s*((?:\[[^\]\r\n]{1,80}\]\s*)+)/.exec(str(entries[0].tts_text));
  const tts = tags ? `${tags[1].trim()} ${canonical}` : canonical;
  return [{ ...entries[0], text: canonical, tts_text: tts }];
}

function segmentEntries(segment) {
  const seq = sequenceOf(segment);
  if (Array.isArray(seq.voice_cast)) {
    const entries = seq.voice_cast.map((raw, i) => makeEntry(raw, i + 1)).filter(Boolean);
    if (entries.length) {
      return reconcileSingleRole(segment, entries);
    }
  }
  const entries = [];
  const byRole = seq.spoken_by_role_it;
  if (isPlainObject(byRole)) {
    for (const [key, text] of Object.entries(byRole)) {
      const entry = makeEntry({ role_id: key, label_it: fallbackLabel(roleKey(key)), spoken_it: text });
      if (entry) {
        entries.push(entry);
      }
    }
  } else {
    const fallback = str(seq.spoken_it || segment.voiceover_text).trim();
    if (hasSpokenText(fallback)) {
      const key = roleKeyFromLabel(seq.speaker_label_it);
      const entry = makeEntry({ role_id: key, label_it: fallbackLabel(key), spoken_it: fallback });
      if (entry) {
        entries.push(entry);
      }
    }
  }
  return reconcileSingleRole(segment, entries);
}

function roleRank(role) {
  if (role.key === "voice_over" || role.role_type === "narrator") {
    return 900;
  }
  const match = /^subject_(\d+)$/.exec(role.key);
  return match ? Number(match[1]) : 500;
}

/**
 * Speaking roles of a storyboard, merged across segments.
 *
 * Each item: `{key, label, role_type, text, tts_text}` (`key` is e.g.
 * `subject_1` or `voice_over`). Subjects first, the narrator last.
 */
function voiceRoles(storyboard) {
  const merged = new Map();
  for (const seg of segmentsOf(storyboard)) {
    for (const entry of segmentEntries(seg)) {
      if (!merged.has(entry.key)) {
        merged.set(entry.key, {
          key: entry.key,
          label: entry.label,
          role_type: entry.role_type,
          texts: [],
          tts_texts: []
        });
      }
      const role = merged.get(entry.key);
      role.texts.push(entry.text);
      role.tts_texts.push(entry.tts_text || entry.text);
    }
  }
  const roles = [];
  for (const role of merged.values()) {
    const texts = [];
    for (const text of role.texts) {
      if (hasSpokenText(text) && !texts.includes(text)) {
        texts.push(text);
      }
    }
    const text = texts.join(" ");
    if (!hasSpokenText(text)) {
      continue;
    }
    roles.push({
      key: role.key,
      label: role.label,
      role_type: role.role_type,
      text,
      tts_text: role.tts_texts.filter(hasSpokenText).join(" ") || text
    });
  }
  roles.sort((a, b) => {
    const rank = roleRank(a) - roleRank(b);
    if (rank !== 0) {
      return rank;
    }
    if (a.label === b.label) {
      return 0;
    }
    return a.label < b.label ? -1 : 1;
  });
  return roles;
}

function voiceFor(voiceIds, key) {
  if (isPlainObject(voiceIds)) {
    return str(voiceIds[key]).trim();
  }
  return str(voiceIds).trim();
}

/**
 * `voiceover_cast` for `/long-video/start`: `{role_key: {label, role_type, voice_id, text, tts_text}}`.
 *
 * `voiceIds` is one voice id for every role, or an object `{role_key: voice_id}`
 * (see `voiceRoles` for the keys). Roles without a voice get `voice_id: ""`.
 */
function voiceCast(storyboard, voiceIds = null) {
  const cast = {};
  for (const role of voiceRoles(storyboard)) {
    cast[role.key] = {
      label: role.label,
      role_type: role.role_type,
      voice_id: voiceFor(voiceIds, role.key),
      text: role.text,
      tts_text: role.tts_text || role.text
    };
  }
  return cast;
}

/** Role keys that speak in the storyboard but have no voice in `voiceIds`. */
function missingVoiceRoles(storyboard, voiceIds = null) {
  return voiceRoles(storyboard).filter((role) => !voiceFor(voiceIds, role.key)).map((role) => role.key);
}

/** Voice of the first role of a `voiceover_cast` (the portal's `tts_voice_id`), or null. */
function firstVoiceId(cast) {
  let rows;
  if (Array.isArray(cast)) {
    rows = cast;
  } else if (isPlainObject(cast)) {
    rows = Object.values(cast);
  } else {
    return null;
  }
  for (const row of rows) {
    if (isPlainObject(row) && str(row.voice_id).trim()) {
      return str(row.voice_id).trim();
    }
  }
  return null;
}

// -- recommendation options -------------------------------------------------

/** `{title, text}` from a string, a brief suggestion (`{title, brief}`) or a concept candidate. */
function recommendOption(item) {
  if (!isPlainObject(item)) {
    return { title: "", text: str(item) };
  }
  const title = str(item.title);
  if (item.text) {
    return { title, text: String(item.text) };
  }
  if (item.brief) {
    return { title, text: String(item.brief) };
  }
  const parts = [item.logline, item.visual_direction];
  if (Array.isArray(item.clip_plan)) {
    parts.push(...item.clip_plan);
  }
  return { title, text: parts.filter(Boolean).map(String).join(" · ") };
}

module.exports = {
  AVATAR_VIEW_TYPES,
  LOGO_MODES,
  UGC_STYLES,
  VIDEO_TYPES,
  cleanSpokenText,
  dedupeUrls,
  firstVoiceId,
  hasSpokenText,
  missingVoiceRoles,
  recommendOption,
  roleKey,
  segmentPrompts,
  segmentReferenceImageUrls,
  storyboardStartFields,
  truthy,
  unwrapStoryboard,
  voiceCast,
  voiceRoles
};
