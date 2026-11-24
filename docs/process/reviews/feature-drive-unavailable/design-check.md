# Design check

at: 4a0d5817a8bf33453a08274d2e2a85b46c0cee09
design: docs/process/reviews/feature-drive-unavailable/design/

## Decisions read from the design
- DriveMissingA: frame 390 x 844, white, column (DriveMissingA.dc.html:16)
- DriveMissingA: simplified header 56px with menu left, search right (stand-in per spec) (:17-21)
- DriveMissingA: content box flex:1, column, centred both ways, gap 16px, padding 0 24px 120px (:22)
- DriveMissingA: tile 48x48, radius 16, bg #f6f6f3, icon 24px muted #62625b, HardDrive glyph (:23)
- DriveMissingA: h1 18px bold, centred, names the drive, no second sentence (:24)
- DriveMissingA: link row gap 8, wrap, centred (:25)
- DriveMissingA: "ドライブ一覧へ" min-height 44, padding 0 16, radius 16, bg #e5e5e0 (Sand), 14px (:26)
- DriveMissingA: "ロックを解除" same box, no background (Ghost), colour #62625b (:27)

## Findings
### D-1 DriveMissingA: the Unlock link is not shown in any R-5 screenshot
- design: second link "ロックを解除", Ghost look, muted text, beside the Sand link (DriveMissingA.dc.html:27)
- implementation: all 16 screenshots (/private/tmp/claude-502/r5du/{ja,en}-{m,d}-{root,file,apps,long}.png) are of an unknown drive with passwords.json = [], so only "ドライブ一覧へ" / "All drives" is drawn (e.g. ja-m-root.png, en-m-long.png). decisions.md lists the locked-drive case as pending. The look (Ghost, muted, row gap and wrap with the Sand link) is not shown in R-5, cannot be checked. Code only: DriveUnavailable.tsx:39-46 uses `text-text-muted hover:bg-bg-elevated`, same box classes as the Sand link, which matches the design's values.
- visible: not shown in R-5, cannot be checked

## Compared, no difference noticed
- Tile 48px rounded, muted HardDrive, elevated bg; 16px gaps; heading 18px bold centred; group sits above centre (ja-m-root.png: group centre about y=394 against a content box centre of about 390 after the 120px padding); Sand button 44px tall on the phone (88px at 2x) and about 36px on desktop; long name wraps inside the 24px side padding (en-m-long.png). Header and sidebar are real app chrome, not the stand-in, per spec.

TOTAL: 1 findings
