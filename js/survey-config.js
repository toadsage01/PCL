/* ============================================================================
   PCL FORM DEFINITION — Season 2, built from the official Rulebook PDF.
   ----------------------------------------------------------------------------
   Structure (matches the league's flow — every submission is ONE post):
     Q1  Player Registration ..... full name + reporting manager (side by side)
     Q2  Format & Multiplier ..... the 5 rulebook formats; only 3 platforms
                                   (Instagram / YouTube / LinkedIn) exist here,
                                   so only valid platforms can be picked
     Q3  Post URL ................ validated AGAINST the chosen format
     Q4  Views / Impressions ..... self-reported, cross-verified via screenshot
     Q5  Analytics Screenshot .... proof + OCR cross-check (Drive-stored)
     Q6  Weekly Challenge ........ optional: week, URL, notes for the judges

   Rulebook facts baked into the copy:
     • Multipliers: YT long 2x · YT shorts 1.25x · IG reels 1.25x ·
       IG posts/carousels 1x · LinkedIn 1x  (points = count × multiplier)
     • One Post, One Platform: identical content on 2 platforms → only the
       higher count counts — so a post is submitted once, per platform.
     • No paid promotions/boosting — organic reach only.
     • Analytics tracked Mon–Sat; due by 11:00 AM the following Monday.
   Re-submitting the SAME post URL logs an UPDATE snapshot (never duplicate
   views) — that's handled server-side by Media ID (see gas/Code.gs).
   ========================================================================== */

