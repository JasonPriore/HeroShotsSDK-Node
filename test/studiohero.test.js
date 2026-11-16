"use strict";

// StudioHero portal parity: storyboard -> render fields, voices, montage, downloads.
// Mirrors the Python SDK's tests/test_studiohero.py.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { HeroShotsClient, ValidationError, VERSION, studiohero } = require("../src");
const { LongVideo } = require("../src/resources/longvideo");
const { Storyboard: StoryboardClass } = require("../src/resources/storyboard");

const BASE = "https://api.test";

function makeResponse(body, status = 200, headers = {}) {
  let bytes;
  if (Buffer.isBuffer(body)) {
    bytes = body;
  } else if (typeof body === "string") {
    bytes = Buffer.from(body);
  } else if (body === null || body === undefined) {
    bytes = Buffer.alloc(0);
  } else {
    bytes = Buffer.from(JSON.stringify(body));
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function ok(data) {
  return { success: true, data };
}

function makeFetch(responses) {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    if (!response) {
      throw new Error(`No mock response for ${url}`);
    }
    return response;
  };
  fetchMock.calls = calls;
  return fetchMock;
}

function jwtClient(responses = [], options = {}) {
  const fetch = makeFetch(responses);
  const client = new HeroShotsClient({ baseUrl: BASE, token: "jwt", autoRelogin: false, fetch, ...options });
  client._sleep = async () => {};
  return { client, fetch };
}

function jsonBody(call) {
  return JSON.parse(call.options.body);
}

function storyboard() {
  return {
    duration_seconds: 30,
    optimized_prompt: "OPTIMIZED PROMPT",
    storyboard_board_image_url: "https://cdn/board.png",
    segments: [
      {
        index: 1,
        visual_prompt: "seg 1 visual",
        seedance_prompt: "seg 1 seedance",
        voiceover_text: "Ciao a tutti.",
        script_sequence: {
          reference_frames: [
            { role: "start", image_url: "https://cdn/f1.png" },
            { role: "mid", image_url: "https://cdn/f1.png" },
            { role: "end", image_url: "" }
          ],
          control_frame: { image_url: "https://cdn/c1.png" },
          voice_cast: [
            { role_id: "soggetto", label_it: "Soggetto", spoken_it: "Ciao a tutti." },
            { role: "narratore", text: "Scopri la novità.", tts_text: "[warm] Scopri la novità." }
          ]
        }
      },
      {
        index: 2,
        seedance_prompt: "seg 2 seedance",
        script_sequence: {
          voice_cast: [
            { key: "subject", spoken_it: "Ciao a tutti." },
            { role_id: "VO", spoken_it: "Solo da noi." }
          ]
        }
      },
      {
        index: 3,
        visual_prompt: "seg 3 visual",
        script_sequence: { spoken_it: "Nessuna battuta" }
      }
    ]
  };
}

// -- 1. start({ storyboard }) ------------------------------------------------

test("start(storyboard) sends the portal fields, not the raw storyboard", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 7 }), 202)]);
  await client.longvideo.start(null, { product_image_url: "https://cdn/p.jpg", storyboard: storyboard() });
  const body = jsonBody(fetch.calls.at(-1));
  assert.ok(!("storyboard" in body));
  assert.equal(body.custom_prompt, "OPTIMIZED PROMPT");
  assert.deepEqual(body.studiohero_segment_prompts, ["seg 1 visual", "seg 2 seedance", "seg 3 visual"]);
  assert.deepEqual(body.studiohero_segment_reference_image_urls, [["https://cdn/f1.png", "https://cdn/c1.png"], [], []]);
  assert.equal(body.duration_seconds, 30);
  assert.equal(body.product_image_url, "https://cdn/p.jpg");
});

