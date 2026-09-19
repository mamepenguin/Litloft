import Foundation
import Testing
import WebKit

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000")!

private func videoId(
    main: Bool = false,
    scheme: String = "https",
    host: String = "www.youtube.com",
    url: String? = "https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&origin=http%3A%2F%2Flitloft.local%3A3000"
) -> String? {
    EmbedFrames.videoId(isMainFrame: main, scheme: scheme, host: host, url: url.flatMap(URL.init(string:)))
}

struct EmbedFramesTests {
    @Test("a YouTube embed frame is known by the video it embeds")
    func embedFrameIsRecognised() {
        #expect(videoId() == "dQw4w9WgXcQ")
        #expect(videoId(
            host: "www.youtube-nocookie.com",
            url: "https://www.youtube-nocookie.com/embed/a-b_c1D2e3F"
        ) == "a-b_c1D2e3F")
    }

    @Test("host and scheme are compared without case")
    func caseIsFolded() {
        #expect(videoId(scheme: "HTTPS", host: "WWW.YouTube.com") == "dQw4w9WgXcQ")
    }

    @Test("anything but a YouTube embed frame is not recorded", arguments: [
        (false, "https", "www.youtube.com", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        (false, "https", "www.youtube.com", "https://www.youtube.com/embed/dQw4w9WgXcQ/extra"),
        (false, "https", "www.youtube.com", "https://www.youtube.com/embed/tooShort"),
        (false, "https", "www.youtube.com", "https://www.youtube.com/embed/dQw4w9WgX%3C"),
        (false, "https", "www.youtube.com", "https://www.youtube.com/v/dQw4w9WgXcQ"),
        (false, "http", "www.youtube.com", "https://www.youtube.com/embed/dQw4w9WgXcQ"),
        (false, "https", "www.youtube.com", "http://www.youtube.com/embed/dQw4w9WgXcQ"),
        (false, "https", "evil.example", "https://www.youtube.com/embed/dQw4w9WgXcQ"),
        (false, "https", "www.youtube.com", "https://evil.example/embed/dQw4w9WgXcQ"),
        (false, "https", "youtube.com.evil.example", "https://youtube.com.evil.example/embed/dQw4w9WgXcQ"),
        (true, "https", "www.youtube.com", "https://www.youtube.com/embed/dQw4w9WgXcQ")
    ])
    func othersAreIgnored(main: Bool, scheme: String, host: String, url: String) {
        #expect(videoId(main: main, scheme: scheme, host: host, url: url) == nil)
    }

    @Test("a video id is exactly eleven of YouTube's own characters", arguments: [
        ("dQw4w9WgXcQ", true),
        ("a-b_c1D2e3F", true),
        ("dQw4w9WgXcQQ", false),
        ("dQw4w9WgXc", false),
        ("dQw4w9WgX.Q", false),
        ("dQw4w9WgX Q", false),
        ("dQw4w9WgXcé", false),
        ("dQw4w9WgXc٣", false)
    ])
    func videoIdShape(value: String, valid: Bool) {
        #expect(EmbedFrames.isVideoId(value) == valid)
    }

    @Test("a frame with no address is not recorded")
    func noAddress() {
        #expect(videoId(url: nil) == nil)
    }

    @Test("the page asks for an embed's fullscreen by video")
    func pageAsksByVideo() {
        let trusted = MessageOrigin(isMainFrame: true, scheme: "http", host: "litloft.local", port: 3000)
        let body: [String: Any] = ["type": "embed.fullscreen", "videoId": "dQw4w9WgXcQ"]
        let action = ShellBridge.route(body: body, from: trusted, server: server)
        #expect(action == .embedFullscreen(videoId: "dQw4w9WgXcQ"))
    }

    @Test("an embed's fullscreen asked for by anyone but the server does nothing", arguments: [
        MessageOrigin(isMainFrame: false, scheme: "https", host: "www.youtube.com", port: 0),
        MessageOrigin(isMainFrame: false, scheme: "http", host: "litloft.local", port: 3000),
        MessageOrigin(isMainFrame: true, scheme: "https", host: "www.youtube.com", port: 0)
    ])
    func onlyTheServerAsks(origin: MessageOrigin) {
        let body: [String: Any] = ["type": "embed.fullscreen", "videoId": "dQw4w9WgXcQ"]
        #expect(ShellBridge.route(body: body, from: origin, server: server) == nil)
    }

    @Test("an embed's fullscreen for something that is not a video id does nothing")
    func malformedVideoIsIgnored() {
        let trusted = MessageOrigin(isMainFrame: true, scheme: "http", host: "litloft.local", port: 3000)
        let bodies: [[String: Any]] = [
            ["type": "embed.fullscreen"],
            ["type": "embed.fullscreen", "videoId": ""],
            ["type": "embed.fullscreen", "videoId": 42],
            ["type": "embed.fullscreen", "videoId": "dQw4w9WgXcQ\"); alert(1); (\""],
            ["type": "embed.fullscreen", "videoId": "dQw4w9WgXc"]
        ]
        for body in bodies {
            #expect(ShellBridge.route(body: body, from: trusted, server: server) == nil)
        }
    }

    @MainActor
    @Test("the shell's embeds are YouTube's")
    func shellWatchesYouTube() {
        #expect(ShellBridge(server: server).embeds.provider == EmbedFrames.Provider(
            scheme: "https", hosts: ["www.youtube.com", "www.youtube-nocookie.com"]
        ))
    }

    @MainActor
    @Test("the embed script runs in every frame, not only the page")
    func scriptRunsInEveryFrame() throws {
        let configuration = WKWebViewConfiguration()
        ShellBridge(server: server).install(in: configuration)
        let script = try #require(configuration.userContentController.userScripts.first {
            $0.source.contains(EmbedFrames.handlerName)
        })
        #expect(!script.isForMainFrameOnly)
    }
}
