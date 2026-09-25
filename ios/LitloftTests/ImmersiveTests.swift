import Foundation
import SwiftUI
import Testing
import UIKit
import WebKit

@testable import Litloft

private let page = """
    <!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <body style="margin:0">
    <script>
    window.got = [];
    window.__litloft = { receive(message) { got.push(message); } };
    </script>
    """

@MainActor
@Suite(.serialized)
struct ImmersiveTests {
    private let server = URL(string: "http://litloft.local:3000/")!

    private func coordinator() -> (Litloft.WebView.Coordinator, WebViewModel, WKWebView) {
        let model = WebViewModel(serverURL: server)
        let coordinator = Litloft.WebView.Coordinator(model: model)
        coordinator.isActive = { false }
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        coordinator.attachBridge(to: webView)
        coordinator.watch(webView)
        return (coordinator, model, webView)
    }

    @Test("a page replaced by another leaves the shell not immersive")
    func commitEndsImmersive() {
        let (coordinator, model, webView) = coordinator()
        model.setImmersive(true)

        coordinator.webView(webView, didCommit: nil)

        #expect(model.immersive == false)
    }

    @Test("a page whose process died leaves the shell not immersive")
    func terminationEndsImmersive() {
        let (coordinator, model, webView) = coordinator()
        model.setImmersive(true)

        coordinator.webViewWebContentProcessDidTerminate(webView)

        #expect(model.immersive == false)
    }

    /// A download starts a navigation that never commits, and the viewer it was
    /// asked from is still open.
    @Test("a navigation that becomes a download keeps the shell immersive")
    func downloadKeepsImmersive() {
        let (coordinator, model, webView) = coordinator()
        model.setImmersive(true)
        let attachment = HTTPURLResponse(
            url: URL(string: "http://litloft.local:3000/api/files/abc/download")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Disposition": "attachment; filename=\"a.zip\""]
        )!

        coordinator.webView(webView, didStartProvisionalNavigation: nil)
        _ = coordinator.policy(for: attachment, isForMainFrame: true, pageOnScreen: true)
        coordinator.webView(
            webView,
            didFailProvisionalNavigation: nil,
            withError: NSError(domain: "WebKitErrorDomain", code: 102)
        )