test("start(storyboard): explicit options win and the wait() payload is accepted", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 7 }), 202)]);
  await client.longvideo.start(null, {
    storyboard: { status: "done", storyboard: storyboard() },
    customPrompt: "mine",
    duration_seconds: 45,
    studiohero_segment_prompts: ["a", "b", "c"]
  });
  const body = jsonBody(fetch.calls.at(-1));
  assert.equal(body.custom_prompt, "mine");
  assert.equal(body.duration_seconds, 45);
  assert.deepEqual(body.studiohero_segment_prompts, ["a", "b", "c"]);
  assert.ok(!("storyboard" in body));
});

test("start(storyboard) omits segment refs when no segment has frames", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 7 }), 202)]);
  const sb = { optimized_prompt: "p", segments: [{ visual_prompt: "v1" }, { visual_prompt: "v2" }] };
  await client.longvideo.start(null, { storyboard: sb });
  const body = jsonBody(fetch.calls.at(-1));
  assert.ok(!("studiohero_segment_reference_image_urls" in body));
  assert.deepEqual(body.studiohero_segment_prompts, ["v1", "v2"]);
});

test("start accepts montage and voiceover_cast (tts_voice_id from the first voice)", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 7 }), 202), makeResponse(ok({ job_id: 8 }), 202)]);
  const cast = { subject_1: { label: "Soggetto", role_type: "subject", voice_id: "v1", text: "x", tts_text: "x" } };
  await client.longvideo.start("https://cdn/p.jpg", {
    montage: { brief: "b", logo_mode: "off" },
    voiceover_cast: cast,
    language_code: "it"
  });
  const body = jsonBody(fetch.calls.at(-1));
  assert.deepEqual(body.montage, { brief: "b", logo_mode: "off" });
  assert.deepEqual(body.voiceover_cast, cast);
  assert.equal(body.tts_voice_id, "v1");
  assert.equal(body.language_code, "it");

  // camelCase spelling; an explicit tts_voice_id wins; montage false is not sent.
  await client.longvideo.start("https://cdn/p.jpg", { voiceoverCast: cast, tts_voice_id: "mine", montage: false });
  const second = jsonBody(fetch.calls.at(-1));
  assert.equal(second.tts_voice_id, "mine");
  assert.ok(!("montage" in second));
});

// -- 2. download absolute URLs ------------------------------------------------

test("download of an absolute CDN URL sends no token", async () => {
  const url = "https://cdn.example.com/long_video/final.mp4";
  const { client, fetch } = jwtClient([makeResponse(Buffer.from("mp4"))], { managedUserId: 9 });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hs-node-sh-"));
  const saved = await client.download(url, path.join(dir, "v.mp4"));
  assert.equal(await fs.readFile(saved, "utf8"), "mp4");
  const call = fetch.calls.at(-1);
  assert.equal(call.url, url);
  assert.ok(!("Authorization" in call.options.headers));
  assert.ok(!("X-Managed-User-Id" in call.options.headers));
});

test("download of an absolute URL on the API host sends the token", async () => {
  const url = `${BASE}/image/proxy/long_video/5/final.mp4`;
  const { client, fetch } = jwtClient([makeResponse(Buffer.from("mp4"))]);
  assert.equal((await client.download(url)).toString(), "mp4");
  assert.equal(fetch.calls.at(-1).options.headers.Authorization, "Bearer jwt");
});

test("another scheme or port is not the API host", async () => {
  const { client, fetch } = jwtClient([makeResponse(Buffer.from("a")), makeResponse(Buffer.from("b"))]);
  await client.download("http://api.test/x.mp4");
  assert.ok(!("Authorization" in fetch.calls.at(-1).options.headers));
  await client.download("https://api.test:8443/x.mp4");
  assert.ok(!("Authorization" in fetch.calls.at(-1).options.headers));
  assert.equal(fetch.calls.at(-1).url, "https://api.test:8443/x.mp4");
});

test("download of a relative path still prefixes baseUrl", async () => {
  const { client, fetch } = jwtClient([makeResponse(Buffer.from("v"))]);
  assert.equal((await client.download("/api/v1/video/3/download")).toString(), "v");
  assert.equal(fetch.calls.at(-1).url, `${BASE}/api/v1/video/3/download`);
  assert.equal(fetch.calls.at(-1).options.headers.Authorization, "Bearer jwt");
});

