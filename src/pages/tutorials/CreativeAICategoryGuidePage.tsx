// src/pages/tutorials/CreativeAICategoryGuidePage.tsx
//
// One Guide per Creative AI tool: AI Image Creation, AI Voice Creation,
// AI Video Creation, Video Studio, and Document Studio. Built as a dynamic
// route (like AILearningCategoryGuidePage.tsx and its siblings) rather than
// five single-purpose files, since three of these five tools are
// structurally identical clones of each other, and a fourth (Document
// Studio) reuses Video Studio's "editor" template exactly.
//
// Two different kinds of tool live in this one config, and the step
// sequence branches on which:
//
// — 'generator' (Image, Voice, Video): a prompt/script box, an inline
//   "Improve my English" + critique tool, a step-by-step coach, and a
//   Generate button. No on-page "Use Claude" button exists anywhere — "Use
//   Claude" is only the Sidebar/Navbar's own label for the `/playground`
//   nav link. What actually bridges a build page to Claude is the "swivel"
//   mechanic already established in VibeCodingGuidePage.tsx and
//   SupabaseDatabaseGuidePage.tsx: copy a prompt to the clipboard, open
//   `/playground` in a new tab, paste it in yourself.
//
//   Confirmed real differences between the three generators, each handled
//   explicitly rather than assumed identical:
//     - Image & Voice: critique is advisory only, never blocks Generate.
//     - Video: critique is a hard gate — Generate stays disabled below a
//       6/10 score (PROMPT_SCORE_THRESHOLD in VideoGenerationPage.tsx).
//     - Video's critique button is "📊 Evaluate Prompt" — NOT "Critique my
//       Prompt" (that label exists in the page's own code but is dead,
//       never actually rendered — confirmed by reading the JSX directly).
//     - Video supports optional Start/End image anchoring: images can come
//       from a real in-app picker (your last 12 AI Image Creation outputs,
//       one click sets it as a frame) or from uploading any image file
//       from outside the platform — made in Gemini, a photo, anything.
//     - Image & Voice are region-gated (Africa + North America only);
//       Video is not.
//
//   Each generator's case-study weak/strong pair is the platform's own real
//   example from its certification page's "what makes a great X" guidance
//   (AIImageCertificationPage.tsx, AIVoiceCertificationPage.tsx,
//   AIVideoProductionCertificationPage.tsx) — not invented.
//
// — 'editor' (Video Studio): a timeline editor, not a generator — no
//   prompt, no critique, no AI tooling of any kind (confirmed by grep: zero
//   references to chatText, critique, or scoring in VideoStudioPage.tsx).
//   Explicitly does NOT get a swivel-to-Claude step; the skill here is
//   assembly and pacing, not prompt-writing. It combines video clips (your
//   own saved AI Video Creation outputs, or uploaded from outside),
//   recorded voice narration, background music/audio (upload, or reuse a
//   saved AI Voice Creation clip), and text overlays — but does NOT support
//   standalone images as timeline items (its upload input is hard-coded to
//   accept="video/*", confirmed directly; no image-handling code exists
//   anywhere in the file). The honest workaround, stated plainly in the
//   Guide: turn a still image into a short clip on AI Video Creation first
//   (a Text + Start Image generation), then bring that video in here.
//   Export is browser-based (WebCodecs VideoEncoder + a hand-built WebM
//   muxer, not ffmpeg.wasm despite stale comments in the file), needs
//   Chrome 94+, and — based on static reading of the export code, since the
//   audio destination stream is never referenced by the muxer — background
//   music and recorded voiceover likely do not survive the exported file
//   even though they play correctly during in-app preview. The page's own
//   UI text already hedges on this ("open in Firefox or VLC if Chrome
//   doesn't play the file"), so the Guide states it as a real caveat to
//   plan around, not a hidden gotcha.
//
//   Document Studio is also 'editor' kind — confirmed zero AI anywhere in
//   DocumentStudioPage.tsx (no chatText/chatJSON/critique/region-gating at
//   all). It's an InDesign-style page layout tool (1/2/3-column frames,
//   rich text, images, real Amazon KDP book trim sizes, PDF export, live
//   multi-user collaboration) — genuinely different content from Video
//   Studio, but the same "no swivel, teach assembly not prompting" shape.
//
// Progress: localStorage first, mirrored to `tutorial_progress` when signed
// in — same as every other Guide. Track id is per-tool
// (`creative-ai-guide-<categoryId>`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, Lock, ChevronDown, ChevronRight, Link2, Loader2, ExternalLink,
  Image as ImageIcon, Mic, Video as VideoIcon, Clapperboard, FileText, RotateCw, Copy, CheckCheck,
} from 'lucide-react';

/* ────────────────────────────── types ────────────────────────────── */

type StepKind = 'read' | 'do' | 'swivel' | 'gate';
type ToolKind = 'generator' | 'editor';

interface Gate {
  label: string;
  placeholder: string;
  validate: (value: string) => string | null;
}

interface CriterionDef {
  name: string;
  detail: string;
}

interface Attempt {
  label: string;
  answer: string;
  critique: string;
  whyBetter?: string;
}

interface CaseStudy {
  scenario: string;
  attempts: Attempt[];
}

interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string[];
  aside?: string;
  criteriaList?: CriterionDef[];
  caseStudy?: CaseStudy;
  prompt?: string;
  promptNote?: string;
  doLabel?: string;
  doHref?: string;
  gate?: Gate;
}

interface CategoryGuideContent {
  id: string;
  title: string;
  hook: string;
  guideBlurb: string;
  completionBlurb: string;
  Icon: React.ComponentType<{ className?: string }>;
  pageHref: string;
  kind: ToolKind;

