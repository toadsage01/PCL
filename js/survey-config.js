/* ============================================================================
   PCL FORM DEFINITION — Season 2 · bulk view reporting
   ----------------------------------------------------------------------------
   The league counts VIEWS on everything a candidate posts, so one
   submission carries MANY posts:

     1  Player Details ....... full name + reporting manager
     2  Post Links ........... paste every post URL — separated by spaces,
                               commas, semicolons or new lines
     3  Post Details ......... one auto-created row per link:
                               link · format · content type ·
                               views/impressions · screenshot
     4  Weekly Challenge ..... optional week + link + notes

   Rows in "Post Details" are system-managed: js/app.js parses the link
   box and syncs the panel count. Praper/PAVE vs Personal tagging per post
   feeds the 50:50 content-ratio tracking in the ledger.
   ========================================================================== */

(function () {
  var MAX_BYTES = (window.PCL_CONFIG.maxFileMB || 5) * 1024 * 1024;
  var TYPES = window.PCL_CONFIG.fileTypes;

  var FORMATS = [
    { value: "ig_reel",   text: "Instagram Reel" },
    { value: "ig_post",   text: "Instagram Post / Carousel" },
    { value: "yt_shorts", text: "YouTube Shorts" },
    { value: "yt_long",   text: "YouTube Long-Form" },
    { value: "li_post",   text: "LinkedIn Post" }
  ];

  window.PCL_FORM = {
    title: "Weekly Submission",
    description:
      "Paste all your post links — a screenshot goes with each. " +
      "Fields marked <span class='pcl-req-star'>*</span> are required.",

    showProgressBar: "off",
    focusFirstQuestionAutomatic: false,

    completedHtml:
      "<div class='pcl-done'>" +
      "<div class='pcl-done-stars' aria-hidden='true'>\u2605\u2605\u2605</div>" +
      "<h3>LEVEL CLEARED!</h3>" +
      "<p class='pcl-done-sub'>Entry Logged &middot; Points Queued</p>" +
      "<div class='pcl-done-xp'>+100 XP</div>" +
      "<p class='pcl-done-note'>All posts logged. See you next week.</p></div>",

    elements: [
      /* ---- 1 · Player Details ------------------------------------ */
      {
        type: "panel",
        name: "q1_player",
        title: "1. Player Details",
        elements: [
          {
            type: "text",
            name: "fullName",
            title: "Full name",
            placeholder: "e.g. Priya",
            isRequired: true
          },
          {
            type: "text",
            name: "reportingManager",
            title: "Reporting manager",
            placeholder: "e.g. Rahul",
            isRequired: true,
            startWithNewLine: false
          }
        ]
      },

      /* ---- 2 · Post Links (bulk paste) ---------------------------- */
      {
        type: "comment",
        name: "postUrls",
        title: "2. Post Links",
        description: "Separate links with spaces, commas or new lines.",
        placeholder:
          "https://www.instagram.com/reel/ABC123/\n" +
          "https://www.youtube.com/shorts/XYZ789\n" +
          "https://www.linkedin.com/posts/… , https://…",
        rows: 4,
        isRequired: true
      },

      /* ---- 3 · Post Details (one row per link, system-managed) ---- */
      {
        type: "paneldynamic",
        name: "postDetails",
        title: "3. Post Details",
        description: "One entry per post.",
        panelCount: 0,
        isRequired: true,
        panelNameTemplate: "Post {panelIndex}",
        allowAddPanel: false,
        allowRemovePanel: false,
        panelRemoveButtonVisible: false,
        panelPrevNextButtonVisible: false,
        templateElements: [
          {
            type: "text",
            name: "link",
            title: "Link",
            readOnly: true
          },
          {
            type: "dropdown",
            name: "format",
            title: "Format",
            placeholder: "Format…",
            choices: FORMATS.slice(),
            isRequired: true
          },
          {
            type: "dropdown",
            name: "contentType",
            title: "Content",
            placeholder: "Type…",
            choices: [
              { value: "praper",   text: "Praper / PAVE" },
              { value: "personal", text: "Personal" }
            ],
            isRequired: true
          },
          {
            type: "text",
            name: "viewsImpressions",
            title: "Views / Impressions",
            inputType: "number",
            min: 0,
            placeholder: "e.g. 12500",
            isRequired: true
          },
          {
            type: "file",
            name: "analyticsScreenshot",
            title: "Screenshot",
            description: "Platform analytics of this post.",
            acceptedTypes: TYPES,
            maxSize: MAX_BYTES,
            allowMultiple: false,
            storeDataAsText: true,
            showPreview: true,
            isRequired: true
          }
        ]
      },

      /* ---- 4 · Weekly Challenge (optional) ------------------------- */
      {
        type: "panel",
        name: "q4_weeklyChallenge",
        title: "4. Weekly Challenge",
        description: "Optional.",
        elements: [
          {
            type: "dropdown",
            name: "challengeWeek",
            title: "Week",
            placeholder: "Not entering…",
            choices: [
              { value: "", text: "Not entering" },
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
            title: "Challenge link",
            inputType: "url",
            placeholder: "https://…",
            visibleIf: "{challengeWeek} notempty",
            validators: [{ type: "urlvalidator" }]
          },
          {
            type: "comment",
            name: "additionalNotes",
            title: "Notes",
            rows: 2,
            placeholder: "Optional…",
            visibleIf: "{challengeWeek} notempty"
          }
        ]
      }
    ]
  };
})();