// -- 3. montage --------------------------------------------------------------

test("montage posts its fields and returns needs_export", async () => {
  const { client, fetch } = jwtClient([
    makeResponse({ job_id: 5, status: "segments_ready", needs_export: true })
  ]);
  const out = await client.longvideo.montage(5, {
    brief: "Sconto 20%",
    languageCode: "it",
    logo_mode: "end_only",
    inserts: [{ url: "https://cdn/app.png", label: "App" }]
  });
  assert.equal(out.needs_export, true);
  assert.equal(fetch.calls[0].url, `${BASE}/api/auth/long-video/5/montage`);
  assert.equal(fetch.calls[0].options.method, "POST");
  assert.deepEqual(jsonBody(fetch.calls[0]), {
    brief: "Sconto 20%",
    language_code: "it",
    logo_mode: "end_only",
    inserts: [{ url: "https://cdn/app.png", label: "App" }]
  });
});

test("montage without fields sends an empty object", async () => {
  const { client, fetch } = jwtClient([makeResponse({ status: "captioning" }, 202)]);
  assert.equal((await client.longvideo.montage(5)).status, "captioning");
  assert.deepEqual(jsonBody(fetch.calls[0]), {});
});

test("montageAvailable reads the availability flag", async () => {
  const { client, fetch } = jwtClient([makeResponse({ available: true }), makeResponse({ available: false })]);
  assert.equal(await client.longvideo.montageAvailable(), true);
  assert.equal(fetch.calls[0].url, `${BASE}/api/auth/studio/montage-availability`);
  assert.equal(fetch.calls[0].options.method, "GET");
  assert.equal(await client.longvideo.montageAvailable(), false);
});

test("montageSettled on instance, class and module", () => {
  const { client } = jwtClient();
  const { montageSettled } = require("../src");
  for (const fn of [(j) => client.longvideo.montageSettled(j), LongVideo.montageSettled, montageSettled]) {
    assert.equal(fn({ status: "done" }), true);
    assert.equal(fn({ montage_requested: true, montage_pending: true }), false);
    assert.equal(fn({ montage_requested: true, montage_pending: true, montage_done: true }), true);
    assert.equal(fn({ montage_requested: true, montage_pending: false }), true);
  }
});

test("render waits for montage_done", async () => {
  const m = { montage_requested: true };
  const { client, fetch } = jwtClient([
    makeResponse(ok({ status: "segments_ready", ...m, montage_pending: true })),
    makeResponse({ status: "concatenating" }, 202),
    makeResponse(ok({ status: "concatenating", ...m, montage_pending: true })),
    // Short gap: the export is done, the auto-edit has not started yet.
    makeResponse(ok({ status: "done", final_video_url: "https://cdn/final.mp4", ...m,
      montage_pending: true, montage_done: false })),
    makeResponse(ok({ status: "captioning", final_video_url: "https://cdn/final.mp4", ...m,
      montage_pending: true, montage_progress: { stage: "render" } })),
    makeResponse(ok({ status: "done", final_video_url: "https://cdn/final.mp4",
      captioned_final_video_url: "https://cdn/montage.mp4", ...m, montage_pending: false, montage_done: true }))
  ]);
  const out = await client.longvideo.render(5, { interval: 0, timeout: 5 });
  assert.equal(out.captioned_final_video_url, "https://cdn/montage.mp4");
  assert.equal(out.montage_done, true);
  assert.equal(fetch.calls.filter((c) => c.url.includes("/status/")).length, 5);
});

test("wait keeps polling a done job while the montage runs", async () => {
  const { client } = jwtClient([
    makeResponse(ok({ status: "done", final_video_url: "https://cdn/f.mp4", montage_requested: true, montage_pending: true })),
    makeResponse(ok({ status: "captioning", montage_requested: true, montage_pending: true })),
    makeResponse(ok({ status: "done", final_video_url: "https://cdn/f.mp4",
      captioned_final_video_url: "https://cdn/m.mp4", montage_requested: true, montage_done: true }))
  ]);
  const out = await client.longvideo.wait(5, { interval: 0, timeout: 5 });
  assert.equal(out.captioned_final_video_url, "https://cdn/m.mp4");
});

