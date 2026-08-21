/**
 * Column rule for the equal-card grids (files and folders).
 *
 * The column count is derived from the container's own width via
 * `auto-fill`, never from viewport breakpoints: these grids render
 * beside a 280px tree pane, so the viewport is not the width they
 * actually have. See `DESIGN.md` §8.5 "Measure against the container,
 * not the viewport", and hako `QUBXdtQ2UL1X-O2FgwrM_`.
 *
 * A container query would be the other option, but the file cards can
 * mount a `<video>` for hover preview and `container-type` around a
 * media element breaks rendering on iOS Safari. `auto-fill` needs
 * neither a query nor a ResizeObserver.
 */
export const CARD_MIN_WIDTH = "16rem";

/**
 * `min(…, 100%)` so a container narrower than one card still yields a
 * single column instead of overflowing.
 */
export const cardGridColumns = `repeat(auto-fill, minmax(min(${CARD_MIN_WIDTH}, 100%), 1fr))`;