  // generator-only
  criteria?: CriterionDef[];
  caseStudy?: CaseStudy;
  swivelPrompt?: string;
  critiqueButtonLabel?: string;
  stepByStepButtonLabel?: string;
  isGated?: boolean;
  regionGated?: boolean;
  extraNote?: { title: string; body: string[] };

  // editor-only
  assetSources?: string[];
  typicalSession?: string[];
  buildSteps?: { id: string; title: string; body: string[]; doLabel: string }[];
  lengthControl?: string[];
  lengthControlTitle?: string;
  exportCaveat?: string[];
  exportStep?: { title: string; body: string[]; doLabel: string };
  gateBody?: string[];
  gateLabel?: string;
  gatePlaceholder?: string;
}

/* ───────────────────────────── content ───────────────────────────── */

const CATEGORY_GUIDES: Record<string, CategoryGuideContent> = {
  'ai-image-creation': {
    id: 'ai-image-creation',
    title: 'AI Image Creation',
    kind: 'generator',
    hook: 'Turning a text prompt into a real image — and the habit that separates a vague prompt from one that actually gets you what you pictured.',
    guideBlurb: 'A weak prompt becoming a strong one, why each change matters, and how to use the page’s own tools together with Claude — not instead of each other.',
    completionBlurb: 'You’ve seen a weak prompt become a strong one, know the exact dimensions being checked, and practiced using the page’s own tools together with Claude. That workflow works for every image you make here.',
    Icon: ImageIcon,
    pageHref: '/tech-skills/ai-image-creation',
    regionGated: true,
    critiqueButtonLabel: '💡 Critique my Prompt',
    stepByStepButtonLabel: 'Build prompt step-by-step',
    criteria: [
      { name: 'Subject', detail: 'Who or what is actually in the image — specific, not generic.' },
      { name: 'Setting', detail: 'Where this is happening, specific enough that it couldn’t be anywhere.' },
      { name: 'Perspective', detail: 'The camera angle or framing — close-up, low angle, wide shot.' },
      { name: 'Lighting', detail: 'What kind of light, and where it’s coming from — golden hour, harsh midday sun, soft overcast.' },
      { name: 'Colour', detail: 'A dominant colour or palette, named directly.' },
      { name: 'Mood & Style', detail: 'The feeling you want, and a named visual style — photorealistic, watercolor, editorial.' },
    ],
    caseStudy: {
      scenario: 'This is the platform’s own real example of what separates a weak prompt from a strong one — the same pair used on the AI Image Creation certification.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'A woman in a market.',
          critique: 'Prompt critique\nSubject: vague — "a woman" has no distinguishing detail\nSetting: vague — "a market" could be anywhere in the world\nLighting: missing\nColour: missing\nPerspective: missing\nMood & Style: missing\nScore: 2/10\nSuggested improvement: Add who she is, what she’s doing, and where — subject and setting come before anything else.',
        },
        {
          label: 'Second attempt',
          answer: 'A Nigerian market woman selling produce at a colorful outdoor stall during the day.',
          whyBetter: 'Now there’s a specific place (a Nigerian market), an action (selling produce), and a setting detail (colorful outdoor stall, daytime) — instead of a generic scene that could be anywhere in the world.',
          critique: 'Prompt critique\nSubject: improved — "market woman selling produce" — Improve: add age, clothing, or expression for more specificity\nSetting: improved — "Nigerian market...outdoor stall" — Improve: nothing major\nLighting: weak — "during the day" is vague — Improve: name a specific light quality, like golden hour or harsh midday sun\nColour: missing — Improve: name a dominant colour or palette\nPerspective: missing — Improve: add a camera angle or framing\nScore: 5/10\nSuggested improvement: Lighting and camera angle are the two changes that would move this furthest — from "described" to "visualized."',
        },
        {
          label: 'Third attempt',
          answer: 'A Nigerian market woman in her 40s wearing a vibrant yellow ankara dress, photographed from a low angle, surrounded by colourful produce, golden afternoon light streaming through the stalls, shallow depth of field, photorealistic.',
          whyBetter: 'Every dimension the tool checks is covered now: a specific subject (age, clothing), a detailed setting, a real camera angle, real lighting, a named colour, and a named style. This is the difference between describing a scene and directing one.',
          critique: 'Prompt critique\nSubject: strong — "woman in her 40s wearing a vibrant yellow ankara dress"\nSetting: strong — "surrounded by colourful produce"\nLighting: strong — "golden afternoon light streaming through the stalls"\nColour: strong — "vibrant yellow," golden light\nPerspective: strong — "low angle," "shallow depth of field"\nMood & Style: strong — "photorealistic"\nScore: 9/10\nSuggested improvement: Nothing major — this prompt gives the model everything it needs.',
        },
      ],
    },
    swivelPrompt:
      "I'm about to generate an AI image using a text-to-image tool. Here's my current prompt:\n\n[PASTE YOUR PROMPT]\n\nHelp me strengthen it — check whether I've covered subject, setting, camera angle, lighting, colour, and mood, and suggest the one change that would make the biggest difference. Also flag anything that might read as a stereotype or feel inauthentic to the real place or culture I'm depicting.",
  },

  'ai-voice-creation': {
    id: 'ai-voice-creation',
    title: 'AI Voice Creation',
    kind: 'generator',
    hook: 'Turning a written script into real spoken audio — and the difference between a script that reads fine on paper and one that actually sounds natural out loud.',
    guideBlurb: 'A weak script becoming a strong one, why each change matters, and how to use the page’s own tools together with Claude — not instead of each other.',
    completionBlurb: 'You’ve seen a weak script become a strong one, know the exact dimensions being checked, and practiced using the page’s own tools together with Claude. That workflow works for every script you write here.',
    Icon: Mic,
    pageHref: '/tech-skills/ai-voice-creation',
    regionGated: true,
    critiqueButtonLabel: '💡 Critique my Script',
    stepByStepButtonLabel: 'Build script step-by-step',
    criteria: [
      { name: 'Clarity', detail: 'Short, easy-to-follow sentences when heard, not read.' },
      { name: 'Flow', detail: 'Does it sound like natural spoken language, or like a written paragraph read aloud?' },
      { name: 'Grammar', detail: 'Real errors that would trip up a text-to-speech voice.' },
      { name: 'Engagement', detail: 'Is there anything for a listener to hold onto, or does it just recite facts?' },
      { name: 'Pacing', detail: 'Natural pause points — not one long run-on sentence, not choppy fragments.' },
      { name: 'Purpose', detail: 'Does it actually say what it’s trying to say, to a specific listener?' },
    ],
    caseStudy: {
      scenario: 'This is the platform’s own real example of what separates a weak script from a strong one — the same pair used on the AI Voice Creation certification.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'Hello. I like school.',
          critique: 'Script critique\nClarity: weak — two disconnected fragments, no real statement\nFlow: weak — doesn’t sound like natural spoken language\nEngagement: weak — no hook, nothing for a listener to hold onto\nPurpose: missing — unclear what this speech is trying to accomplish\nScore: 2/10\nSuggested improvement: Decide who’s listening and what you want them to feel or do, then open with something that earns their attention.',
        },
        {
          label: 'Second attempt',
          answer: 'Hi everyone, my name is Amara and I go to school here. I want to talk about technology today.',
          whyBetter: 'Now there’s a real speaker introducing themselves and a stated topic, instead of two unconnected sentences — a listener knows who’s talking and roughly what’s coming.',
          critique: 'Script critique\nClarity: improved — clear self-introduction and topic — Improve: name the specific point, not just "technology"\nFlow: improved — reads like a natural spoken opening — Improve: nothing major\nPurpose: weak — "talk about technology" isn’t a purpose — Improve: say what you want the listener to feel or do\nPacing: missing — no sense of where pauses would land\nScore: 5/10\nSuggested improvement: Purpose is the biggest gap — decide what you want the audience to walk away believing or doing, then build toward it.',
        },
        {
          label: 'Third attempt',
          answer: 'Good morning, everyone. My name is Amara, and I am here today to tell you something important. Every girl in our community deserves access to technology. At the Davidson AI Center, that is exactly what we are building — together, one skill at a time.',
          whyBetter: 'Every dimension the critique checks is present now: a warm natural opening, a named audience, a clear purpose (access to technology for girls), and a closing line tied to something concrete. It sounds like a real speech, not a written paragraph read aloud.',
          critique: 'Script critique\nClarity: strong — one clear idea, plainly stated\nFlow: strong — reads naturally aloud, real spoken rhythm\nEngagement: strong — opens with a greeting, closes with a call to unity\nPacing: strong — natural pause points at each sentence\nPurpose: strong — a clear point tied to a real place, the Davidson AI Center\nScore: 9/10\nSuggested improvement: Nothing major.',
        },
      ],
    },
    swivelPrompt:
      "I'm about to turn this script into spoken audio using a text-to-speech tool. Here's my current script:\n\n[PASTE YOUR SCRIPT]\n\nHelp me strengthen it — check whether it has a clear speaker, audience, purpose, and natural pacing, and suggest the one change that would make it sound most natural read aloud. Also flag anything that would sound awkward or unclear heard rather than read.",
    extraNote: {
      title: 'Choosing a voice, emotion, and speed',
      body: [
        'Once your script is ready, you pick from 8 preset voices (4 female, 4 male), one of 6 emotions, and a speed from 0.5× to 2.0× — these shape how the script gets performed, not just what it says. A script written for a calm, slow narrator won’t land the same way at 1.5× speed with an "excited" emotion — if the read sounds off, it’s worth trying a different voice or emotion before rewriting the script itself.',
      ],
    },
  },

  'ai-video-creation': {
    id: 'ai-video-creation',
    title: 'AI Video Creation',
    kind: 'generator',
    hook: 'Turning a prompt into a real 5-second video clip — with an optional image to anchor where it starts, ends, or both.',
    guideBlurb: 'A weak prompt becoming a strong one, the real 6/10 bar you have to clear to generate, and how to anchor a video to real images instead of starting from text alone.',
    completionBlurb: 'You’ve seen a weak prompt become a strong one, know the exact dimensions being checked, know how image anchoring works, and practiced using the page’s own tools together with Claude. That workflow works for every clip you make here.',
    Icon: VideoIcon,
    pageHref: '/tech-skills/ai-video-creation',
    regionGated: false,
    isGated: true,
    critiqueButtonLabel: '📊 Evaluate Prompt',
    stepByStepButtonLabel: 'Build prompt step-by-step',
    criteria: [
      { name: 'Subject', detail: 'Who or what is actually in the shot — specific, not generic.' },
      { name: 'Setting', detail: 'Where this is happening, specific enough that it couldn’t be anywhere.' },
      { name: 'Lighting', detail: 'What kind of light, and where it’s coming from.' },
      { name: 'Camera', detail: 'The shot type or movement — close-up, slow pan, aerial, tracking shot.' },
      { name: 'Mood & Atmosphere', detail: 'The feeling the clip should give off.' },
      { name: 'Movement', detail: 'What’s actually moving in the frame, beyond just the camera.' },
    ],
    extraNote: {
      title: 'Two ways to start: text alone, or an image to anchor it',
      body: [
        'By default you’re describing a scene in words and the model imagines the whole thing. You can also anchor the video to a real image instead: add a Start image and the clip begins exactly there, or add an End image too and the clip transitions from one to the other. There’s also a "Simple Transition" mode that skips prompt-writing entirely — pick a start and end image and the tool builds the transition prompt for you.',
        'Where those images come from is up to you. Click any of your last 12 AI Image Creation outputs right there in the built-in picker — one click sets it as your start or end frame, no downloading or re-uploading needed. Or drag in any other image file from outside the platform — something you made in Gemini, a photo, anything — the tool doesn’t care where it came from as long as it’s a real image file.',
        'Even with an anchoring image set, you still write a prompt — it still needs to describe camera movement, lighting, and mood, the same rubric either way.',
      ],
    },
    caseStudy: {
      scenario: 'This is the platform’s own real example of what separates a weak prompt from a strong one — the same pair used on the AI Video Production certification. This applies whether or not you’re anchoring to a start/end image.',
      attempts: [
        {
          label: 'First attempt',
          answer: 'A girl walking.',
          critique: 'Prompt evaluation\nSubject: vague — "a girl" has no distinguishing detail\nSetting: missing — "walking" doesn’t say where\nLighting: missing\nCamera: missing — no shot type or movement\nMood & Atmosphere: missing\nMovement: vague — "walking" is the only motion cue\nScore: 2/10 — below the 6/10 needed to generate\nSuggested improvement: Add who she is, where this is happening, and how the camera is moving — this prompt can’t generate yet.',
        },
        {
          label: 'Second attempt',
          answer: 'A young girl in a school uniform walking through a busy market.',
          whyBetter: 'Now there’s a subject with a real detail (school uniform) and a setting (a busy market) — but it still won’t clear the bar, since there’s no camera movement, lighting, or mood yet.',
          critique: 'Prompt evaluation\nSubject: improved — "girl in a school uniform" — Improve: add colour or age for more specificity\nSetting: improved — "busy market" — Improve: name a place or time of day\nLighting: missing — Improve: name a light quality\nCamera: missing — Improve: add a shot type, like tracking, aerial, or close-up\nMovement: weak — "walking" only\nScore: 4/10 — still below the 6/10 needed to generate\nSuggested improvement: Camera and lighting are the two changes that would move this over the line fastest.',
        },
        {
          label: 'Third attempt',
          answer: 'A young girl in a blue school uniform walking through a sunlit Nigerian market at golden hour, slow tracking shot, colourful fabric stalls in the background, warm cinematic light, joyful expression.',
          whyBetter: 'Every dimension is now covered, including camera movement ("slow tracking shot") and mood ("joyful expression," "warm cinematic light") — this is what actually clears the 6/10 bar and unlocks Generate.',
          critique: 'Prompt evaluation\nSubject: strong — "young girl in a blue school uniform," "joyful expression"\nSetting: strong — "sunlit Nigerian market," "colourful fabric stalls"\nLighting: strong — "golden hour," "warm cinematic light"\nCamera: strong — "slow tracking shot"\nMood & Atmosphere: strong — "joyful," "warm cinematic light"\nMovement: strong — a tracking shot implies continuous camera motion\nScore: 9/10 — clears the 6/10 bar, ready to generate\nSuggested improvement: Nothing major.',
        },
      ],
    },
    swivelPrompt:
      "I'm about to generate a short AI video clip. Here's my current prompt:\n\n[PASTE YOUR PROMPT]\n\nThis tool won't let me generate until it scores at least 6/10 across subject, setting, lighting, camera movement, and mood — help me get there. Check what's missing and suggest the one change most likely to push the score over that line. If I'm anchoring this to a start or end image, help me think through whether that's actually the right call here, or whether starting from text alone would capture what I'm going for better.",
  },

  'video-studio': {
    id: 'video-studio',
    title: 'Video Studio',
    kind: 'editor',
    hook: 'Not a generator — a timeline editor for assembling video clips, voice, music, and text into one finished piece.',
    guideBlurb: 'What you can actually bring in and from where, a typical assembly session, how to control the length of everything on the timeline, and what to know before you export.',
    completionBlurb: 'You know what Video Studio actually is, where each type of asset comes from, how to control pacing on the timeline, and what to expect — and watch for — when you export.',
    Icon: Clapperboard,
    pageHref: '/tech-skills/ai-video-studio',
    assetSources: [
      'Video clips — your own saved AI Video Creation outputs, or any video file uploaded from outside the platform. Multiple clips can be arranged in order, trimmed, split, and reordered on the timeline.',
      'Voice — recorded live, right in your browser, using your microphone. This is separate from anything you’ve made on AI Voice Creation.',
      'Music — an uploaded audio file from outside the platform, or one of your own saved AI Voice Creation clips reused as the background track instead of music. There’s no music-generation tool built into the platform — music always comes from outside it.',
      'Text — titles, captions, or labels placed at a specific point on the timeline, with your own choice of position, size, colour, and duration.',
    ],
    typicalSession: [
      'A student building a 30-second video about their community garden might: add three AI-generated clips of the garden at different times of day in order, record a short voiceover explaining the project, drag in a background music track and turn its volume down low so the voice stays clear, and add a text title with the garden’s name over the first few seconds.',
      'None of this requires writing a prompt or getting anything critiqued — the whole session happens on the timeline itself, arranging and trimming pieces you already have.',
    ],
    lengthControl: [
      'Every clip on the timeline can be trimmed — drag its edges to shorten where it starts or ends — or split at the playhead into two separate pieces you can rearrange or delete independently.',
      'The music track and any voice recordings have their own independent volume and position, so you control how they overlap with the video underneath them.',
      'Text overlays each get their own duration — how long that title or caption stays on screen — set separately from the clip it’s sitting on top of.',
      'There’s no single "video length" you set upfront — the final length is just whatever your arrangement of trimmed clips, voice, music, and text adds up to.',
    ],
    buildSteps: [
      {
        id: 'do-clips',
        title: 'Add your clips',
        doLabel: 'Open Video Studio',
        body: [
          'Open the real page below. In the Clips tab, add two or more video clips in the order you want them — either your own saved AI Video Creation outputs, or something uploaded from outside the platform. Trim or split them to get the timing right.',
        ],
      },
      {
        id: 'do-layer',
        title: 'Layer in voice, music, and text',
        doLabel: 'Back to Video Studio',
        body: [
          'Record a short voiceover in the Voice tab using your microphone, add a background track in the Music tab (uploaded, or one of your saved AI Voice Creation clips), and drop in a text overlay for a title or caption in the Text tab.',
        ],
      },
    ],
    lengthControlTitle: 'Controlling length on the timeline',
    exportCaveat: [
      'Video Studio doesn’t support standalone images as timeline items today — only video files. If you want a still image in your video, the real workaround is to turn it into a short clip on AI Video Creation first (a "Text + Start Image" generation works well even with a mostly-static description), then bring that resulting video in here like any other clip.',
      'Exporting requires Chrome 94 or newer, since it renders your project entirely in the browser rather than on a server. Based on how the export is built, your background music and recorded voiceover may not make it into the downloaded file, even though they play correctly while you’re editing — so don’t treat the exported file as your only copy of anything. The page itself notes that if Chrome won’t play your download, try opening it in Firefox or VLC instead.',
    ],
    exportStep: {
      title: 'Save and export',
      doLabel: 'Back to Video Studio',
      body: ['Click Save first so your project is preserved even if you need to come back to it later, then Process Video and Download to get your finished file.'],
    },
    gateBody: ['You know what Video Studio actually is, where each type of asset comes from, and how to control pacing on the timeline. Tell us what you put together.'],
    gateLabel: 'What did you assemble, and what did it include?',
    gatePlaceholder: 'e.g. A 30-second garden tour — 3 clips, a recorded voiceover, and a title card',
  },

  'document-studio': {
    id: 'document-studio',
    title: 'Document Studio',
    kind: 'editor',
    hook: 'Not a generator either — an InDesign-style page layout editor for building real, print-ready documents: articles, newsletters, or a whole book.',
    guideBlurb: 'What you’re actually building, a typical layout session, real book trim sizes and formatting controls, and what to know before you export.',
    completionBlurb: 'You know what Document Studio actually is, how pages and frames fit together, how to format and size a real document, and how saving differs from exporting.',
    Icon: FileText,
    pageHref: '/tech-skills/document-studio',
    assetSources: [
      'Pages — each one starts as a 1, 2, or 3-column layout you choose, the same basic decision a real page-layout tool asks first.',
      'Text — typed directly into a column frame, with full rich-text formatting: font, size, weight, alignment, colour, and line height, all from an on-page toolbar.',
      'Images — uploaded from your device (PNG, JPEG, GIF, or WEBP, up to 10MB) and dropped into a frame.',
      'There’s no AI on this page at all — no prompt, no critique, no generation. Everything here is text you write and images you bring, laid out by hand.',
    ],
    typicalSession: [
      'A student putting together a short community newsletter might: create page one with a 2-column layout, type and format the lead story in the left column, drop a photo into the right, add a second page for a shorter piece, and pick a real trim size before exporting — the same sizes Amazon KDP uses for print books, from 5"×8" up to 8.5"×11", with margins that automatically account for binding.',
      'Document Studio also supports real-time collaboration — turn it on and a teammate can edit the same document with you live, seeing each other\'s cursors and changes as they happen.',
    ],
    lengthControl: [
      'Pages, not clips, are the unit here — add, duplicate, or reorder whole pages rather than trimming a timeline.',
      'Each column frame holds as much or as little text as you give it; the layout (1, 2, or 3 columns) is set per page, so a dense page and a sparse one can sit right next to each other in the same document.',
      'Typography controls — font, size, weight, alignment, colour, line height — are set per text selection, so a headline and its body text can look nothing alike within the same frame.',
    ],
    buildSteps: [
      {
        id: 'do-layout',
        title: 'Build your first page',
        doLabel: 'Open Document Studio',
        body: [
          'Open the real page below. Choose a 1, 2, or 3-column layout for your first page, then click into a column and start typing. Use the toolbar to format as you go — font, size, weight, alignment, colour, line height.',
        ],
      },
      {
        id: 'do-media',
        title: 'Add images and more pages',
        doLabel: 'Back to Document Studio',
        body: [
          'Drop an image into a frame — upload from your device, PNG/JPEG/GIF/WEBP up to 10MB — and add, duplicate, or reorder pages until your document has the shape you want. Try turning on Collaborate if you want to work with someone else live.',
        ],
      },
    ],
    lengthControlTitle: 'Pages, frames, and formatting',
    exportCaveat: [
      'Export PDF and Save are two different things: Export gives you a print-ready PDF sized to whichever trim size you picked, right away. Save persists the whole project — pages, text, images, layout — to your account separately, so you can reopen and keep editing it later. Exporting doesn’t automatically save, and saving doesn’t automatically export — do both if you want both.',
      'Pick your trim size deliberately before your final export: it changes the actual page dimensions and margins, not just a label, so switching it after you’ve laid everything out can shift your columns and images around.',
    ],
    exportStep: {
      title: 'Export and save',
      doLabel: 'Back to Document Studio',
      body: ['Pick a trim size that matches what you\'re actually making, click Export PDF to download a print-ready file, and click Save separately if you want to keep editing this project later.'],
    },
    gateBody: ['You know what Document Studio actually is, how pages and frames fit together, and how saving differs from exporting. Tell us what you put together.'],
    gateLabel: 'What did you build, and what did it include?',
    gatePlaceholder: 'e.g. A 2-page newsletter — one photo, a 2-column lead story, and a 5"x8" trim size',
  },
};

