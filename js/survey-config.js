/* ============================================================================
   PCL FORM DEFINITION — declarative, easy to edit, no build step needed.
   This is a plain SurveyJS survey JSON. Add/remove/reorder questions here.
   Docs: https://surveyjs.io/survey-javascript-library/documentation
   ========================================================================== */

(function () {
  var MAX_BYTES = (window.PCL_CONFIG.maxFileMB || 5) * 1024 * 1024;
  var TYPES = window.PCL_CONFIG.fileTypes;

  window.PCL_FORM = {
    title: "Weekly Submission",
    description:
      "One form per contestant, per week. Fields marked * are required. " +
      "Attach files up to " + window.PCL_CONFIG.maxFileMB + " MB each.",

    showProgressBar: "off",
    focusFirstQuestionAutomatic: false,

    // Screen shown after a successful submit
    completedHtml:
      "<h3 style='margin:0 0 8px'>Submission received</h3>" +
      "<p style='margin:0'>Your entry is in. See you at the next weekly challenge.</p>",

    elements: [
      /* ---------------------------------------------------------------
         Q1 — Instagram Reel Submission (from scratchpad.txt)
         Three inputs grouped as ONE question card via a panel:
           Input 1: Reel URL link        (validated URL)
           Input 2: Analytics screenshot (file upload, size-capped)
           Input 3: Free text            (prompt to be specified later)
      ---------------------------------------------------------------- */
      {
        type: "panel",
        name: "q1_reel",
        title: "Q1. Instagram Reel Submission",
        description: "One reel entry = link + analytics screenshot + notes.",
        elements: [
          {
            type: "text",
            name: "reelUrl",
            title: "Input 1 — Reel URL link",
            description: "Full public link to the reel.",
            inputType: "url",
            placeholder: "https://www.instagram.com/reel/…",
            isRequired: true,
            validators: [{ type: "urlvalidator" }]
          },
          {
            type: "file",
            name: "analyticsScreenshot",
            title: "Input 2 — Image / screenshot upload of reel analytics",
            description:
              "PNG, JPG or WebP. Max " + window.PCL_CONFIG.maxFileMB + " MB. " +
              "Larger files are rejected before upload starts.",
            isRequired: true,
            acceptedTypes: TYPES,
            maxSize: MAX_BYTES,
            allowMultiple: false,
            storeDataAsText: true,
            showPreview: true
          },
          {
            type: "comment",
            name: "reelNotes",
            title: "Input 3 — Notes",
            description: "Placeholder — the exact prompt will be specified later.",
            rows: 3,
            placeholder: "Type here… (specification coming soon)"
          }
        ]
      },

      /* ---------------------------------------------------------------
         Q2 — File Formats (placeholder title from scratchpad)
         Demonstrates DUAL input fields under a single question
         (SurveyJS `multipletext` question type).
      ---------------------------------------------------------------- */
      {
        type: "multipletext",
        name: "q2_fileFormats",
        title: "Q2. File Formats",
        description:
          "Placeholder question — two inputs under one question. Rename the " +
          "labels in js/survey-config.js when you finalise the spec.",
        items: [
          {
            name: "formatPrimary",
            title: "Primary format",
            placeholder: "e.g. MP4"
          },
          {
            name: "formatSecondary",
            title: "Secondary format",
            placeholder: "e.g. MOV"
          }
        ]
      },

      /* ---------------------------------------------------------------
         Q3 — Something (pure placeholder from scratchpad)
      ---------------------------------------------------------------- */
      {
        type: "text",
        name: "q3_something",
        title: "Q3. Something",
        description: "Placeholder — free text. Spec to be defined later.",
        placeholder: "To be specified later"
      },

      /* ---------------------------------------------------------------
         Q4 — Weekly Challenge: Link (from scratchpad)
      ---------------------------------------------------------------- */
      {
        type: "text",
        name: "q4_weeklyChallengeLink",
        title: "Q4. Weekly Challenge — Link",
        description: "Link to your weekly challenge submission.",
        inputType: "url",
        placeholder: "https://…",
        isRequired: true,
        validators: [{ type: "urlvalidator" }]
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
