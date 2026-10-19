import CoreGraphics

/// Where the video goes in the web view this frame. The page reports geometry
/// that does not change while it scrolls; the offsets are read from the web
/// view's own scroll views, so the video moves in the same frame as the page.
enum SurfacePlacement {
    /// The scroll offsets `frame` needs. `document` is the web view's scroll
    /// position including its top inset, the same number the page calls
    /// `scrollY`. `scroller` is the offset of the scroll view that backs a
    /// `.scroller` anchor, when one was found.
    struct Offsets: Equatable {
        var document: Double
        /// The scroll view behind a `.scroller` anchor: where its top is in the
        /// web view now, and how far it has scrolled. Read live, because the
        /// page reports the box it measured and that box moves with the
        /// document.
        var scroller: (top: Double, scrolled: Double)?

        static func == (lhs: Offsets, rhs: Offsets) -> Bool {
            lhs.document == rhs.document && lhs.scroller?.top == rhs.scroller?.top
                && lhs.scroller?.scrolled == rhs.scroller?.scrolled
        }
    }

    /// Nil when the frame cannot be placed: a `.scroller` anchor whose scroll
    /// view was not found would otherwise sit wherever the page last was.
    static func frame(for geometry: SurfaceGeometry, offsets: Offsets, swipe: Double) -> CGRect? {
        let scrolled: Double
        // Where the anchor's own viewport starts in the web view.
        let base: Double
        switch geometry.anchor {
        case .document:
            scrolled = offsets.document
            base = 0
        case .scroller:
            guard let scroller = offsets.scroller else { return nil }
            scrolled = scroller.scrolled
            base = scroller.top
        case .fixed:
            scrolled = 0
            base = 0
        }
        var top = base + geometry.top - scrolled

        if let stick = geometry.stick {
            top = max(top, base + stick.top)
            // Stuck, it still leaves with the block that holds it.
            top = min(top, base + stick.limit - scrolled - geometry.height)
        }

        return CGRect(x: geometry.left + swipe, y: top, width: geometry.width, height: geometry.height)
    }
}
