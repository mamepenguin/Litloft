import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as badges from "@/lib/matchBadges";
import en from "@/messages-core/en.json";
import type { MatchMeta } from "@/types";

import { MatchOverlay } from "../MatchOverlay";

const NEUTRAL = ["bg-bg-elevated", "text-text-muted", "font-medium", "text-[10px]"];

const styles = (badges as unknown as { MATCH_BADGE_STYLES: Record<string, string> })
  .MATCH_BADGE_STYLES;

describe("SPEC-CORE-066 I9 every match label wears one neutral style", () => {
  it("gives every kind in the table the same class string", () => {
    const kinds = badges.MATCH_BADGES.map((badge) => badge.key);
    const used = new Set(kinds.map((kind) => styles[kind]));

    expect(used.size).toBe(1);
    const [only] = [...used];
    for (const token of NEUTRAL) expect(only.split(/\s+/)).toContain(token);
  });

  it("draws the cards' labels, each with its own word, in that one style", () => {
    const match = {
      filename: { score: 1 },
      content: { score: 0.6 },
      transcript: [{ time_range: [10, 15], score: 0.7, text: "said" }],
      clip: [{ time_range: [42, 47], score: 0.8 }],
    } as unknown as MatchMeta;
    render(<MatchOverlay match={match} fileId="f1" />);

    const labels = [
      en.search.matchFilename,
      en.search.matchContent,
      en.search.matchTranscript,
      en.search.matchClip,
    ].map((word) => screen.getByText(word));
    const classes = new Set(labels.map((el) => el.className));

    expect(classes.size).toBe(1);
    for (const token of NEUTRAL) expect([...classes][0].split(/\s+/)).toContain(token);
  });
});
