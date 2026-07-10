"use strict";

const { Client } = require("heroshots");

async function main() {
  const client = await Client.fromLogin(
    process.env.HEROSHOTS_EMAIL,
    process.env.HEROSHOTS_PASSWORD
  );

  const product = await client.uploads.image("product.jpg", "products");
  const subject = await client.uploads.image("model.jpg", "subjects");

  const balance = await client.balance();
  console.log("balance:", {
    hs_credits: balance.hs_credits,
    wallet_balance: balance.wallet_balance
  });

  const durationSeconds = 30;
  const briefs = await client.storyboard.briefSuggestions(product.public_url, subject.public_url, {
    duration_seconds: durationSeconds,
    language_code: "it"
  });

  const candidates = await client.storyboard.candidates(
    briefs[0],
    durationSeconds,
    product.public_url,
    subject.public_url,
    { ratio: "16:9", language_code: "it" }
  );

  const job = await client.storyboard.generate(
    briefs[0],
    durationSeconds,
    candidates[0],
    product.public_url,
    subject.public_url
  );
  const storyboard = await client.storyboard.wait(job.job_id);

  const videoJob = await client.longvideo.start(product.public_url, {
    storyboard: storyboard.storyboard
  });
  const final = await client.longvideo.wait(videoJob.job_id);
  console.log(final.final_video_url);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
