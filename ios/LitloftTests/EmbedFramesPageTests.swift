import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000/")!
private let provider = EmbedFrames.Provider(scheme: "embedtest", hosts: ["frames.test"])
/// Serves the same documents under a scheme the provider does not name.
private let otherScheme = "embedother"

private let video = try? Data(contentsOf: URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("Fixtures/tiny.mp4"))

/// Serves an embed document whose video reports to the page when it is ready,
/// when it enters fullscreen, and what its playback looked like as it entered.
/// A document served from any host but `frames.test` makes
/// `Array.prototype.includes` agree with anything.
@MainActor
private final class EmbedServer: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let url = task.request.url!
        let source = "data:video/mp4;base64," + (video ?? Data()).base64EncodedString()
        let hostile = url.host() == "frames.test" ? "" : "Array.prototype.includes = () => true;"
        let html = """
            <!doctype html><body>
            <video playsinline muted preload="auto" src="\(source)"></video>
            <script>
            \(hostile)
            const video = document.querySelector("video");
            const tell = (what) => parent.postMessage(what + ":" + location.pathname, "*");
            video.addEventListener("loadedmetadata", () => tell("ready"));
            video.addEventListener("webkitbeginfullscreen", () => {
                tell("fullscreen");
                tell(`playback-${video.paused ? "paused" : "playing"}-${video.currentTime >= 3 ? "kept" : "moved"}`
                    + `-${location.href === document.URL && location.hash === "" ? "home" : "away"}`);
            });
            addEventListener("message", (event) => {
                if (event.data === "play") {
                    video.currentTime = 3;
                    video.play().then(() => tell("playing"));
                }
            });
            tell("handler-" + typeof window.webkit?.messageHandlers?.\(EmbedFrames.handlerName));
            </script>
            """
        let data = Data(html.utf8)
        task.didReceive(URLResponse(
            url: url, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "utf-8"
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
        configuration.setURLSchemeHandler(embeds, forURLScheme: otherScheme)
        bridge = ShellBridge(server: server, embeds: EmbedFrames(provider: provider))
        bridge.install(in: configuration)
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 600), configuration: configuration)
        bridge.attach(to: webView)
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first }
            .first?
            .addSubview(webView)
    }

    /// One frame per video, each with the video's id as its element id.
    func open(_ videoIds: String...) {
        let frames = videoIds
            .map { "<iframe id=\"\($0)\" src=\"\(provider.scheme)://frames.test/embed/\($0)\"></iframe>" }
            .joined()
        webView.loadHTMLString("""
            <!doctype html><body>
            <script>window.events = []; addEventListener("message", (event) => events.push(event.data));</script>
            \(frames)
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

    func tell(_ frame: String, _ message: String) async throws {
        _ = try await run("document.getElementById('\(frame)').contentWindow.postMessage('\(message)', '*'); 0")
    }

    func move(_ frame: String, to address: String) async throws {
        _ = try await run("document.getElementById('\(frame)').src = '\(address)'; 0")
    }

    func askForFullscreen(_ videoId: String) async throws {
        _ = try await run(
            "webkit.messageHandlers.litloft.postMessage({type: 'embed.fullscreen', videoId: '\(videoId)'}); 0"
        )
    }

    func add(_ videoId: String) async throws {
        _ = try await run("""
            const frame = document.createElement("iframe");
            frame.id = "\(videoId)";
            frame.src = "\(provider.scheme)://frames.test/embed/\(videoId)";
            document.body.append(frame);
            0
            """)
    }

    func close() async {
        try? await Task.sleep(for: .milliseconds(800))
        webView.removeFromSuperview()
    }
}

private let first = "M7lc1UVf-VE"
private let second = "dQw4w9WgXcQ"

extension SharedMediaState {
    @MainActor
    @Suite
    struct EmbedFramesPageTests {
        @Test("the page's request puts the embed's video into the system's fullscreen, as it was playing")
        func pageRequestEntersFullscreen() async throws {
            try #require(video != nil)
            let page = Page()
            page.open(first)
            #expect(await page.waitFor("ready:/embed/\(first)"))
            try await page.tell(first, "play")
            #expect(await page.waitFor("playing:/embed/\(first)"))

            try await page.askForFullscreen(first)

            #expect(await page.waitFor("fullscreen:/embed/\(first)"))
            #expect(await page.waitFor("playback-playing-kept-home:/embed/\(first)", seconds: 2))
            await page.close()
        }

        @Test("with two embeds on the page, a request reaches its own video and not the one loaded last")
        func requestReachesItsOwnFrame() async throws {
            try #require(video != nil)
            let page = Page()
            page.open(first)
            #expect(await page.waitFor("ready:/embed/\(first)"))
            try await page.add(second)
            #expect(await page.waitFor("ready:/embed/\(second)"))

            try await page.askForFullscreen(first)

            #expect(await page.waitFor("fullscreen:/embed/\(first)"))
            #expect(!(await page.events.contains("fullscreen:/embed/\(second)")))
            await page.close()
        }

        @Test("a frame that has moved on to another video is not put into fullscreen for the old one")
        func frameMovedToAnotherVideo() async throws {
            try #require(video != nil)
            let page = Page()
            page.open(first)
            #expect(await page.waitFor("ready:/embed/\(first)"))
            try await page.move(first, to: "\(provider.scheme)://frames.test/embed/\(second)")
            #expect(await page.waitFor("ready:/embed/\(second)"))

            try await page.askForFullscreen(first)
            #expect(!(await page.waitFor("fullscreen:/embed/\(second)", seconds: 2)), "acted on a stale frame")

            try await page.askForFullscreen(second)
            #expect(await page.waitFor("fullscreen:/embed/\(second)"))
            await page.close()
        }

        @Test("a frame that has moved to another host or scheme at the same address is left alone", arguments: [
            "\(provider.scheme)://other.test/embed/\(first)",
            "\(otherScheme)://frames.test/embed/\(first)"
        ])
        func frameMovedAway(to address: String) async throws {
            try #require(video != nil)
            let page = Page()
            page.open(first)
            #expect(await page.waitFor("ready:/embed/\(first)"))
            let loads = await page.events.filter { $0 == "ready:/embed/\(first)" }.count
            try await page.move(first, to: address)
            let deadline = Date().addingTimeInterval(10)
            while await page.events.filter({ $0 == "ready:/embed/\(first)" }).count == loads, Date() < deadline {
                try await Task.sleep(for: .milliseconds(100))
            }

            try await page.askForFullscreen(first)

            #expect(!(await page.waitFor("fullscreen:/embed/\(first)", seconds: 2)), "acted on a foreign frame")
            await page.close()
        }

        @Test("neither the embed's own scripts nor the page can reach the shell's embed handler")
        func handlerIsOutOfReach() async throws {
            let page = Page()
            page.open(first)
            #expect(await page.waitFor("handler-undefined:/embed/\(first)"))
            let fromPage = try await page.run("typeof window.webkit?.messageHandlers?.\(EmbedFrames.handlerName)")
            #expect(fromPage as? String == "undefined")
            await page.close()
        }
    }
}
