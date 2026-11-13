import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { PassageList } from "@/components/search/PassageList";
import { ImageQueryViewPresenter } from "@/components/search/ImageQueryViewPresenter";
import { CommentSection } from "@/components/CommentSection";
import { FileDescription } from "@/components/FileDetail/FileDescription";
import { MetadataEditor } from "@/components/FileDetail/MetadataEditor";
import { CollectionDetail } from "@/components/CollectionDetail";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { QuickNotePresenter } from "@/components/quick-note/QuickNotePresenter";
import { FindTabPresenter } from "@/components/FileDetail/find/FindTabPresenter";
import { MatchOverlay } from "@/components/MatchOverlay";
import type { PassageGroup } from "@/lib/searchPassages";
import type { SearchPassage } from "@/lib/searchMerge";
import type { ImageEntry } from "@/lib/imageQuery";
import type { FindRow } from "@/lib/fileFind";
import type { FileItem } from "@/types";
import enMessages from "@/messages-core/en.json";

import SummarySection from "../../src/addons/intelligence/SummarySection";
import VisualDescriptionSection from "../../src/addons/intelligence/VisualDescriptionSection";
import PictureTextSection from "../../src/addons/intelligence/PictureTextSection";
import AskTab from "../../src/addons/intelligence/AskTab";
import IntelligenceAskPage from "../../src/addons/intelligence/Page";
import { CitationInlinePanel } from "../../src/addons/intelligence/CitationInlinePanel";
import {
  CitationRailProvider,
  useCitationRail,
} from "../../src/addons/intelligence/CitationRailContext";
import type { DetailedSummaryCitation } from "../../src/addons/intelligence/api";
import intelligenceEn from "../../src/addons/intelligence/messages/en.json";

import { READING } from "../readingTextSize.data";

type Messages = Record<string, unknown>;

function deepMerge(a: Messages, b: Messages): Messages {
  const out: Messages = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const prior = out[key];
    out[key] =
      prior && typeof prior === "object" && value && typeof value === "object"
        ? deepMerge(prior as Messages, value as Messages)
        : value;
  }
  return out;
}

const MESSAGES = deepMerge(enMessages as Messages, intelligenceEn as Messages);

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const STAMP = "2026-11-01T00:00:00Z";

/** Answers for the surfaces below; anything else falls through. */
const routes: Array<[RegExp, () => unknown]> = [
  [
    /\/api\/files\/rtcomment001\/comments$/,
    () => ({
      comments: [
        {
          id: "c1",
          nickname: "fixture",
          body: READING.comment,
          is_mine: true,
          created_at: STAMP,
          updated_at: STAMP,
        },
      ],
      total: 1,
    }),
  ],
  [
    /\/api\/drives\/fixture\/collections\/rtcollect001$/,
    () => ({
      id: "rtcollect001",
      name: "読書リスト",
      description: READING.collectionDescription,
      drive: "fixture",
      items: [],
      created_at: STAMP,
      updated_at: STAMP,
    }),
  ],
  [
    /\/api\/addons\/intelligence\/files\/rtsumpara001\/summary$/,
    () => ({
      available: true,
      file_id: "rtsumpara001",
      short_summary: READING.summaryShort,
      long_summary: READING.summaryLongParagraph,
      model: "fixture-model",
      status: "generated",
      edited_at: null,
      has_original: false,
    }),
  ],
  [
    /\/api\/addons\/intelligence\/files\/rtsumlist001\/summary$/,
    () => ({
      available: true,
      file_id: "rtsumlist001",
      short_summary: READING.summaryShort,
      long_summary: READING.summaryLongItems.map((item) => `- ${item}`).join("\n"),
      model: "fixture-model",
      status: "generated",
      edited_at: null,
      has_original: false,
    }),
  ],
  [
    /\/api\/files\/rtvision0001$/,
    () => ({
      id: "rtvision0001",
      drive: "fixture",
      filename: "庭.jpg",
      file_type: "image",
      mime_type: "image/jpeg",
    }),
  ],
  [
    /\/api\/addons\/intelligence\/files\/rtvision0001\/visual_description$/,
    () => ({
      file_id: "rtvision0001",
      visual_description: READING.visualDescription,
      status: "success",
      reason: null,
      model: "fixture-vision",
      generated_at: STAMP,
    }),
  ],
  [
    /\/api\/addons\/intelligence\/files\/rtpicture001\/picture-text$/,
    () => ({
      file_id: "rtpicture001",
      text: READING.pictureLines.join("\n"),
      corrected: false,
      has_original: false,
      busy: false,
    }),
  ],
  [
    /\/api\/addons\/intelligence\/files\/rtcite000001\/chunks\/[^/]+\/excerpt$/,
    () => ({
      chunk_id: "transcript:1",
      file_id: "rtcite000001",
      prefix: READING.citationPrefix,
      target: READING.citationTarget,
      suffix: READING.citationSuffix,
      start_time: 12,
      end_time: 20,
      page: null,
      section: null,
      section_title: null,
    }),
  ],
];

