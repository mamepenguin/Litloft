# Design check

at: 718a10627766f047e207b41ebdaf4922edfc3582
design: docs/process/reviews/feature-loft-channel-videos/design/

## Decisions read from the design
- Main (1440): sidebar 240px, active item "YouTube とフィード" (Main.dc.html:17-21)
- Main: header = back link 13px muted with chevron, h1 24px/700, drive name 13px muted (Main.dc.html:24-31)
- Main: grid 3 columns, column-gap 16, row-gap 32, padding 24 16 24 (Main.dc.html:32)
- Main: thumb 16/9, radius 16, duration badge bottom-right (12px/500, rgba(0,0,0,.7), radius 8) (Main.dc.html:36-37)
- Main: progress bar 4px at thumb bottom, white fill, on watched items (Main.dc.html:38-40)
- Main: title 16px/22px weight 500, 2-line clamp, margin-top 12 (Main.dc.html:42)
- Main: date line 14px muted, margin-top 4 (Main.dc.html:43)
- Phone (390): 2 columns, gap 16/32, padding 20 16; same card (Phone.dc.html:25-33)
- Phone: back link min-height 44px (Phone.dc.html:18)
- Phone: no progress bar drawn (Phone.dc.html:29-31)
- Inspector (360): pill tabs 情報 / 文字起こし / コメント, selected = #f6f6f3 pill (Inspector.dc.html:17-21)
- Inspector: title 17px/24px weight 600 (Inspector.dc.html:23)
- Inspector: byline "[channel] · 2026-11-18", channel 12px/500 link, date muted (Inspector.dc.html:24-27)
- Inspector: description 12px/18px muted (Inspector.dc.html:28)
- Inspector: "字幕あり" teal pill badge (Inspector.dc.html:29)
- Inspector: detail grid 種類 / 場所 / 追加日, labels 96px column (Inspector.dc.html:30-34)

## Findings
### D-1 Main/Phone: duration badge is not drawn on any card
- design: duration badge on every thumbnail, bottom-right (Main.dc.html:37, Phone.dc.html:30)
- implementation: none of the 60 cards in the screenshots has a badge (r5/channel-1440-ready.png, r5/channel-390-ready.png); VideoCard draws it conditionally (frontend/src/components/videoapp/VideoCard.tsx:80-81)
- visible: at a glance

### D-2 Main: watched-progress bar is not shown in R-5
- design: 4px white progress bar on watched items (Main.dc.html:38-40)
- implementation: no card in the screenshots shows a progress state, so it cannot be checked (VideoCard.tsx:84 draws one when watch_progress exists)
- visible: not shown in R-5, cannot be checked

### D-3 Inspector: byline date is raw "20261120", design is "2026-11-18" format
- design: " · 2026-11-18" (Inspector.dc.html:26)
- implementation: "YuriGames · 20261120" (r5/inspector-branch-1440-rest.png, r5/inspector-branch-390-rest.png; addons/media_import/frontend/LoftMetadataPanel.tsx:110 prints metadata.published_at unformatted)
- visible: at a glance

### D-4 Inspector: tabs differ in kind, label and set
- design: pill tabs 情報 / 文字起こし / コメント, selected as grey pill (Inspector.dc.html:17-21)
- implementation: underlined text tabs Info / Related / Ask at 1440 (Transcript, Scenes, Related, Ask at 390); Comments is a collapsible row below (r5/inspector-branch-1440-rest.png, r5/inspector-branch-390-rest.png)
- visible: at a glance

### D-5 Inspector: title size
- design: 17px/24px, weight 600 (Inspector.dc.html:23)
- implementation: title is visibly larger, about 20px, bold, wrapping to 3 lines at 1440 (r5/inspector-branch-1440-rest.png)
- visible: side by side

### D-6 Inspector: "字幕あり" badge and 種類 / 場所 / 追加日 grid are absent
- design: teal badge plus a 3-row detail grid under a divider (Inspector.dc.html:29-34)
- implementation: neither appears; below the description are Like / Favorites / Verified, AI, tag and Comments rows (r5/inspector-branch-1440-rest.png). The 字幕あり badge may depend on the sample's caption state and is not shown in R-5 for a captioned file.
- visible: at a glance

### D-7 Phone: back-link touch target
- design: back link min-height 44px (Phone.dc.html:18)
- implementation: Link is an inline-flex 13px row with no min-height (ChannelVideos.tsx:261-267); PageHeader may add padding, but the 390 screenshot does not show a 44px row (r5/channel-390-ready.png)
- visible: only by measuring

### D-8 Main: sidebar active item and header chrome
- design: sidebar shows only Litloft / ホーム / 動画 / YouTube とフィード, with no top bar (Main.dc.html:17-31)
- implementation: the real app shell (top toolbar with icons, full nav and collections) surrounds the page (r5/channel-1440-ready.png). The active item matches; the shell is not the addon's content.
- visible: at a glance

TOTAL: 8 findings
