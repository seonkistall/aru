# scripts — short-form auto-distribution (③)

The viral engine is short-form. Auto-POSTING difficulty differs sharply by platform:

| Platform | Auto-post | Reality |
|---|---|---|
| **YouTube Shorts** | ✅ feasible now | Data API upload via OAuth. Quota ~6 uploads/day default. **Start here.** |
| **TikTok** | ⚠ gated | Content Posting API needs app review; unaudited apps post to draft only; multi-account auto-post risks ban. Post manually until approved. |
| **Instagram Reels** | ⚠ gated | Needs Business/Creator account + Facebook app review; personal accounts unsupported. |

**And before any of this:** the share asset is a PNG (`/studio` card / `/scan` result).
Shorts need a vertical ≤60s **mp4**. Convert first (e.g. ffmpeg: loop the PNG with a
subtle zoom + the headline). That mp4 is the input to the uploader.

## YouTube setup
1. Google Cloud Console → new project → enable **YouTube Data API v3**.
2. OAuth consent screen + OAuth client (Desktop). Get client id/secret.
3. One-time: get a **refresh token** (OAuth playground or a small auth script) with
   scope `https://www.googleapis.com/auth/youtube.upload`.
4. Put `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN` in `.env.local`.
5. `npm i googleapis`
6. `node scripts/youtube-upload.mjs path/to/short.mp4 "내 피부 무드 #결"`

Uploads as **private** — review, then publish. Only automate posting AFTER manual
shorts prove they go viral (don't perfectly automate distribution of content that
doesn't resonate).
