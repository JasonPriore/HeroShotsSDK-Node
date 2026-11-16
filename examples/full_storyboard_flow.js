"use strict";

// End-to-end StudioHero flow, mirroring the web app, via the HeroShots SDK.
//
// Reproduces: login -> upload -> balance -> brief suggestions (+ recommended) ->
// concepts (+ recommended) -> storyboard -> reference frames -> voices -> long
// video with voice and auto-edit -> download. Every generation step is BILLABLE.
//
// Run:
//   HEROSHOTS_EMAIL=dev@partner.com HEROSHOTS_PASSWORD=... \
//   node examples/full_storyboard_flow.js product.jpg model.jpg

const { Client } = require("heroshots");

async function main(productPath, modelPath) {
  // Base URL defaults to https://app.heroshots.ai.
  const client = await Client.fromLogin(process.env.HEROSHOTS_EMAIL, process.env.HEROSHOTS_PASSWORD);
  console.log("logged in as", (await client.me()).email);

  // 1. Upload references (local files -> hosted URLs).
  const productUrl = (await client.uploads.image(productPath, "products")).public_url;
  const subjectUrl = (await client.uploads.image(modelPath, "subjects")).public_url;

  // 2. (Optional) check the balance before spending credits.
  const balance = await client.balance();
  console.log("balance:", { hs_credits: balance.hs_credits, wallet_balance: balance.wallet_balance });

  // Fields the portal sends with every storyboard call.
  const durationSeconds = 30;
  const common = {
    product_image_url: productUrl,
    subject_image_url: subjectUrl,
    duration_seconds: durationSeconds,
    ratio: "9:16",
    resolution: "1080p",
    language_code: "it",
    video_type: "ugc",
    ugc_style: "top_creator",
    look_mode: "current",
    storyboard_reference_frames_required: true
  };

  // 3. Brief suggestions -> the recommended one.
  const briefs = await client.storyboard.briefSuggestions(null, null, common);
  let index = 0;
  if (briefs.length > 1) {
    index = (await client.storyboard.recommend("brief", briefs, null, null, common)).recommended_index;
  }
  const brief = briefs[index].brief;
  console.log("brief:", brief);

  // 4. Concept candidates -> the recommended one.
  const concepts = await client.storyboard.candidates(brief, durationSeconds, null, null, common);
  index = 0;
  if (concepts.length > 1) {
    index = (await client.storyboard.recommend("concept", concepts, null, null, {
      ...common,
      custom_prompt: brief,
      chosen_brief: brief
    })).recommended_index;
  }
  const selected = concepts[index];
  console.log("concept:", selected.title);

  // 5. Full storyboard (async, frames deferred).
  const job = await client.storyboard.generate(brief, durationSeconds, selected, null, null, common);
  let storyboard = (await client.storyboard.wait(job.job_id)).storyboard;
  console.log("storyboard ready:", (storyboard.segments || []).length, "segments");

  // 6. Reference frames (async, progressive) -> merged into the storyboard.
  if (storyboard.reference_frames_deferred) {
    const fjob = await client.storyboard.frames(storyboard, null, null, common);
    const frames = await client.storyboard.wait(fjob.job_id, {
      timeout: 900,
      onProgress: (d) => console.log("  frames ready:", Object.keys(d.frames_partial || {}).length)
    });
    storyboard = client.storyboard.merge(storyboard, frames);
  }

  // 7. One voice per speaking role.
  const voices = (await client.audio.voices()).voices || [];
  const roles = client.storyboard.voiceRoles(storyboard);
  const voiceIds = voices.length
    ? Object.fromEntries(roles.map((role) => [role.key, voices[0].voice_id]))
    : null;
  console.log("roles:", roles.map((r) => [r.key, r.text.slice(0, 40)]));

  // 8. Long video, exactly like the portal's render, with the auto-edit.
  const vjob = await client.longvideo.startFromStoryboard(storyboard, {
    product_image_url: productUrl,
    subject_image_url: subjectUrl,
    voice_id: voiceIds,
    language_code: "it",
    montage: await client.longvideo.montageAvailable(),
    brief,
    ratio: "9:16",
    resolution: "1080p"
  });
  const final = await client.longvideo.render(vjob.job_id); // clips -> export -> auto-edit
  const url = final.captioned_final_video_url || final.final_video_url;
  console.log("FINAL VIDEO:", url);

  // 9. Download (absolute URLs are accepted).
  console.log("saved to", await client.download(url, "out/spot.mp4"));
}

if (process.argv.length !== 4) {
  console.error("usage: node full_storyboard_flow.js <product.jpg> <model.jpg>");
  process.exitCode = 2;
} else {
  main(process.argv[2], process.argv[3]).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
