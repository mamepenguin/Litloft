import AVFoundation
import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

/// A real web view in the app's window, since WebKit only builds its scroll
/// views and layers for a view on screen.
@MainActor
private final class Page {
    let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
    let player = AVPlayer()
    let surface: VideoSurface

    init() {
        surface = VideoSurface(player: player)
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first }
            .first?
            .addSubview(webView)
        surface.attach(to: webView)
    }

    func load(_ body: String) async throws {
        webView.loadHTMLString(
            // As the app's pages do, so the page's viewport is the web view's box.
            "<html><head><meta name=viewport content='width=device-width, viewport-fit=cover'></head>"
                + "<body style='margin:0'>\(body)</body></html>",
            baseURL: nil
        )
        #expect(await until { !self.webView.isLoading })
        let height = try await webView.evaluateJavaScript("document.documentElement.scrollHeight") as? Double ?? 0
        // The layout reaches the web view's own scroll view a moment later.
        #expect(await until { self.webView.scrollView.contentSize.height >= height - 1 })
        surface.pageDidLoad()
    }

    func script(_ source: String) async throws -> Any? {
        try await webView.evaluateJavaScript(source)
    }

    func close() {
        webView.removeFromSuperview()
    }
}

@MainActor
private func until(_ timeout: Duration = .seconds(5), _ condition: () -> Bool) async -> Bool {
    let deadline = ContinuousClock.now + timeout
    while !condition() {
        if ContinuousClock.now > deadline { return false }
        try? await Task.sleep(for: .milliseconds(20))
    }
    return true
}

private func sameColour(_ lhs: UIColor?, _ rhs: UIColor) -> Bool {
    let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let left = lhs?.cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components,
          let right = rhs.cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components,
          left.count == right.count
    else { return false }
    return zip(left, right).allSatisfy { abs($0 - $1) < 0.01 }
}

private func documentFrame(top: Double) -> SurfaceGeometry {
    SurfaceGeometry(left: 0, width: 390, height: 219, anchor: .document, top: top, stick: nil)
}

extension SharedMediaState {
    @MainActor
    @Suite
    struct VideoSurfaceTests {
        @Test("the video sits beneath the page and shows only for a placed video")
        func showsOnlyAPlacedVideo() async throws {
            let page = Page()
            defer { page.close() }
            #expect(page.webView.subviews.first === page.surface.view)
            #expect(page.surface.view.isHidden)

            page.surface.place(documentFrame(top: 40))
            #expect(page.surface.view.isHidden, "shown with no video loaded")

            page.surface.showsVideo(true)
            #expect(page.surface.view.isHidden, "a frame placed before the load was kept")
            page.surface.place(documentFrame(top: 40))
            #expect(!page.surface.view.isHidden)
            #expect(page.surface.view.frame == CGRect(x: 0, y: 40, width: 390, height: 219))

            page.surface.place(nil)
            #expect(page.surface.view.isHidden)

            page.surface.place(documentFrame(top: 40))
            page.surface.showsVideo(false)
            #expect(page.surface.view.isHidden)
            page.surface.place(documentFrame(top: 40))
            #expect(page.surface.view.isHidden, "a stale frame came back without a video")
        }

        @Test("WebKit's own layers are kept transparent while a video shows, around the page's colour")
        func backgroundsStayClear() async throws {
            let page = Page()
            defer { page.close() }
            page.surface.setPageColor(PageColor(red: 0.1, green: 0.05, blue: 0.06))
            try await page.load("<div style='height:2000px'></div>")
            let content = try #require(page.webView.scrollView.subviews.first(where: VideoSurface.isContentView))
            let pageColor = UIColor(red: 0.1, green: 0.05, blue: 0.06, alpha: 1)

            #expect(sameColour(page.webView.backgroundColor, pageColor))
            #expect(sameColour(page.webView.underPageBackgroundColor, pageColor))
            #expect(page.webView.scrollView.backgroundColor != .clear, "cleared with no video")

            page.surface.showsVideo(true)
            page.surface.place(documentFrame(top: 0))
            #expect(page.webView.scrollView.backgroundColor == .clear)
            #expect(content.backgroundColor == .clear)

            #expect(sameColour(page.webView.backgroundColor, pageColor))
        }

