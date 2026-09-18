import CoreGraphics
import Testing

@testable import Litloft

private func geometry(
    anchor: SurfaceGeometry.Anchor = .document,
    top: Double = 104,
    stick: SurfaceGeometry.Stick? = nil
) -> SurfaceGeometry {
    SurfaceGeometry(left: 8, width: 400, height: 225, anchor: anchor, top: top, stick: stick)
}

private func place(
    _ geometry: SurfaceGeometry,
    document: Double = 0,
    scroller: (top: Double, scrolled: Double)? = nil,
    swipe: Double = 0
) -> CGRect? {
    SurfacePlacement.frame(
        for: geometry,
        offsets: SurfacePlacement.Offsets(document: document, scroller: scroller),
        swipe: swipe
    )
}

struct SurfacePlacementTests {
    @Test("a frame in the document moves up as the document scrolls", arguments: [0.0, 60, 300])
    func documentScroll(offset: Double) {
        #expect(place(geometry(), document: offset) == CGRect(x: 8, y: 104 - offset, width: 400, height: 225))
    }

    @Test("a frame in a scrolling element moves with that element, not the document")
    func scrollerScroll() {
        let inner = geometry(anchor: .scroller(CGRect(x: 0, y: 56, width: 402, height: 700)), top: 24)
        #expect(place(inner, document: 500, scroller: (top: 56, scrolled: 0))?.minY == 80)
        #expect(place(inner, document: 500, scroller: (top: 56, scrolled: 100))?.minY == -20)
        // The scrolling element itself moved: the frame goes with it.
        #expect(place(inner, document: 500, scroller: (top: -44, scrolled: 0))?.minY == -20)
    }

    @Test("a frame in a scrolling element whose scroll view is unknown is not placed")
    func unknownScrollerIsNotPlaced() {
        let inner = geometry(anchor: .scroller(CGRect(x: 0, y: 56, width: 402, height: 700)), top: 24)
        #expect(place(inner, document: 0, scroller: nil) == nil)
    }

    @Test("a fixed frame ignores every scroll")
    func fixedFrame() {
        #expect(place(geometry(anchor: .fixed, top: 0), document: 400, scroller: (top: 10, scrolled: 90))?.minY == 0)
    }

    @Test("a sticky frame scrolls until its top, stays there, then leaves with its block", arguments: [
        (0.0, 104.0), (50, 54), (104, 0), (200, 0), (275, 0), (300, -25), (500, -225)
    ])
    func stickyInDocument(offset: Double, expectedTop: Double) {
        // Sticks at the viewport top; its block ends at document y 500.
        let sticky = geometry(stick: SurfaceGeometry.Stick(top: 0, limit: 500))
        #expect(place(sticky, document: offset)?.minY == CGFloat(expectedTop))
    }

    @Test("a sticky frame in a scrolling element counts from that element")
    func stickyInScroller() {
        let box = CGRect(x: 0, y: 56, width: 402, height: 700)
        // `stick.top` counts from the scrolling element, as `top` does.
        let sticky = geometry(anchor: .scroller(box), top: 24, stick: SurfaceGeometry.Stick(top: 0, limit: 1200))
        #expect(place(sticky, scroller: (top: 56, scrolled: 0))?.minY == 80)
        #expect(place(sticky, scroller: (top: 56, scrolled: 400))?.minY == 56)
        // 56 + 1200 - 1100 - 225
        #expect(place(sticky, scroller: (top: 56, scrolled: 1100))?.minY == -69)
    }

    @Test("a back swipe carries the frame sideways by the swipe")
    func swipe() {
        #expect(place(geometry(), swipe: 120)?.minX == 128)
        #expect(place(geometry(anchor: .fixed, top: 0), swipe: 30)?.minX == 38)
    }
}