/* ─────────────────────────── step builders ───────────────────────── */

function buildGeneratorSteps(c: CategoryGuideContent): Step[] {
  const steps: Step[] = [
    {
      id: 'intro',
      kind: 'read',
      title: `What "${c.title}" actually does`,
      body: [c.hook],
      aside: c.regionGated
        ? 'This tool is currently available to students in Africa and North America. If you don’t see it in your Tech Skills menu, that’s why — not a bug.'
        : undefined,
    },
  ];

  if (c.extraNote) {
    steps.push({
      id: 'extra',
      kind: 'read',
      title: c.extraNote.title,
      body: c.extraNote.body,
    });
  }

  steps.push(
    {
      id: 'rubric',
      kind: 'read',
      title: `What makes a strong ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'}`,
      body: [
        c.isGated
          ? `The page’s own "${c.critiqueButtonLabel}" tool checks your prompt against these dimensions — and unlike Image or Voice Creation, this one is a real gate: the Generate button stays disabled until your prompt scores at least 6/10. This isn’t a suggestion here, it’s a requirement.`
          : `The page’s own "${c.critiqueButtonLabel}" tool checks your ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'} against these dimensions and gives it an informal score out of 10. The platform’s certification page is blunt about the biggest failure mode: something too short reads as having no real creative intent behind it, no matter how good the result happens to look.`,
      ],
      criteriaList: c.criteria,
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A case in action',
      body: [c.caseStudy!.scenario, `Watch the same idea written three times, each one better than the last — and read why each change actually matters, not just why it's longer.`],
      caseStudy: c.caseStudy,
    },
    {
      id: 'do-builtin',
      kind: 'do',
      title: 'Try the page’s own tools first',
      body: [
        `Open the real page below and write a first-draft ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'} for something you actually want to make. Before generating, click "${c.critiqueButtonLabel}" and read what it flags — or click "${c.stepByStepButtonLabel}" if you’d rather be walked through the same rubric one question at a time. Either one works; they’re two doors into the same checklist.`,
      ],
      doLabel: `Open ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'swivel',
      kind: 'swivel',
      title: 'Then get a second opinion from Claude',
      body: [
        c.isGated
          ? 'The on-page tool is fast and tuned exactly to this checklist, and clearing 6/10 is mandatory here — but it can’t brainstorm a genuinely different creative direction with you, and it won’t always catch something that reads as a stereotype or feels inauthentic to the real place you’re depicting. That’s where Claude in the AI Playground earns its place in the workflow.'
          : 'The on-page tool is fast and tuned exactly to this checklist — but it can’t brainstorm a genuinely different creative direction with you, and it won’t always catch something that reads as a stereotype or feels inauthentic to the real place you’re depicting. That’s where Claude in the AI Playground earns its place in the workflow.',
      ],
      prompt: c.swivelPrompt,
      promptNote: `Paste your own ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'} in where it says [PASTE YOUR ${c.id === 'ai-voice-creation' ? 'SCRIPT' : 'PROMPT'}] before sending it.`,
    },
    {
      id: 'why-both',
      kind: 'read',
      title: 'Why it’s worth using both',
      body: [
        'This isn’t redundant — the two tools are good at different things. The on-page critique is instant, free, and checks the mechanical rubric every time. Claude can reason more deeply: weigh two different creative directions against each other, push back on an idea that sounds fine but doesn’t quite work, or flag a cultural detail the checklist has no way to check for. Use the on-page tool for the checklist, and Claude for the judgment call.',
      ],
    },
    {
      id: 'do-generate',
      kind: 'do',
      title: `Generate your ${c.id === 'ai-video-creation' ? 'clip' : c.id === 'ai-voice-creation' ? 'audio' : 'image'}`,
      body: [
        `Take whatever came out of either tool — the on-page critique, the step-by-step coach, or Claude’s suggestions — and fold the best of it into one final ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'}. Generate it, and save your work so it’s not lost when you navigate away.`,
      ],
      doLabel: `Back to ${c.title}`,
      doHref: c.pageHref,
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: [
        `You’ve seen a weak ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'} turn into a strong one, know the exact dimensions being checked, and used both the on-page tool and Claude to get there. Tell us what you made.`,
      ],
      gate: {
        label: `What did you generate, and what was your final ${c.id === 'ai-voice-creation' ? 'script' : 'prompt'} about?`,
        placeholder: 'e.g. A sunset over a fishing village — after adding lighting and a camera angle',
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail about what you generated.';
          if (!/\s/.test(s)) return 'That looks like one word — add a bit more detail.';
          return null;
        },
      },
    },
  );

  return steps;
}