        @Test("WebKit's repainting after a load or a colour change is undone while a video shows")
        func repaintingIsUndone() async throws {
            let page = Page()
            defer { page.close() }
            page.surface.showsVideo(true)
            page.surface.place(documentFrame(top: 0))

            // The app's pages carry a theme colour, which WebKit paints its own layers with.
            try await page.load("""
                <meta name=theme-color content='#ff0000'>
                <div style='height:2000px;background:#f00'></div>
                """)
            _ = try await page.script("""
                document.querySelector('meta[name=theme-color]').content = '#0000ff';
                document.body.style.background = '#00f';
                """)
            try await Task.sleep(for: .milliseconds(300))

            #expect(await until { page.webView.scrollView.backgroundColor == .clear })
            let content = try #require(page.webView.scrollView.subviews.first(where: VideoSurface.isContentView))
            #expect(await until { content.backgroundColor == .clear })
        }

        @Test("a frame in the document follows the document's scroll")
        func followsTheDocument() async throws {
            let page = Page()
            defer { page.close() }
            try await page.load("<div style='height:3000px'></div>")
            page.surface.showsVideo(true)
            page.surface.place(documentFrame(top: 300))

            page.webView.scrollView.setContentOffset(
                CGPoint(x: 0, y: 120 - page.webView.scrollView.adjustedContentInset.top),
                animated: false
            )

            #expect(await until { page.surface.view.frame.minY == 180 }, "at \(page.surface.view.frame.minY)")
            let scrollY = try await page.script("window.scrollY") as? Double
            #expect(scrollY == 120, "the page and the shell disagree on the scroll")
        }

        @Test("a frame in a scrolling element follows that element's own scroll view")
        func followsAScrollingElement() async throws {
            let page = Page()
            defer { page.close() }
            try await page.load("""
                <div style='height:80px'></div>
                <div id=s style='height:400px;overflow:auto'><div style='height:3000px'></div></div>
                """)
            let box = try #require(try await page.script("""
                (() => { const r = document.getElementById('s').getBoundingClientRect();
                         return [r.x, r.y, r.width, r.height]; })()
                """) as? [Double])
            let scroller = CGRect(x: box[0], y: box[1], width: box[2], height: box[3])
            page.surface.showsVideo(true)
            page.surface.place(SurfaceGeometry(
                left: 0, width: 390, height: 219, anchor: .scroller(scroller), top: 200, stick: nil
            ))
            #expect(await until { !page.surface.view.isHidden && page.surface.view.frame.minY == 280 })

            _ = try await page.script("document.getElementById('s').scrollTop = 150")

            #expect(await until { page.surface.view.frame.minY == 130 }, "at \(page.surface.view.frame.minY)")
        }

        @Test("a scrolling element laid out after its frame was placed is still found")
        func lateScrollerIsFound() async throws {
            let page = Page()
            defer { page.close() }
            try await page.load("<div style='height:80px'></div><div id=slot></div>")
            page.surface.showsVideo(true)
            page.surface.place(SurfaceGeometry(
                left: 0, width: 390, height: 219,
                anchor: .scroller(CGRect(x: 0, y: 80, width: 390, height: 400)), top: 200, stick: nil
            ))
            #expect(page.surface.view.isHidden)

            _ = try await page.script("""
                document.getElementById('slot').innerHTML =
                  "<div style='height:400px;overflow:auto'><div style='height:3000px'></div></div>"
                """)

            #expect(await until { !page.surface.view.isHidden && page.surface.view.frame.minY == 280 })
        }

        @Test("a frame in a scrolling element that cannot be found is not shown")
        func unknownScrollerHides() async throws {
            let page = Page()
            defer { page.close() }
            try await page.load("<div style='height:3000px'></div>")
            page.surface.showsVideo(true)
            page.surface.place(SurfaceGeometry(
                left: 0, width: 390, height: 219,
                anchor: .scroller(CGRect(x: 3, y: 7, width: 11, height: 13)), top: 0, stick: nil
            ))

            #expect(page.surface.view.isHidden)
        }

        @Test("leaving the screen lets go of the video so the sound goes on, and coming back takes it again")
        func backgroundDetaches() async throws {
            let page = Page()
            defer { page.close() }
            page.surface.showsVideo(true)

            NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
            #expect(page.surface.view.playerLayer.player == nil)

            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            #expect(page.surface.view.playerLayer.player === page.player)
        }

        @Test("picture in picture is never offered for audio or nothing")
        func noPictureInPictureWithoutVideo() {
            let page = Page()
            defer { page.close() }
            #expect(!page.surface.isPictureInPicturePossible)
            page.surface.setPictureInPicture(true)
            #expect(!page.surface.isPictureInPictureActive)
        }
    }
}