        #expect(model.immersive)
    }

    // MARK: the shell on screen

    private struct Hosted {
        let window: UIWindow
        let previousRoot: UIViewController?
        let model: WebViewModel
        let webView: WKWebView
        let stub: StubServer

        func restore() {
            window.rootViewController = previousRoot
            stub.stop()
        }
    }

    private func host() async throws -> Hosted {
        let stub = try StubServer(.page(html: page))
        let url = try await stub.start()
        let windows = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first }
        let window = try #require(windows.first)
        let previousRoot = window.rootViewController
        let model = WebViewModel(serverURL: url)
        window.rootViewController = UIHostingController(rootView: WebShell(model: model) {})
        window.makeKeyAndVisible()

        #expect(await waitUntil { model.state == .loaded })
        let webView = try #require(webViews(in: window).first)
        #expect(await waitUntil {
            (try? await webView.evaluateJavaScript("typeof window.got")) as? String == "object"
        })
        return Hosted(window: window, previousRoot: previousRoot, model: model, webView: webView, stub: stub)
    }

    private func webViews(in view: UIView) -> [WKWebView] {
        (view as? WKWebView).map { [$0] } ?? view.subviews.flatMap(webViews(in:))
    }

    private func ask(_ active: Bool, of webView: WKWebView) async throws {
        _ = try await webView.evaluateJavaScript(
            "webkit.messageHandlers.litloft.postMessage({type: 'page.immersive', active: \(active)}); 0"
        )
    }

    private func acknowledgements(in webView: WKWebView) async -> [[String: Any]] {
        let json = try? await webView.evaluateJavaScript(
            "JSON.stringify(got.filter((m) => m.type === 'page.immersive.applied'))"
        ) as? String
        let data = Data((json ?? "[]").utf8)
        return (try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]) ?? []
    }

    /// Waits for `count` answers, lays the web view out again and waits long
    /// enough for a stray extra one, so a shell that answers more often than
    /// asked fails.
    private func acknowledged(_ count: Int, in webView: WKWebView) async -> [String: Any]? {
        guard await waitUntil({ await acknowledgements(in: webView).count >= count }) else { return nil }
        webView.setNeedsLayout()
        webView.layoutIfNeeded()
        try? await Task.sleep(for: .milliseconds(500))
        let all = await acknowledgements(in: webView)
        #expect(all.count == count)
        return all.last
    }

    private func post(_ actives: [Bool], to webView: WKWebView) async throws {
        let posts = actives
            .map { "webkit.messageHandlers.litloft.postMessage({type: 'page.immersive', active: \($0)});" }
            .joined()
        _ = try await webView.evaluateJavaScript(posts + " 0")
    }

    @Test("going immersive hides the status bar and reaches the top edge, and going back undoes both")
    func immersiveRoundTrip() async throws {
        let hosted = try await host()
        defer { hosted.restore() }
        let (window, webView) = (hosted.window, hosted.webView)
        let statusBar = try #require(window.windowScene?.statusBarManager)
        try #require(window.safeAreaInsets.top > 0)
        _ = try await webView.evaluateJavaScript("window.kept = 'yes'; 0")

        try await ask(true, of: webView)
        let wide = try #require(await acknowledged(1, in: webView))
        #expect(wide["active"] as? Bool == true)
        #expect(webView.convert(webView.bounds, to: window).minY == 0)
        #expect(wide["width"] as? Double == Double(webView.bounds.width))
        #expect(wide["height"] as? Double == Double(webView.bounds.height))
        #expect(await waitUntil { statusBar.isStatusBarHidden })
        #expect(await waitUntil {
            (try? await webView.evaluateJavaScript("document.documentElement.clientHeight")) as? Double
                == wide["height"] as? Double
        })

        try await ask(false, of: webView)
        let narrow = try #require(await acknowledged(2, in: webView))
        #expect(narrow["active"] as? Bool == false)
        #expect(webView.convert(webView.bounds, to: window).minY == window.safeAreaInsets.top)
        #expect(narrow["height"] as? Double == Double(webView.bounds.height))
        #expect(await waitUntil { !statusBar.isStatusBarHidden })

        #expect(webViews(in: window).count == 1)
        #expect(webViews(in: window).first === webView)
        #expect(try await webView.evaluateJavaScript("window.kept") as? String == "yes")
    }

    @Test("two requests before a layout are answered once, for the last, at its laid-out size")
    func requestsBeforeALayout() async throws {
        let hosted = try await host()
        defer { hosted.restore() }
        let webView = hosted.webView
        let narrowHeight = Double(webView.bounds.height)

        try await post([true, false], to: webView)
        let settledNarrow = try #require(await acknowledged(1, in: webView))
        #expect(settledNarrow["active"] as? Bool == false)
        #expect(settledNarrow["height"] as? Double == narrowHeight)

        try await post([true, true], to: webView)
        let settledWide = try #require(await acknowledged(2, in: webView))
        #expect(settledWide["active"] as? Bool == true)
        #expect(settledWide["height"] as? Double == Double(hosted.window.bounds.height))
    }

    /// The status bar is already gone in landscape: the web view keeps its
    /// width, stays clear of the sensor housing, and the request is still answered.
    @Test("in landscape going immersive moves nothing sideways and is still answered")
    func landscape() async throws {
        let hosted = try await host()
        let (window, webView) = (hosted.window, hosted.webView)
        let scene = try #require(window.windowScene)
        defer {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
            hosted.restore()
        }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
        #expect(await waitUntil { scene.interfaceOrientation.isLandscape && window.safeAreaInsets.left + window.safeAreaInsets.right > 0 })
        #expect(await waitUntil { webView.bounds.width < window.bounds.width })
        let before = webView.convert(webView.bounds, to: window)

        try await ask(true, of: webView)
        let wide = try #require(await acknowledged(1, in: webView))
        let during = webView.convert(webView.bounds, to: window)
        #expect(during.minX == before.minX)
        #expect(during.width == before.width)
        #expect(wide["width"] as? Double == Double(during.width))
        #expect(wide["height"] as? Double == Double(during.height))

        try await ask(false, of: webView)
        let narrow = try #require(await acknowledged(2, in: webView))
        #expect(narrow["active"] as? Bool == false)
        #expect(webView.convert(webView.bounds, to: window) == before)
    }

    @Test("moving between the app's own pages keeps the shell immersive")
    func spaNavigationKeepsImmersive() async throws {
        let hosted = try await host()
        defer { hosted.restore() }
        let webView = hosted.webView
        try await ask(true, of: webView)
        _ = try #require(await acknowledged(1, in: webView))
        let before = webView.url

        _ = try await webView.evaluateJavaScript("history.pushState({}, '', '/drive/a/file'); 0")
        #expect(await waitUntil { webView.url != before })
        try? await Task.sleep(for: .milliseconds(300))

        #expect(hosted.model.immersive)
        #expect(webView.convert(webView.bounds, to: hosted.window).minY == 0)
    }

    @Test("asking for what already holds is still answered")
    func repeatedAskIsAnswered() async throws {
        let hosted = try await host()
        defer { hosted.restore() }
        let webView = hosted.webView

        try await ask(false, of: webView)
        let answer = try #require(await acknowledged(1, in: webView))

        #expect(answer["active"] as? Bool == false)
        #expect(answer["height"] as? Double == Double(webView.bounds.height))
    }

    private func waitUntil(timeout: Duration = .seconds(10), _ condition: () async -> Bool) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while !(await condition()) {
            if ContinuousClock.now > deadline { return false }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return true
    }
}