test("render returns when the montage failed (no export)", async () => {
  const { client, fetch } = jwtClient([
    makeResponse(ok({ status: "done", final_video_url: "https://cdn/f.mp4", montage_requested: true,
      montage_pending: false, montage_done: false, montage_report: { error: "boom" } }))
  ]);
  const out = await client.longvideo.render(5, { interval: 0, timeout: 5 });
  assert.equal(out.final_video_url, "https://cdn/f.mp4");
  assert.equal(out.montage_report.error, "boom");
  assert.equal(fetch.calls.filter((c) => c.url.endsWith("/export")).length, 0);
});

// -- 4. voices ---------------------------------------------------------------

test("voiceRoles merges and normalises the roles", () => {
  const { client } = jwtClient();
  const roles = client.storyboard.voiceRoles(storyboard());
  assert.deepEqual(roles.map((r) => r.key), ["subject_1", "voice_over"]);
  const [subject, narrator] = roles;
  assert.deepEqual(subject, {
    key: "subject_1",
    label: "Soggetto",
    role_type: "subject",
    text: "Ciao a tutti.",
    tts_text: "Ciao a tutti. Ciao a tutti."
  });
  assert.equal(narrator.role_type, "narrator");
  assert.equal(narrator.label, "Narratore");
  assert.equal(narrator.text, "Scopri la novità. Solo da noi.");
  assert.equal(narrator.tts_text, "[warm] Scopri la novità. Solo da noi.");
});

test("voiceCast with one voice or one per role; missingVoiceRoles", () => {
  const { client } = jwtClient();
  let cast = client.storyboard.voiceCast(storyboard(), "voice-A");
  assert.deepEqual(Object.keys(cast).sort(), ["subject_1", "voice_over"]);
  assert.ok(Object.values(cast).every((row) => row.voice_id === "voice-A"));
  cast = client.storyboard.voiceCast(storyboard(), { subject_1: "s", voice_over: "n" });
  assert.equal(cast.subject_1.voice_id, "s");
  assert.equal(cast.voice_over.voice_id, "n");
  assert.deepEqual(client.storyboard.missingVoiceRoles(storyboard(), { subject_1: "s" }), ["voice_over"]);
  // Static spelling too.
  assert.deepEqual(StoryboardClass.missingVoiceRoles(storyboard(), "v"), []);
});

test("voice roles fall back to spoken_by_role_it, spoken_it and voiceover_text", () => {
  const { client } = jwtClient();
  const byRole = { segments: [{ script_sequence: { spoken_by_role_it: { soggetto_2: "Io!", narrator: "Lui." } } }] };
  let roles = client.storyboard.voiceRoles(byRole);
  assert.deepEqual(roles.map((r) => [r.key, r.text]), [["subject_2", "Io!"], ["voice_over", "Lui."]]);
  assert.equal(roles[0].label, "Soggetto 2");
  const spoken = { segments: [{ script_sequence: { spoken_it: "\"Prova questo.\"" } }, { voiceover_text: "Davvero." }] };
  roles = client.storyboard.voiceRoles(spoken);
  assert.deepEqual(roles, [{
    key: "subject_1",
    label: "Soggetto",
    role_type: "subject",
    text: "Prova questo. Davvero.",
    tts_text: "Prova questo. Davvero."
  }]);
  assert.deepEqual(client.storyboard.voiceRoles({ segments: [{ voiceover_text: "none" }] }), []);
});

test("a single role cut from voiceover_text speaks the whole text", () => {
  const sb = { segments: [{
    voiceover_text: "1. \"Ciao a tutti.\" 2. Scopri la novità!",
    script_sequence: { voice_cast: [{ role_id: "subject_1", spoken_it: "Ciao a tutti.", tts_text: "[happy] Ciao a tutti." }] }
  }] };
  const [role] = studiohero.voiceRoles(sb);
  assert.equal(role.text, "Ciao a tutti. Scopri la novità!");
  assert.equal(role.tts_text, "[happy] Ciao a tutti. Scopri la novità!");
});

