export const SCENES_FILE = "vidscenes001";
export const SCENES_DRIVE = "family";
export const SCENES_DURATION = 720;
export const SCENES_FRAME_STEP = 12;
export const SCENES_FRAMES = 60;

export const SCENES_SHORT_LABEL = "Opening shot of the harbour";
export const SCENES_LONG_LABEL =
  "Two people talk across a table while the camera pushes in slowly and the light behind them shifts from blue to amber";
export const SCENES_LONG_TEXT =
  "The subtitle reads: we should have left before the rain started.";

/** A frame every 12 s for 12 minutes, so the grid moves a row at a time. */
export const SCENES_TIMESTAMPS = Array.from(
  { length: SCENES_FRAMES },
  (_, index) => ({
    start: index * SCENES_FRAME_STEP,
    content_preview: `frame ${index}`,
  }),
);

/**
 * One succeeded scene at the first frame with no `visible_text`, and one at
 * frame 4 whose label fills the card's two lines.
 */
export const SCENES_VISUAL_INDEX = {
  eligible: true,
  available: true,
  file_id: SCENES_FILE,
  active_run: {
    run_id: "run-e2e",
    status: "succeeded",
    selected_count: 2,
    completed_count: 2,
    succeeded_count: 2,
    failed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:01:00Z",
  },
  scenes: [
    {
      ordering: 0,
      start_time: 0,
      end_time: 12,
      status: "succeeded",
      scene_type: "establishing",
      scene_label: SCENES_SHORT_LABEL,
      visible_text: null,
      transcript_excerpt: null,
    },
    {
      ordering: 1,
      start_time: 48,
      end_time: 60,
      status: "succeeded",
      scene_type: "dialogue",
      scene_label: SCENES_LONG_LABEL,
      visible_text: SCENES_LONG_TEXT,
      transcript_excerpt: null,
    },
  ],
  staged_run: null,
  stale: false,
};

/**
 * The section reads its playback position from the shared media clock, which
 * polls this object rather than listening to it.
 */
export const SCENES_PLAYBACK = { time: 0, paused: true };

export const SCENES_LONG_FILE = "vidscenes002";
export const SCENES_LONG_DURATION = 35197;
export const SCENES_LONG_FRAME_STEP = 30;
export const SCENES_LONG_FRAMES = 500;

/** 500 frames ending at 4:09:30, in a file the player reports as 9:46:37. */
export const SCENES_LONG_TIMESTAMPS = Array.from(
  { length: SCENES_LONG_FRAMES },
  (_, index) => ({
    start: index * SCENES_LONG_FRAME_STEP,
    content_preview: `frame ${index}`,
  }),
);

export const SCENES_LONG_VISUAL_INDEX = {
  eligible: true,
  available: true,
  file_id: SCENES_LONG_FILE,
  active_run: {
    run_id: "run-long",
    status: "succeeded",
    selected_count: 0,
    completed_count: 0,
    succeeded_count: 0,
    failed_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:01:00Z",
  },
  scenes: [],
  staged_run: null,
  stale: false,
};
