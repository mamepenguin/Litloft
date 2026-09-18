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

    func navigate(_ address: String, inMainFrame: Bool = true) -> WKNavigationActionPolicy {
        coordinator.policy(for: URL(string: address)!, inMainFrame: inMainFrame)
    }
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
    }

    @Test("a file the server marks as an attachment is taken as a download, and a page is not")
    func attachmentsBecomeDownloads() {
        let rig = Rig()
        func response(_ disposition: String?) -> URLResponse {
            HTTPURLResponse(
                url: URL(string: "http://litloft.local:3000/api/files/abc/download")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: disposition.map { ["Content-Disposition": $0] }
            )!
        }

        #expect(rig.coordinator.policy(for: response("attachment; filename=\"a.mp4\"")) == .download)
        #expect(rig.coordinator.policy(for: response(nil)) == .allow)
    }

    /// The load that was fetching the file is stopped to hand it over, and
    /// WebKit reports that as a failure of the page that never moved.
    @Test("the failure of a load turned into a download is not shown")
    func divertedLoadIsNotAFailure() {
        let rig = Rig()
        let interrupted = NSError(domain: "WebKitErrorDomain", code: 102)

        rig.coordinator.divertedToDownload()
        rig.coordinator.loadFailed(interrupted)
        #expect(rig.coordinator.model.state == .loading)

        // The next navigation is a page again, and its failure is the viewer's.
        rig.coordinator.webView(rig.webView, didStartProvisionalNavigation: nil)
        rig.coordinator.loadFailed(interrupted)
        guard case .failed = rig.coordinator.model.state else {
            Issue.record("a load the shell did not divert must still reach the error view")
            return
        }
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