test("cleanSpokenText drops cues and production notes", () => {
  assert.equal(studiohero.cleanSpokenText("(0s-5s on-camera) Ciao! Shot plan: close up"), "Ciao!");
  assert.equal(studiohero.cleanSpokenText("Soggetto: \"Eccomi\""), "Eccomi");
});

test("audio.voices GETs /audio/voices", async () => {
  const payload = { configured: true, voices: [{ voice_id: "v1", name: "Giulia", category: "premade",
    labels: {}, description: "", preview_url: "" }] };
  const { client, fetch } = jwtClient([makeResponse(payload)]);
  const out = await client.audio.voices();
  assert.equal(out.voices[0].voice_id, "v1");
  assert.equal(fetch.calls[0].url, `${BASE}/audio/voices`);
  assert.equal(fetch.calls[0].options.method, "GET");
});

// -- 5. recommend ------------------------------------------------------------

test("recommend concept builds the portal options", async () => {
  const { client, fetch } = jwtClient([makeResponse({ recommended_index: 1, reason: "best fit" })]);
  const candidates = [
    { title: "A", logline: "la", visual_direction: "va", clip_plan: ["c1", "c2"] },
    { title: "B", logline: "lb" }
  ];
  const out = await client.storyboard.recommend("concept", candidates, "https://cdn/p.jpg", null, {
    chosenBrief: "il brief",
    duration_seconds: 30,
    video_type: "ugc"
  });
  assert.equal(out.recommended_index, 1);
  const body = jsonBody(fetch.calls[0]);
  assert.equal(fetch.calls[0].url, `${BASE}/video/storyboard/recommend`);
  assert.equal(body.kind, "concept");
  assert.deepEqual(body.options, [{ title: "A", text: "la · va · c1 · c2" }, { title: "B", text: "lb" }]);
  assert.equal(body.chosen_brief, "il brief");
  assert.equal(body.product_image_url, "https://cdn/p.jpg");
  assert.equal(body.video_type, "ugc");
});

test("recommend brief options from suggestions", async () => {
  const { client, fetch } = jwtClient([makeResponse({ recommended_index: 0, reason: "r" })]);
  await client.storyboard.recommend("brief", [{ title: "T", brief: "B1" }, "B2"]);
  const body = jsonBody(fetch.calls[0]);
  assert.deepEqual(body.options, [{ title: "T", text: "B1" }, { title: "", text: "B2" }]);
  assert.ok(!("chosen_brief" in body));
});

test("recommend rejects an unknown kind before any request", async () => {
  const { client, fetch } = jwtClient();
  await assert.rejects(() => client.storyboard.recommend("logo", ["a", "b"]), ValidationError);
  assert.equal(fetch.calls.length, 0);
});

// -- frames / board / merge --------------------------------------------------

test("frames and board send the segments", async () => {
  const { client, fetch } = jwtClient([makeResponse({ job_id: "f1" }, 202), makeResponse({ job_id: "b1" }, 202)]);
  const sb = { ...storyboard(), selected_candidate: { id: "c1" } };
  await client.storyboard.frames({ storyboard: sb }, "https://cdn/p.jpg");
  let body = jsonBody(fetch.calls[0]);
  assert.equal(fetch.calls[0].url, `${BASE}/video/storyboard/frames`);
  assert.deepEqual(body.segments, sb.segments);
  assert.deepEqual(body.selected_candidate, { id: "c1" });
  assert.equal(body.async_storyboard, true);
  assert.equal(body.duration_seconds, 30);
  assert.ok(!("storyboard" in body));
  await client.storyboard.board(sb, null, null, { video_type: "ugc" });
  body = jsonBody(fetch.calls[1]);
  assert.equal(fetch.calls[1].url, `${BASE}/video/storyboard/board`);
  assert.deepEqual(body.segments, sb.segments);
  assert.equal(body.storyboard_board_required, true);
  assert.equal(body.video_type, "ugc");
});

