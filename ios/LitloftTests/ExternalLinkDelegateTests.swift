import Foundation
import Testing
import WebKit

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000/")!

private final class FakeOpener: URLOpener {
    nonisolated(unsafe) var opened: [URL] = []

    func open(_ url: URL) {
        opened.append(url)
    }
}

private final class SpyWebView: WKWebView {
    nonisolated(unsafe) var loaded: [URL] = []

    override func load(_ request: URLRequest) -> WKNavigation? {
        request.url.map { loaded.append($0) }
        return nil
    }
}

@MainActor
private struct Rig {
    let opener = FakeOpener()
    let webView = SpyWebView(frame: .zero)
    let coordinator: WebView.Coordinator

    init() {
        let opener = opener
        coordinator = WebView.Coordinator(model: WebViewModel(serverURL: server), opener: opener)
    }

    func newWindow(_ address: String) {
        coordinator.openInNewWindow(URLRequest(url: URL(string: address)!), in: webView)
    }

    func navigate(_ address: String, inMainFrame: Bool = true, pageOnScreen: Bool = true) -> WKNavigationActionPolicy {
        coordinator.policy(for: URL(string: address)!, inMainFrame: inMainFrame, pageOnScreen: pageOnScreen)
    }

    func answer(
        _ disposition: String?,
        isForMainFrame: Bool = true,
        pageOnScreen: Bool = true
    ) -> WKNavigationResponsePolicy {
        let response = HTTPURLResponse(
            url: URL(string: "http://litloft.local:3000/api/files/abc/download")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: disposition.map { ["Content-Disposition": $0] }
        )!
        return coordinator.policy(for: response, isForMainFrame: isForMainFrame, pageOnScreen: pageOnScreen)
    }

    var state: WebViewModel.State { coordinator.model.state }
}

@MainActor
@Suite
struct ExternalLinkDelegateTests {
    @Test("a link to another site is handed over, and nothing is read in the app")
    func newWindowToAnotherSite() {
        let rig = Rig()

        rig.newWindow("https://example.com/article")

        #expect(rig.opener.opened == [URL(string: "https://example.com/article")!])
        #expect(rig.webView.loaded.isEmpty)
    }

    @Test("a window for one of the server's own addresses is read where the viewer is")
    func newWindowToTheServer() {
        let rig = Rig()

        rig.newWindow("http://litloft.local:3000/api/files/abc/download")

        #expect(rig.webView.loaded == [URL(string: "http://litloft.local:3000/api/files/abc/download")!])
        #expect(rig.opener.opened.isEmpty)
    }

    @Test("a window for a link the page neutralised does nothing at all")
    func newWindowForNothing() {
        let rig = Rig()

        rig.newWindow("javascript:void(0)")

        #expect(rig.webView.loaded.isEmpty)
        #expect(rig.opener.opened.isEmpty)
    }

    @Test("the shell does not go to another site itself; it hands it over")
    func navigationToAnotherSite() {
        let rig = Rig()

        let policy = rig.navigate("https://example.com/article")

        #expect(policy == .cancel)
        #expect(rig.opener.opened == [URL(string: "https://example.com/article")!])
    }

    @Test("the server's own pages are allowed, including the one already showing")
    func navigationToTheServer() {
        let rig = Rig()

        #expect(rig.navigate("http://litloft.local:3000/files/abc") == .allow)
        #expect(rig.navigate(server.absoluteString) == .allow, "a reload of the page showing")
        #expect(rig.opener.opened.isEmpty)
    }

    @Test("a link the page neutralised takes the shell nowhere")
    func navigationToNothing() {
        let rig = Rig()

        #expect(rig.navigate("javascript:void(0)") == .cancel)
        #expect(rig.opener.opened.isEmpty)
        #expect(rig.webView.loaded.isEmpty)

        // Stopped is stopped, whatever the shell stopped it for.
        #expect(rig.navigate("javascript:void(0)", pageOnScreen: false) == .cancel)
        guard case .failed = rig.state else {
            Issue.record("the app was left blank with no way out, got \(rig.state)")
            return
        }
    }

    @Test("a file the server marks as an attachment is taken as a download, and a page is not")
    func attachmentsBecomeDownloads() {
        let rig = Rig()

        #expect(rig.answer("attachment; filename=\"a.mp4\"") == .download)
        #expect(rig.answer(nil) == .allow)
    }