const fallThrough = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = url.split("?")[0];
  for (const [pattern, answer] of routes) {
    if (pattern.test(path)) return Promise.resolve(json(answer()));
  }
  return fallThrough(input, init);
};

/** Reference spans the cases read the theme's two text colours from. */
function Probes(): ReactElement {
  return (
    <div aria-hidden className="h-0 overflow-hidden">
      <span data-probe="primary" className="text-text-primary">
        primary
      </span>
      <span data-probe="muted" className="text-text-muted">
        muted
      </span>
      <span data-probe="highlight" className="bg-highlight-bg">
        highlight
      </span>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <div id="reading-host" className="min-h-screen bg-bg-primary p-4">
        {children}
        <Probes />
      </div>
    </NextIntlClientProvider>
  );
}

function passage(over: Partial<SearchPassage>): SearchPassage {
  return {
    kind: "text",
    start: null,
    end: null,
    page: null,
    section: null,
    section_title: null,
    chunk_index: 0,
    text: "",
    score: 1,
    keyword: false,
    highlight_terms: [],
    frame_url: null,
    ...over,
  };
}

const PASSAGE_GROUPS: PassageGroup[] = [
  {
    fileId: "rtpassage001",
    filename: READING.passageFilename,
    fileType: "text",
    file: null,
    bestScore: 0.9,
    passages: [
      passage({
        kind: "section",
        section: 3,
        section_title: READING.passageSectionTitle,
        text: READING.passagePlain,
      }),
    ],
  },
  {
    fileId: "rtpassage002",
    filename: "観察記録.md",
    fileType: "text",
    file: null,
    bestScore: 0.8,
    passages: [
      passage({
        text: READING.passageKeyword,
        keyword: true,
        highlight_terms: [READING.passageKeywordTerm],
      }),
    ],
  },
  {
    fileId: "rtpassage003",
    filename: "講義.mp4",
    fileType: "video",
    file: null,
    bestScore: 0.7,
    passages: [
      passage({ kind: "scene", start: 30, end: 40, text: "" }),
      passage({ kind: "screen_text", start: 50, end: 55, text: READING.passageScreenText }),
    ],
  },
];

export function ReadingPassagesArrangement(): ReactElement {
  return (
    <Frame>
      <PassageList state="listed" groups={PASSAGE_GROUPS} filesCount={PASSAGE_GROUPS.length} />
    </Frame>
  );
}

const IMAGE_ENTRY: ImageEntry = {
  id: "rtimage0001",
  blob: new Blob([]),
  type: "image/png",
  objectUrl: "",
  state: "answered",
  answer: {
    images: [],
    scenes: [],
    scenes_partial: false,
    documents: [
      {
        file_id: "rtimgdoc0001",
        drive: "fixture",
        filename: READING.imageDocFilename,
        file_type: "text",
        score: 0.9,
        file: null,
        passages: [
          {
            kind: "section",
            start: null,
            end: null,
            page: null,
            section: 2,
            section_title: READING.imageDocSectionTitle,
            chunk_index: 0,
            text: READING.imageDocExcerpt,
            score: 0.9,
            keyword: false,
            highlight_terms: [],
            frame_url: null,
          },
        ],
      },
    ],
    text: { status: "read", excerpt: null },
  },
  failure: null,
  controller: null,
  used: 0,
};