test("merge applies frames and board results", () => {
  const { client } = jwtClient();
  const sb = { duration_seconds: 30, segments: [{ index: 1 }], reference_frames_deferred: true };
  const framesJob = { status: "done", frames: { segments: [{ index: 1, script_sequence: {
    reference_frames: [{ image_url: "https://cdn/f.png" }] } }], reference_image_urls: ["https://cdn/f.png"] } };
  let merged = client.storyboard.merge(sb, framesJob);
  assert.equal(merged.reference_frames_deferred, false);
  assert.deepEqual(merged.reference_image_urls, ["https://cdn/f.png"]);
  assert.deepEqual(client.storyboard.segmentReferenceImageUrls(merged), [["https://cdn/f.png"]]);
  merged = StoryboardClass.merge(merged, { status: "done", board: { storyboard_board_image_url: "https://cdn/b.png" } });
  assert.equal(merged.storyboard_board_image_url, "https://cdn/b.png");
  assert.equal(merged.storyboard_board_duration_seconds, 30);
  assert.deepEqual(sb.segments, [{ index: 1 }]); // input untouched
  assert.deepEqual(client.storyboard.segmentPrompts({ segments: [{ seedance_prompt: "s" }, {}] }), ["s"]);
});

// -- 6. startFromStoryboard --------------------------------------------------

test("startFromStoryboard builds the portal render body", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 9 }), 202)]);
  await client.longvideo.startFromStoryboard({ status: "done", storyboard: storyboard() }, {
    product_image_url: "https://cdn/p.jpg",
    subjectImageUrl: "https://cdn/s.jpg",
    avatar_id: 12,
    avatarViewType: "mezzo_busto",
    additional_product_image_urls: ["https://cdn/p2.jpg", "https://cdn/p.jpg"],
    product_box_closed_url: "https://cdn/box-c.jpg",
    productBoxOpenUrl: "https://cdn/box-o.jpg",
    extra_products: [{ image_url: "https://cdn/b.jpg" }],
    brand_logo_url: "https://cdn/logo.png",
    brandLogoMode: "in_video",
    voice_id: { subject_1: "v-sub", voice_over: "v-nar" },
    language_code: "it",
    montage: true,
    brief: "Il mio brief",
    ratio: "9:16",
    resolution: "720p"
  });
  const body = jsonBody(fetch.calls.at(-1));
  assert.equal(fetch.calls.at(-1).url, `${BASE}/api/v1/long-video/start`);
  assert.equal(body.product_image_url, "https://cdn/p.jpg");
  assert.equal(body.subject_image_url, "https://cdn/s.jpg");
  assert.equal(body.avatar_id, 12);
  assert.equal(body.avatar_view_type, "mezzo_busto");
  assert.deepEqual(body.additional_product_image_urls, ["https://cdn/p2.jpg", "https://cdn/p.jpg"]);
  assert.equal(body.product_box_closed_url, "https://cdn/box-c.jpg");
  assert.equal(body.product_box_open_url, "https://cdn/box-o.jpg");
  assert.deepEqual(body.extra_products, [{ image_url: "https://cdn/b.jpg" }]);
  assert.equal(body.brand_logo_url, "https://cdn/logo.png");
  assert.equal(body.brand_logo_mode, "in_video");
  assert.equal(body.custom_prompt, "OPTIMIZED PROMPT");
  assert.equal(body.duration, 30);
  assert.equal(body.duration_seconds, 30);
  assert.equal(body.ratio, "9:16");
  assert.equal(body.resolution, "720p");
  assert.deepEqual(body.studiohero_segment_prompts, ["seg 1 visual", "seg 2 seedance", "seg 3 visual"]);
  assert.deepEqual(body.studiohero_segment_reference_image_urls[0], ["https://cdn/f1.png", "https://cdn/c1.png"]);
  assert.deepEqual(body.reference_image_urls, [
    "https://cdn/board.png", "https://cdn/p.jpg", "https://cdn/p2.jpg", "https://cdn/s.jpg"
  ]);
  assert.equal(body.voiceover_cast.subject_1.voice_id, "v-sub");
  assert.equal(body.voiceover_cast.voice_over.voice_id, "v-nar");
  assert.equal(body.tts_voice_id, "v-sub");
  assert.equal(body.language_code, "it");
  assert.deepEqual(body.montage, {
    brief: "Il mio brief",
    language_code: "it",
    logo_url: "https://cdn/logo.png",
    logo_mode: "in_video"
  });
  assert.ok(!("storyboard" in body));
});

