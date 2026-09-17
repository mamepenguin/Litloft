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
        var scroller: Double?
    }

    /// Nil when the frame cannot be placed: a `.scroller` anchor whose scroll
    /// view was not found would otherwise sit wherever the page last was.
    static func frame(for geometry: SurfaceGeometry, offsets: Offsets, swipe: Double) -> CGRect? {
        let scrolled: Double
        var top: Double
        switch geometry.anchor {
        case .document:
            scrolled = offsets.document
            top = geometry.top - scrolled
        case .scroller(let box):
            guard let offset = offsets.scroller else { return nil }
            scrolled = offset
            top = Double(box.minY) + geometry.top - scrolled
        case .fixed:
            scrolled = 0
            top = geometry.top
        }

        if let stick = geometry.stick {
            let base: Double = if case .scroller(let box) = geometry.anchor { Double(box.minY) } else { 0 }
            top = max(top, stick.top)
            // Stuck, it still leaves with the block that holds it.
            top = min(top, base + stick.limit - scrolled - geometry.height)
        }

        return CGRect(x: geometry.left + swipe, y: top, width: geometry.width, height: geometry.height)
    }
}
