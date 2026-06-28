#!/usr/bin/env node
/**
 * ③ YouTube Shorts auto-upload (the FEASIBLE first automation — see ml/README moat note).
 *
 * Honest status: this is a runnable scaffold. It needs (a) Google OAuth creds
 * (YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN in .env.local), (b) `npm i googleapis`,
 * and (c) a VIDEO file (Shorts are video; the share CARD is a PNG — turn it into a
 * <=60s vertical mp4 first, e.g. ffmpeg loop). TikTok/Instagram auto-post are
 * approval-gated + ban-risky for multi-account, so YouTube goes first.
 *
 * Usage:  node scripts/youtube-upload.mjs path/to/short.mp4 "내 피부 무드 체크"
 */
import { existsSync, createReadStream } from "node:fs";

const [, , videoPath, title = "내 피부 무드 #결 #스킨케어"] = process.argv;

if (!videoPath || !existsSync(videoPath)) {
  console.error("usage: node scripts/youtube-upload.mjs <video.mp4> [title]");
  console.error("(Shorts need a vertical <=60s mp4. Convert the share card PNG first.)");
  process.exit(1);
}

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
  console.error("Missing YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN. See scripts/README.md.");
  process.exit(1);
}

let google;
try {
  ({ google } = await import("googleapis"));
} catch {
  console.error("Run `npm i googleapis` first.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET);
oauth2.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
const youtube = google.youtube({ version: "v3", auth: oauth2 });

const res = await youtube.videos.insert({
  part: ["snippet", "status"],
  requestBody: {
    snippet: { title, description: `${title}\n\n결 · 30초면 내 피부 결을 안다`, tags: ["결", "스킨케어", "Shorts"] },
    status: { privacyStatus: "private" }, // start private; flip to public when ready
  },
  media: { body: createReadStream(videoPath) },
});

console.log("uploaded:", res.data.id, "(private — review then publish)");
