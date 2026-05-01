/**
 * Side-effect module: registers the providers Core ships with.
 *
 * Phase 0 ships YouTube + Vimeo. The N=2 set is deliberate — testing
 * the registry against two providers (rather than only YouTube) catches
 * abstraction leaks before third-party addons start depending on the
 * shape of LoftEmbedProps.
 *
 * Importing this module triggers the registrations exactly once due to
 * ES module evaluation semantics. The module has no exports, so the
 * import should appear at the top of any module that renders a
 * LoftPlayer.
 */

import { registerLoftPlayer } from "./playerRegistry";
import YouTubeEmbed from "./YouTubeEmbed";
import VimeoEmbed from "./VimeoEmbed";

registerLoftPlayer("youtube", YouTubeEmbed);
registerLoftPlayer("vimeo", VimeoEmbed);