export function ReadingImageQueryArrangement(): ReactElement {
  const noop = () => {};
  return (
    <Frame>
      <ImageQueryViewPresenter
        drive="fixture"
        availability="available"
        entry={IMAGE_ENTRY}
        error={null}
        preparing={false}
        overlay={false}
        onRemoveImage={noop}
        onImagePick={noop}
        onImagePaste={noop}
        onImageMany={noop}
        onEdit={noop}
        onRetry={noop}
        onDrop={noop}
        onDragEnter={noop}
        onDragOver={noop}
        onDragLeave={noop}
      />
    </Frame>
  );
}

export function ReadingCommentsArrangement(): ReactElement {
  return (
    <Frame>
      <CommentSection fileId="rtcomment001" />
    </Frame>
  );
}

const DESCRIBED_FILE = {
  id: "rtdescribe01",
  drive: "fixture",
  filename: "メモ.pdf",
  file_type: "document",
  mime_type: "application/pdf",
  duration: null,
  description: READING.fileDescription,
} as unknown as FileItem;

export function ReadingFileDescriptionArrangement(): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string>(READING.fileDescriptionDraft);
  const noop = () => {};
  return (
    <Frame>
      <div className="max-w-md">
        <FileDescription
          file={DESCRIBED_FILE}
          isTimedMedia={false}
          mediaController={null}
          inspector={false}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((v) => !v)}
        />
        <div className="mt-6">
          <MetadataEditor
            title="メモ"
            description={draft}
            saving={false}
            onTitleChange={noop}
            onDescriptionChange={setDraft}
            onSave={noop}
            onCancel={noop}
          />
        </div>
      </div>
    </Frame>
  );
}

export function ReadingCollectionArrangement(): ReactElement {
  return (
    <Frame>
      <CurrentDriveProvider>
        <CollectionDetail drive="fixture" collectionId="rtcollect001" />
      </CurrentDriveProvider>
    </Frame>
  );
}

export function ReadingQuickNoteArrangement(): ReactElement {
  const noop = () => {};
  return (
    <Frame>
      <QuickNotePresenter
        open
        onOpen={noop}
        triggerRef={{ current: null }}
        dialogRef={{ current: null }}
        onDialogKeyDown={noop}
        body={READING.quickNote}
        onBodyChange={noop}
        filename="note.md"
        bodyRef={{ current: null }}
        drives={["fixture"]}
        drive="fixture"
        onDriveChange={noop}
        folder="Inbox"
        onFolderChange={noop}
        destinationOpen={false}
        onToggleDestination={noop}
        drivesLoading={false}
        drivesFailed={false}
        onReloadDrives={noop}
        canSave
        submitting={null}
        error={null}
        onSave={noop}
        onSaveAndOpen={noop}
        onRequestClose={noop}
        discardOpen={false}
        discardRef={{ current: null }}
        onConfirmDiscard={noop}
        onCancelDiscard={noop}
      />
    </Frame>
  );
}

export function ReadingSummaryParagraphArrangement(): ReactElement {
  return (
    <Frame>
      <div className="max-w-md">
        <SummarySection fileId="rtsumpara001" drive="fixture" />
      </div>
    </Frame>
  );
}

export function ReadingSummaryListArrangement(): ReactElement {
  return (
    <Frame>
      <div className="max-w-md">
        <SummarySection fileId="rtsumlist001" drive="fixture" />
      </div>
    </Frame>
  );
}

export function ReadingVisualDescriptionArrangement(): ReactElement {
  return (
    <Frame>
      <div className="max-w-md">
        <VisualDescriptionSection fileId="rtvision0001" drive="fixture" />
      </div>
    </Frame>
  );
}

export function ReadingPictureTextArrangement(): ReactElement {
  return (
    <Frame>
      <div className="max-w-md">
        <PictureTextSection fileId="rtpicture001" drive="fixture" />
      </div>
    </Frame>
  );
}