function buildEditorSteps(c: CategoryGuideContent): Step[] {
  const steps: Step[] = [
    {
      id: 'intro',
      kind: 'read',
      title: `What "${c.title}" actually is`,
      body: [
        c.hook,
        'There’s no AI tooling here at all — no prompt to write, no critique, nothing to swivel to Claude for. The skill this Guide teaches is assembly and pacing: arranging pieces you already have into something that actually holds together.',
      ],
    },
    {
      id: 'sources',
      kind: 'read',
      title: 'What you can bring in, and from where',
      body: c.assetSources!,
    },
    {
      id: 'case',
      kind: 'read',
      title: 'A typical session',
      body: c.typicalSession!,
    },
  ];

  for (const bs of c.buildSteps!) {
    steps.push({
      id: bs.id,
      kind: 'do',
      title: bs.title,
      body: bs.body,
      doLabel: bs.doLabel,
      doHref: c.pageHref,
    });
  }

  steps.push(
    {
      id: 'length',
      kind: 'read',
      title: c.lengthControlTitle ?? 'Controlling length',
      body: c.lengthControl!,
    },
    {
      id: 'export-caveat',
      kind: 'read',
      title: 'Before you export',
      body: c.exportCaveat!,
    },
    {
      id: 'do-export',
      kind: 'do',
      title: c.exportStep!.title,
      body: c.exportStep!.body,
      doLabel: c.exportStep!.doLabel,
      doHref: c.pageHref,
    },
    {
      id: 'gate',
      kind: 'gate',
      title: 'Prove it',
      body: c.gateBody!,
      gate: {
        label: c.gateLabel!,
        placeholder: c.gatePlaceholder!,
        validate: v => {
          const s = v.trim();
          if (s.length < 10) return 'Give a little more detail about what you assembled.';
          if (!/\s/.test(s)) return 'That looks like one word — add a bit more detail.';
          return null;
        },
      },
    },
  );

  return steps;
}