    /// The first thing the shell loads answering with a file is how the app is
    /// left blank: WebKit reports nothing at all, so only the shell's own
    /// decision can say that nothing will be drawn.
    @Test("a file arriving with nothing on screen leaves the viewer a way out")
    func attachmentWithNothingOnScreen() {
        let rig = Rig()

        #expect(rig.answer("attachment; filename=\"a.mp4\"", pageOnScreen: false) == .download)

        guard case .failed = rig.state else {
            Issue.record("the app was left blank with no way out, got \(rig.state)")
            return
        }
    }

    /// A page the shell is told to leave — an address off the origin — reaches
    /// the viewer the same way, and WebKit reports nothing there either.
    @Test("an address handed away with nothing on screen leaves the viewer a way out")
    func handedAwayWithNothingOnScreen() {
        let rig = Rig()

        #expect(rig.navigate("https://example.com/article", pageOnScreen: false) == .cancel)

        guard case .failed = rig.state else {
            Issue.record("the app was left blank with no way out, got \(rig.state)")
            return
        }
    }

    /// The page the viewer is reading is what a stopped load leaves behind, and
    /// the model has to say so: nothing else ends the load it started.
    @Test("a stopped load with a page up settles on the page")
    func stoppedWithAPageUp() {
        let rig = Rig()

        rig.coordinator.model.markLoading()
        #expect(rig.answer("attachment; filename=\"a.mp4\"") == .download)
        #expect(rig.state == .loaded)

        rig.coordinator.model.markLoading()
        #expect(rig.navigate("https://example.com/article") == .cancel)
        #expect(rig.state == .loaded)
    }

    /// A file inside a frame is taken as a download too, but the page it sits
    /// in is still loading and still the viewer's.
    @Test("a file inside a frame does not end the page's own load")
    func frameDownloadLeavesThePageAlone() {
        let rig = Rig()
        rig.coordinator.model.markLoading()

        #expect(rig.answer("attachment; filename=\"a.mp4\"", isForMainFrame: false) == .download)

        #expect(rig.state == .loading)
    }

    /// Everything the viewer is ever told about a failure runs through the load
    /// being in flight, so the page they had must give way to the error when
    /// the next load cannot be fetched at all.
    @Test("a navigation that fails after a page is up still reaches the viewer")
    func failureAfterAPageIsUp() {
        let rig = Rig()
        rig.coordinator.model.markLoaded()

        rig.coordinator.webView(rig.webView, didStartProvisionalNavigation: nil)
        rig.coordinator.webView(
            rig.webView,
            didFailProvisionalNavigation: nil,
            withError: URLError(.cannotConnectToHost)
        )

        guard case .failed = rig.state else {
            Issue.record("the server stopped answering and the viewer was told nothing, got \(rig.state)")
            return
        }
    }

    /// An error arrives for the load in flight, and for no other: one the shell
    /// already accounted for says nothing about what is on screen.
    @Test("a failure is shown while a load is in flight, and ignored after one was stopped")
    func failuresFollowTheLoadInFlight() {
        let interrupted = NSError(domain: "WebKitErrorDomain", code: 102)

        let reports: [(Rig) -> Void] = [
            { $0.coordinator.webView($0.webView, didFailProvisionalNavigation: nil, withError: interrupted) },
            { $0.coordinator.webView($0.webView, didFail: nil, withError: interrupted) }
        ]
        for reportIt in reports {
            let loading = Rig()
            loading.coordinator.model.markLoading()
            reportIt(loading)
            guard case .failed = loading.state else {
                Issue.record("a load in flight failed and nothing was said, got \(loading.state)")
                return
            }
        }

        let stopped = Rig()
        stopped.coordinator.model.markLoading()
        #expect(stopped.answer("attachment; filename=\"a.mp4\"") == .download)
        stopped.coordinator.webView(stopped.webView, didFail: nil, withError: interrupted)
        #expect(stopped.state == .loaded, "the page the file came from was taken away")
    }

    /// The YouTube embed navigates inside its own frame, to a site that is not
    /// the server's.
    @Test("a frame inside the page is left alone")
    func subframesAreLeftAlone() {
        let rig = Rig()

        let policy = rig.navigate("https://www.youtube.com/embed/abc", inMainFrame: false)

        #expect(policy == .allow)
        #expect(rig.opener.opened.isEmpty)
    }
}