test("startFromStoryboard: logo end_only asks the outro alone; extra options win", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 9 }), 202)]);
  await client.longvideo.startFromStoryboard(storyboard(), {
    product_image_url: "https://cdn/p.jpg",
    brand_logo_url: "https://cdn/logo.png",
    brand_logo_mode: "end_only",
    captions: true,
    customPrompt: "override"
  });
  const body = jsonBody(fetch.calls.at(-1));
  assert.deepEqual(body.montage, {
    kind: "outro",
    language_code: "it",
    logo_url: "https://cdn/logo.png",
    logo_mode: "end_only"
  });
  assert.equal(body.captions, true);
  assert.equal(body.custom_prompt, "override");
  assert.ok(!("voiceover_cast" in body) && !("tts_voice_id" in body));
  assert.equal(body.ratio, "16:9");
  assert.equal(body.resolution, "1080p");
});

test("startFromStoryboard: a montage object keeps its explicit fields", async () => {
  const { client, fetch } = jwtClient([makeResponse(ok({ job_id: 9 }), 202)]);
  await client.longvideo.startFromStoryboard(storyboard(), {
    product_image_url: "https://cdn/p.jpg",
    language_code: "en",
    montage: { brief: "Only this", logo_mode: "off" }
  });
  assert.deepEqual(jsonBody(fetch.calls.at(-1)).montage, { brief: "Only this", logo_mode: "off", language_code: "en" });
});

test("startFromStoryboard rejects view 'avatar', missing voices and empty storyboards", async () => {
  const { client, fetch } = jwtClient();
  await assert.rejects(
    () => client.longvideo.startFromStoryboard(storyboard(), { avatar_id: 3, avatar_view_type: "avatar" }),
    ValidationError
  );
  await assert.rejects(
    () => client.longvideo.startFromStoryboard(storyboard(), { voice_id: { subject_1: "v" } }),
    (err) => err instanceof ValidationError && err.message.includes("voice_over")
  );
  await assert.rejects(() => client.longvideo.startFromStoryboard({ segments: [] }), ValidationError);
  await assert.rejects(
    () => client.longvideo.startFromStoryboard(storyboard(), { brand_logo_mode: "corner" }),
    ValidationError
  );
  assert.equal(fetch.calls.length, 0);
});

test("version is 0.4.0", () => {
  assert.equal(VERSION, "0.4.0");
  assert.equal(require("../package.json").version, "0.4.0");
});

test("storyboard calls upload a local product_image_url given in the payload", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hs-node-sh-"));
  const local = path.join(dir, "p.jpg");
  await fs.writeFile(local, "jpg");
  const { client, fetch } = jwtClient([
    makeResponse({ public_url: "https://cdn/up.jpg" }),
    makeResponse({ suggestions: [{ title: "T", brief: "B" }] })
  ]);
  const out = await client.storyboard.briefSuggestions(null, null, { product_image_url: local, subject_image_url: "https://cdn/s.jpg" });
  assert.deepEqual(out, [{ title: "T", brief: "B" }]);
  assert.ok(fetch.calls[0].url.endsWith("/upload/image"));
  assert.deepEqual(jsonBody(fetch.calls[1]), { product_image_url: "https://cdn/up.jpg", subject_image_url: "https://cdn/s.jpg" });
});