const CITATION: DetailedSummaryCitation = {
  section_path: "rt/1",
  segment_type: "paragraph",
  segment_text: "引用された一文。",
  chunk_ids: ["transcript:1"],
  top_score: 0.95,
  has_citation: true,
};

function OpenCitation(): null {
  const { toggle, isExpanded } = useCitationRail();
  const open = isExpanded(CITATION.section_path);
  useEffect(() => {
    if (!open) toggle(CITATION);
  }, [open, toggle]);
  return null;
}

export function ReadingCitationArrangement(): ReactElement {
  return (
    <Frame>
      <div className="max-w-md">
        <CitationRailProvider fileId="rtcite000001" drive="fixture">
          <OpenCitation />
          <CitationInlinePanel
            sectionPath={CITATION.section_path}
            citation={CITATION}
            segmentType="paragraph"
          />
        </CitationRailProvider>
      </div>
    </Frame>
  );
}

export function ReadingAskTabArrangement(): ReactElement {
  return (
    <Frame>
      <div
        id="reading-ask-tab"
        className="flex h-[640px] max-w-md flex-col overflow-hidden rounded-xl border border-bg-border bg-bg-card"
      >
        <AskTab
          fileId="rtasktab0001"
          drive="fixture"
          filename="講義.mp4"
          fileType="video"
          fillHeight
          onAvailability={() => {}}
        />
      </div>
    </Frame>
  );
}

export function ReadingAskPageArrangement(): ReactElement {
  return (
    <Frame>
      <CurrentDriveProvider>
        <IntelligenceAskPage />
      </CurrentDriveProvider>
    </Frame>
  );
}

const FIND_ROWS: FindRow[] = [
  {
    kind: "text",
    ordinal: 0,
    snippet: READING.findSnippet,
    match_start: 0,
    match_length: 2,
  } as FindRow,
];

export function ReadingFindTabArrangement(): ReactElement {
  return (
    <Frame>
      <div className="h-96 max-w-md">
        <FindTabPresenter
          listRef={{ current: null }}
          chips={[]}
          rows={FIND_ROWS}
          currentRow={null}
          truncated={false}
          onScroll={() => {}}
          onSelectRow={() => {}}
          onSelectFilter={() => {}}
          onFormatLocator={() => ({ place: "0:12" })}
          rowKey={(_row, index) => String(index)}
        />
      </div>
    </Frame>
  );
}

const MATCH_META = {
  transcript: [{ text: READING.matchSnippet, time_range: [5, 9], score: 0.9 }],
};

const MATCHED_FILE = {
  id: "rtmatched001",
  drive: "fixture",
  filename: "講義.mp4",
  file_type: "video",
  mime_type: "video/mp4",
  folder_path: "",
  file_path: "講義.mp4",
  match_meta: MATCH_META,
};

export function ReadingMatchSnippetArrangement(): ReactElement {
  return (
    <Frame>
      <div className="max-w-xs">
        <MatchOverlay
          match={MATCH_META as never}
          fileId={MATCHED_FILE.id}
          file={MATCHED_FILE as never}
        />
      </div>
    </Frame>
  );
}

export const READING_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "reading-passages": ReadingPassagesArrangement,
  "reading-image-query": ReadingImageQueryArrangement,
  "reading-comments": ReadingCommentsArrangement,
  "reading-file-description": ReadingFileDescriptionArrangement,
  "reading-collection": ReadingCollectionArrangement,
  "reading-quick-note": ReadingQuickNoteArrangement,
  "reading-summary-paragraph": ReadingSummaryParagraphArrangement,
  "reading-summary-list": ReadingSummaryListArrangement,
  "reading-visual-description": ReadingVisualDescriptionArrangement,
  "reading-picture-text": ReadingPictureTextArrangement,
  "reading-citation": ReadingCitationArrangement,
  "reading-ask-tab": ReadingAskTabArrangement,
  "reading-ask-page": ReadingAskPageArrangement,
  "reading-find-tab": ReadingFindTabArrangement,
  "reading-match-snippet": ReadingMatchSnippetArrangement,
};