(function () {
  var MAX_BYTES = (window.PCL_CONFIG.maxFileMB || 5) * 1024 * 1024;
  var TYPES = window.PCL_CONFIG.fileTypes;

  window.PCL_FORM = {
    title: "Weekly Submission",
    description:
      "One post per entry — submit again for more posts or fresh counts " +
      "(same post = update, never double views). Fields marked " +
      "<span class='pcl-req-star'>*</span> are required. Analytics due " +
      "Monday 11:00 AM. Boosted posts don't count.",

    // NOTE: single-page form — a progress widget reads as noise (v3 renders a
    // page-button list). Flip to "top" if you split this into multiple pages;
    // the theme already styles .sd-progress as a glowing segmented XP bar.
    showProgressBar: "off",
    focusFirstQuestionAutomatic: false,

    // Screen shown after a successful submit — pixel arcade style
    completedHtml:
      "<div class='pcl-done'>" +
      "<div class='pcl-done-stars' aria-hidden='true'>\u2605\u2605\u2605</div>" +
      "<h3>LEVEL CLEARED!</h3>" +
      "<p class='pcl-done-sub'>Entry Logged &middot; Points Queued</p>" +
      "<div class='pcl-done-xp'>+100 XP</div>" +
      "<p class='pcl-done-note'>Your entry is in — the league sees it " +
      "instantly. Screenshot cross-checks next. See you at the next " +
      "weekly challenge.</p></div>",

    elements: [
      /* ---------------------------------------------------------------
         Q1 — Player Registration (rulebook §8: roster for tracking)
         "Parallely": full name + reporting manager share one row.
      ---------------------------------------------------------------- */
      {
        type: "panel",
        name: "q1_player",
        title: "Q1. Player Registration",
        description:
          "Every submission carries your tag — it keeps the leaderboard " +
          "row and your manager's line-up straight.",
        elements: [
          {
            type: "multipletext",
            name: "player",
            items: [
              {
                name: "fullName",
                title: "Full name",
                placeholder: "e.g. Jatin Gulati",
                isRequired: true
              },
              {
                name: "reportingManager",
                title: "Reporting manager",
                placeholder: "e.g. Ashutosh",
                isRequired: true
              }
            ]
          }
        ]
      },

      /* ---------------------------------------------------------------
         Q2 — Format & Multiplier (rulebook §3 platform table)
         The only five eligible formats across the only three platforms.
      ---------------------------------------------------------------- */
      {
        type: "dropdown",
        name: "platformFormat",
        title: "Q2. Format & Multiplier",
        description:
          "Only Instagram, YouTube and LinkedIn are eligible. Leaderboard " +
          "points = views/impressions × your format's multiplier.",
        isRequired: true,
        placeholder: "Pick the format you're submitting…",
        choices: [
          { value: "ig_reel",   text: "Instagram Reel — views × 1.25" },
          { value: "ig_post",   text: "Instagram Post / Carousel — impressions × 1" },
          { value: "yt_shorts", text: "YouTube Shorts — views × 1.25" },
          { value: "yt_long",   text: "YouTube Long-Form — views × 2" },
          { value: "li_post",   text: "LinkedIn Post — impressions × 1" }
        ]
      },

      /* ---------------------------------------------------------------
         Q3 — Post URL. Validated against Q2's format at runtime
         (see js/app.js → PCL_URL_RULES + onValidateQuestion).
      ---------------------------------------------------------------- */
      {
        type: "text",
        name: "postUrl",
        title: "Q3. Post URL",
        description:
          "Public link only — private or deleted posts can't be verified " +
          "and lose their points. Same content on two platforms? Submit " +
          "only the stronger one (One Post, One Platform rule).",
        inputType: "url",
        placeholder: "https://…",
        isRequired: true,
        validators: [{ type: "urlvalidator" }]
      },

      /* ---------------------------------------------------------------
         Q4 — Views / Impressions count (self-reported, verified later)
      ---------------------------------------------------------------- */
      {
        type: "text",
        name: "viewsImpressions",
        title: "Q4. Views / Impressions Count",
        description:
          "The exact number on the post's own analytics screen — no " +
          "rounding, no estimates. This is cross-checked against your " +
          "screenshot before points lock in.",
        inputType: "number",
        min: 0,
        placeholder: "e.g. 12500",
        isRequired: true
      },

      /* ---------------------------------------------------------------
         Q5 — Analytics screenshot (proof + OCR cross-check).
         Stored in Praper's Google Drive; size capped at the same limit
         the backend enforces (Google Apps Script / Drive pipeline).
      ---------------------------------------------------------------- */
      {
        type: "file",
        name: "analyticsScreenshot",
        title: "Q5. Analytics Screenshot",
        description:
          "Screenshot the post's insights — count clearly visible, post " +
          "date in frame when possible. PNG, JPG or WebP, up to " +
          window.PCL_CONFIG.maxFileMB + " MB (the Drive pipeline's cap). " +
          "Saved to Praper's Google Drive for the OCR cross-check.",
        isRequired: true,
        acceptedTypes: TYPES,
        maxSize: MAX_BYTES,
        allowMultiple: false,
        storeDataAsText: true,
        showPreview: true
      },

      /* ---------------------------------------------------------------
         Q6 — Weekly Challenge (rulebook §4, optional per entry)
      ---------------------------------------------------------------- */
      {
        type: "panel",
        name: "q6_weeklyChallenge",
        title: "Q6. Weekly Challenge Entry",
        description:
          "Optional — only if this post is your shot at this week's " +
          "challenge. Weekly analytics run Monday–Saturday; submit by " +
          "11:00 AM Monday for the week to count.",
        elements: [
          {
            type: "dropdown",
            name: "challengeWeek",
            title: "Which week's challenge?",
            placeholder: "Not entering this week…",
            choices: [
              { value: "", text: "Not entering this week" },
              { value: "Week 1 — Best Original Content", text: "Week 1 · Best Original Content" },
              { value: "Week 2 — Best Storytelling Debut", text: "Week 2 · Best Storytelling Debut" },
              { value: "Week 3 — A Day in My Life", text: "Week 3 · A Day in My Life" },
              { value: "Week 4 — Best Collaboration", text: "Week 4 · Best Collaboration" },
              { value: "Week 5 — Behind the Scenes at Praper", text: "Week 5 · Behind the Scenes at Praper" },
              { value: "Week 6 — Most Improved Creator", text: "Week 6 · Most Improved Creator" },
              { value: "Week 7 — Consistency Reward", text: "Week 7 · Consistency Reward" },
              { value: "Week 8 — The One-Take Challenge", text: "Week 8 · The One-Take Challenge" },
              { value: "Week 9 — The Trend Takeover", text: "Week 9 · The Trend Takeover" },
              { value: "Week 10 — The Comment Magnet", text: "Week 10 · The Comment Magnet — Final Showdown" }
            ]
          },
          {
            type: "text",
            name: "challengeUrl",
            title: "Challenge post URL",
            description: "Skip if it's the same post you entered in Q3.",
            inputType: "url",
            placeholder: "https://…",
            visibleIf: "{challengeWeek} notempty",
            validators: [{ type: "urlvalidator" }]
          },
          {
            type: "comment",
            name: "additionalNotes",
            title: "Anything the judges should know?",
            description:
              "Collab partners (Week 4), one continuous take (Week 8), " +
              "trial-reel history, trend used — anything worth a note.",
            rows: 3,
            placeholder: "Optional…",
            visibleIf: "{challengeWeek} notempty"
          }
        ]
      }
    ]

    /* ===============================================================
       CUSTOMIZABILITY CHEAT-SHEET — paste any of these into `elements`
       (all free / MIT core):

       Dropdown:      { type:"dropdown", name:"n", title:"t",
                        choices:["A","B","C"] }
       Single choice: { type:"radiogroup", name:"n", title:"t",
                        choices:["Yes","No"] }
       Multi-select:  { type:"checkbox", name:"n", title:"t",
                        choices:["Reel","Story","Post"] }
       Rating:        { type:"rating", name:"n", title:"t",
                        rateMax: 10 }
       Date:          { type:"text", name:"n", title:"t",
                        inputType:"date" }
       Number:        { type:"text", name:"n", title:"t",
                        inputType:"number", min:0, max:100 }
       Repeatable group (rows of URL+file pairs):
                      { type:"paneldynamic", name:"n", title:"t",
                        panelCount:1, templateElements:[ …same as Q1 panel… ] }
    ================================================================ */
  };
})();