function buildSteps(c: CategoryGuideContent): Step[] {
  return c.kind === 'editor' ? buildEditorSteps(c) : buildGeneratorSteps(c);
}

/* ──────────────────────────── small parts ─────────────────────────── */

const CopyBlock: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more we can do */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div className="relative rounded-xl border border-purple-300 bg-purple-50 p-4 pr-32">
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-gray-800">{text}</pre>
      <button
        onClick={copy}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-purple-700"
      >
        {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

/* ──────────────────────────── main page ──────────────────────────── */

const CreativeAICategoryGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const content = categoryId ? CATEGORY_GUIDES[categoryId] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content) : []), [content]);
  const track = content ? `creative-ai-guide-${content.id}` : '';

  const [done, setDone] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [gateDraft, setGateDraft] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${track}`;

  useEffect(() => {
    if (!track) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const p = JSON.parse(raw);
        setDone(new Set<string>(p.completed ?? []));
        setArtifacts(p.artifacts ?? {});
      }
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey, track]);

  useEffect(() => {
    if (!userId || !track) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tutorial_progress')
        .select('completed_steps, artifacts')
        .eq('user_id', userId)
        .eq('track', track)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
      setArtifacts(prev => ({ ...(data.artifacts ?? {}), ...prev }));
    })();
    return () => { cancelled = true; };
  }, [userId, track]);

  const persist = useCallback((nextDone: Set<string>, nextArtifacts: Record<string, string>) => {
    if (!track) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        completed: [...nextDone], artifacts: nextArtifacts, updated: Date.now(),
      }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track,
        completed_steps: [...nextDone],
        artifacts: nextArtifacts,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, track, userId]);

  const firstIncompleteIndex = useMemo(() => {
    const idx = steps.findIndex(s => !done.has(s.id));
    return idx === -1 ? steps.length : idx;
  }, [steps, done]);

  const isUnlocked = (index: number) => index <= firstIncompleteIndex;

  const complete = (step: Step, value?: string) => {
    const nextDone = new Set(done); nextDone.add(step.id);
    const nextArt = value !== undefined ? { ...artifacts, [step.id]: value } : artifacts;
    setDone(nextDone); setArtifacts(nextArt); persist(nextDone, nextArt);
    setExpanded(prev => { const n = new Set(prev); n.delete(step.id); return n; });
  };

  const uncomplete = (step: Step) => {
    const nextDone = new Set(done); nextDone.delete(step.id);
    setDone(nextDone); persist(nextDone, artifacts);
  };

  const submitGate = (step: Step) => {
    const v = (gateDraft[step.id] ?? '').trim();
    const err = step.gate!.validate(v);
    if (err) { setGateError(p => ({ ...p, [step.id]: err })); return; }
    setGateError(p => ({ ...p, [step.id]: '' }));
    complete(step, v);
  };

  const swivel = async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* copy button is still there */ }
    window.open('/playground', '_blank', 'noopener');
  };

  const totalSteps = steps.length;
  const doneCount = steps.filter(s => done.has(s.id)).length;
  const pct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && doneCount === totalSteps;

  const KIND_STYLE: Record<StepKind, { badge: string; label: string; ring: string }> = {
    read:   { badge: 'bg-slate-100 text-slate-600',   label: 'Read',   ring: 'border-gray-200' },
    do:     { badge: 'bg-pink-100 text-pink-800',     label: 'Do',     ring: 'border-pink-200' },
    swivel: { badge: 'bg-purple-100 text-purple-800', label: 'Swivel', ring: 'border-purple-300' },
    gate:   { badge: 'bg-cyan-100 text-cyan-800',     label: 'Prove it', ring: 'border-cyan-300' },
  };

  if (!categoryId || !content) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 text-center">
          <p className="text-lg font-bold text-gray-900">We don’t have a Guide for that tool.</p>
          <button onClick={() => navigate('/tutorials')} className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!loaded) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">

        {/* header */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pink-500/20 text-pink-300">
              <content.Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Guide</p>
              <h1 className="mt-1 text-3xl font-extrabold">{content.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                {content.guideBlurb}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {totalSteps} steps</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-purple-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {!userId && (
              <p className="mt-2 text-xs text-slate-400">
                Your progress is saved on this device. Sign in to keep it across devices.
              </p>
            )}
          </div>
        </div>

        {/* steps */}
        {steps.map((step, i) => {
          const unlocked = isUnlocked(i);
          const isDone = done.has(step.id);
          const isOpen = unlocked && (!isDone || expanded.has(step.id));
          const st = KIND_STYLE[step.kind];

          return (
            <div
              key={step.id}
              className={`mb-3 overflow-hidden rounded-xl border bg-white transition-all ${isDone ? 'border-green-200' : st.ring} ${!unlocked ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => {
                  if (!unlocked) return;
                  setExpanded(prev => {
                    const n = new Set(prev);
                    if (n.has(step.id)) n.delete(step.id); else n.add(step.id);
                    return n;
                  });
                }}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="h-4 w-4" /> : unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.badge}`}>{st.label}</span>
                <span className={`flex-1 text-sm font-semibold ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.title}</span>
                {unlocked && (isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />)}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-6">
                  {step.body.map((p, k) => (
                    <p key={k} className="mb-3 text-[15px] leading-relaxed text-gray-700">{p}</p>
                  ))}

                  {step.criteriaList && (
                    <dl className="mb-3 space-y-2">
                      {step.criteriaList.map(cr => (
                        <div key={cr.name} className="rounded-lg border border-gray-200 p-3">
                          <dt className="text-sm font-bold text-gray-900">{cr.name}</dt>
                          <dd className="mt-1 text-sm text-gray-600">{cr.detail}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {step.caseStudy && (
                    <div className="mb-3 space-y-3">
                      {step.caseStudy.attempts.map((a, idx) => {
                        const tone = idx === 0 ? 'red' : idx === step.caseStudy!.attempts.length - 1 ? 'green' : 'amber';
                        const toneClasses = tone === 'red'
                          ? 'border-red-200 bg-red-50 text-red-700 [&_pre]:text-red-900'
                          : tone === 'amber'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 [&_pre]:text-amber-900'
                          : 'border-green-200 bg-green-50 text-green-700 [&_pre]:text-green-900';
                        return (
                          <div key={a.label}>
                            {a.whyBetter && (
                              <div className="mb-2 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                                <span className="font-bold text-cyan-800">Why this is better: </span>{a.whyBetter}
                              </div>
                            )}
                            <div className={`rounded-lg border p-3 ${toneClasses}`}>
                              <p className="mb-1 text-xs font-bold uppercase tracking-wide">{a.label}</p>
                              <p className="mb-2 text-sm italic text-gray-800">“{a.answer}”</p>
                              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">{a.critique}</pre>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {step.aside && (
                    <div className="mb-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-50 p-3 text-sm text-gray-700">
                      {step.aside}
                    </div>
                  )}

                  {step.kind === 'swivel' && step.prompt && (
                    <>
                      <div className="mb-3">
                        <CopyBlock text={step.prompt} />
                        {step.promptNote && <p className="mt-2 text-sm italic text-gray-500">{step.promptNote}</p>}
                      </div>
                      <button
                        onClick={() => swivel(step.prompt!)}
                        className="mb-3 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
                      >
                        <RotateCw className="h-4 w-4" />
                        Copy and open the AI Playground
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </button>
                    </>
                  )}

                  {step.kind === 'do' && step.doHref && (
                    <button
                      onClick={() => window.open(step.doHref!, '_blank', 'noopener')}
                      className="mb-3 flex items-center gap-2 rounded-lg border border-pink-300 bg-pink-50 px-4 py-2.5 text-sm font-bold text-pink-800 hover:bg-pink-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {step.doLabel ?? 'Open the page'}
                    </button>
                  )}

                  {step.gate ? (
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                      <label className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-900">
                        <Link2 className="h-4 w-4" />{step.gate.label}
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={gateDraft[step.id] ?? artifacts[step.id] ?? ''}
                          onChange={e => setGateDraft(p => ({ ...p, [step.id]: e.target.value }))}
                          placeholder={step.gate.placeholder}
                          className="flex-1 rounded-lg border border-cyan-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={() => submitGate(step)}
                          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-700"
                        >
                          {isDone ? 'Update' : 'Submit'}
                        </button>
                      </div>
                      {gateError[step.id] && <p className="mt-2 text-sm font-semibold text-red-600">{gateError[step.id]}</p>}
                      {isDone && artifacts[step.id] && (
                        <p className="mt-2 break-all text-xs text-cyan-800">Saved: {artifacts[step.id]}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {!isDone ? (
                        <button
                          onClick={() => complete(step)}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                        >
                          Mark done
                        </button>
                      ) : (
                        <button
                          onClick={() => uncomplete(step)}
                          className="text-sm font-semibold text-gray-400 hover:text-gray-600"
                        >
                          Not done yet
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {allDone && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-bold text-green-900">Guide complete.</p>
            <p className="mt-1 text-sm text-green-800">
              {content.completionBlurb}
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <button onClick={() => navigate('/tutorials')} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
            ← All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default CreativeAICategoryGuidePage;
