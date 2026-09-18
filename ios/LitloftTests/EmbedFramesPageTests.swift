import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000/")!
private let provider = EmbedFrames.Provider(scheme: "embedtest", hosts: ["frames.test"])

private let video = try? Data(contentsOf: URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("Fixtures/tiny.mp4"))

/// Serves an embed document whose video reports to the page when it is ready
/// and when it enters fullscreen, and leaves fullscreen when the page asks.
@MainActor
private final class EmbedServer: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let source = "data:video/mp4;base64," + (video ?? Data()).base64EncodedString()
        let html = """
            <!doctype html><body>
            <video playsinline muted preload="auto" src="\(source)"></video>
            <script>
            const video = document.querySelector("video");
            const tell = (what) => parent.postMessage(what + ":" + location.pathname, "*");
            video.addEventListener("loadedmetadata", () => tell("ready"));
            video.addEventListener("webkitbeginfullscreen", () => tell("fullscreen"));
            addEventListener("message", (event) => { if (event.data === "exit") video.webkitExitFullscreen(); });
            tell("handler-" + typeof window.webkit?.messageHandlers?.\(EmbedFrames.handlerName));
            </script>
            """
        let data = Data(html.utf8)
        task.didReceive(URLResponse(
            url: task.request.url!, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "utf-8"
        ))
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

@MainActor
private final class Page {
    let webView: WKWebView
    let bridge: ShellBridge
    private let embeds = EmbedServer()

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.setURLSchemeHandler(embeds, forURLScheme: provider.scheme)
        bridge = ShellBridge(server: server, embeds: EmbedFrames(provider: provider))
        bridge.install(in: configuration)
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 600), configuration: configuration)
        bridge.attach(to: webView)
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first }
            .first?
            .addSubview(webView)
    }

    func open(_ videoId: String) {
        webView.loadHTMLString("""
            <!doctype html><body>
            <script>window.events = []; addEventListener("message", (event) => events.push(event.data));</script>
            <iframe id="embed" src="\(provider.scheme)://frames.test/embed/\(videoId)"></iframe>
            """, baseURL: server)
    }

    func run(_ script: String) async throws -> Any? {
        try await webView.evaluateJavaScript(script)
    }

    var events: [String] {
        get async { (try? await run("window.events ?? []")) as? [String] ?? [] }
    }

    func waitFor(_ event: String, seconds: Double = 10) async -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if await events.contains(event) { return true }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return false
    }

    func askForFullscreen(_ videoId: String) async throws {
        _ = try await run(
            "webkit.messageHandlers.litloft.postMessage({type: 'embed.fullscreen', videoId: '\(videoId)'}); 0"
        )
    }

    func close() async {
        _ = try? await run("document.getElementById('embed').contentWindow.postMessage('exit', '*'); 0")
        try? await Task.sleep(for: .milliseconds(800))
        webView.removeFromSuperview()
    }
}

extension SharedMediaState {
    @MainActor
    @Suite
    struct EmbedFramesPageTests {
        @Test("the page's request puts the embed's video into the system's fullscreen")
        func pageRequestEntersFullscreen() async throws {
            try #require(video != nil)
            let page = Page()
            page.open("AAAAAAAAAAA")
            #expect(await page.waitFor("ready:/embed/AAAAAAAAAAA"))

            try await page.askForFullscreen("AAAAAAAAAAA")

            #expect(await page.waitFor("fullscreen:/embed/AAAAAAAAAAA"))
            await page.close()
        }

        @Test("a frame that has moved on to another video is not put into fullscreen for the old one")
        func movedFrameIsLeftAlone() async throws {
            try #require(video != nil)
            let page = Page()
            page.open("AAAAAAAAAAA")
            #expect(await page.waitFor("ready:/embed/AAAAAAAAAAA"))
            _ = try await page.run(
                "document.getElementById('embed').src = '\(provider.scheme)://frames.test/embed/BBBBBBBBBBB'; 0"
            )
            #expect(await page.waitFor("ready:/embed/BBBBBBBBBBB"))

            try await page.askForFullscreen("AAAAAAAAAAA")
            #expect(!(await page.waitFor("fullscreen:/embed/BBBBBBBBBBB", seconds: 2)), "acted on a stale frame")

            try await page.askForFullscreen("BBBBBBBBBBB")
            #expect(await page.waitFor("fullscreen:/embed/BBBBBBBBBBB"))
            await page.close()
        }

        @Test("neither the embed's own scripts nor the page can reach the shell's embed handler")
        func handlerIsOutOfReach() async throws {
            let page = Page()
            page.open("AAAAAAAAAAA")
            #expect(await page.waitFor("handler-undefined:/embed/AAAAAAAAAAA"))
            let fromPage = try await page.run("typeof window.webkit?.messageHandlers?.\(EmbedFrames.handlerName)")
            #expect(fromPage as? String == "undefined")
            await page.close()
        }
    }
}
