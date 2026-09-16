import Foundation
import Testing

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000")!

private func origin(
    mainFrame: Bool = true,
    scheme: String = "http",
    host: String = "litloft.local",
    port: Int = 3000
) -> MessageOrigin {
    MessageOrigin(isMainFrame: mainFrame, scheme: scheme, host: host, port: port)
}

struct MessageOriginTests {
    @Test("the server's own main frame is trusted")
    func serverIsTrusted() {
        #expect(origin().isTrusted(for: server))
    }

    /// Whichever convention WebKit uses for a default port, it has to agree
    /// with the URL the shell was pointed at.
    @Test("a default port matches however either side spells it", arguments: [
        ("http", "http://litloft.local", 0, true),
        ("http", "http://litloft.local", 80, true),
        ("http", "http://litloft.local:80", 0, true),
        ("http", "http://litloft.local:80", 80, true),
        ("https", "https://litloft.local", 0, true),
        ("https", "https://litloft.local", 443, true),
        ("https", "https://litloft.local:443", 443, true),
        ("http", "http://litloft.local", 3000, false),
        ("http", "http://litloft.local:3000", 0, false),
        ("http", "http://litloft.local:3000", 80, false),
        ("https", "https://litloft.local", 80, false)
    ])
    func defaultPorts(scheme: String, url: String, port: Int, expected: Bool) {
        let origin = origin(scheme: scheme, host: "litloft.local", port: port)
        #expect(origin.isTrusted(for: URL(string: url)!) == expected)
    }

    @Test("a stranger is not trusted")
    func strangersAreNotTrusted() {
        #expect(origin(mainFrame: false).isTrusted(for: server) == false)
        #expect(origin(host: "evil.example").isTrusted(for: server) == false)
        #expect(origin(scheme: "https").isTrusted(for: server) == false)
        #expect(origin(port: 3001).isTrusted(for: server) == false)
        #expect(origin(host: "litloft.local.evil.example").isTrusted(for: server) == false)
        #expect(origin(host: "sub.litloft.local").isTrusted(for: server) == false)
    }

    @Test("host and scheme are compared without case")
    func caseIsFolded() {
        #expect(origin(scheme: "HTTP", host: "LITLOFT.local").isTrusted(for: server))
    }
}

struct ShellBridgeTests {
    @Test("a ping is answered with a pong carrying the same seq")
    func pingIsAnswered() throws {
        let action = ShellBridge.route(body: ["type": "ping", "seq": 42], from: origin(), server: server)

        #expect(action == .reply(ShellMessage(type: "pong", seq: 42)))
    }

    @Test("a well-formed ping from anyone but the server is not answered")
    func onlyTheServerIsAnswered() {
        let ping: Any = ["type": "ping", "seq": 42]

        #expect(ShellBridge.route(body: ping, from: origin(), server: server) != nil)
        #expect(ShellBridge.route(body: ping, from: origin(mainFrame: false), server: server) == nil)
        #expect(ShellBridge.route(body: ping, from: origin(host: "evil.example"), server: server) == nil)
    }

    @Test("a body that is not a command is not answered")
    func malformedBodyIsIgnored() {
        let bodies: [Any] = [
            ["type": "ping"],
            ["seq": 1],
            ["type": 1, "seq": 1],
            ["type": "ping", "seq": "42"],
            "ping",
            []
        ]

        for body in bodies {
            #expect(ShellBridge.route(body: body, from: origin(), server: server) == nil)
        }
    }

    @Test("an unknown message type asks for nothing")
    func unknownTypeIsIgnored() {
        for type in ["pong", "media.tick", "seek", ""] {
            #expect(ShellBridge.route(body: ["type": type, "seq": 1], from: origin(), server: server) == nil)
        }
    }

    @Test("a transport command carries its sequence through")
    func transportCommands() {
        let cases: [(String, MediaCommand)] = [
            ("media.play", .play),
            ("media.pause", .pause),
            ("media.unload", .unload)
        ]
        for (type, expected) in cases {
            #expect(ShellBridge.route(body: ["type": type, "seq": 9], from: origin(), server: server)
                == .media(expected, seq: 9))
        }
    }

    @Test("a load carries everything the lock screen needs")
    func loadCarriesMetadata() {
        let body: [String: Any] = [
            "type": "media.load",
            "seq": 3,
            "url": "http://litloft.local:3000/api/files/abc/stream",
            "title": "A recording",
            "artist": "Someone",
            "artworkUrl": "http://litloft.local:3000/api/files/abc/thumbnail"
        ]

        #expect(ShellBridge.route(body: body, from: origin(), server: server) == .media(.load(MediaSource(
            url: URL(string: "http://litloft.local:3000/api/files/abc/stream")!,
            title: "A recording",
            artist: "Someone",
            artworkURL: URL(string: "http://litloft.local:3000/api/files/abc/thumbnail")!,
        )), seq: 3))
    }

    /// The session's cookies go with what is loaded; see invariant 12.
    @Test("a file from anywhere but the server is not loaded")
    func foreignFileIsRefused() {
        for url in [
            "http://evil.example/stream",
            "https://litloft.local:3000/api/files/abc/stream",
            "http://litloft.local:3001/api/files/abc/stream",
            "http://litloft.local.evil.example:3000/stream",
            "file:///etc/hosts"
        ] {
            let body: [String: Any] = ["type": "media.load", "seq": 1, "url": url, "title": "t"]
            #expect(ShellBridge.route(body: body, from: origin(), server: server) == nil, "accepted \(url)")
        }
    }

    @Test("artwork from anywhere but the server is dropped, and the file still loads")
    func foreignArtworkIsDropped() {
        let body: [String: Any] = [
            "type": "media.load", "seq": 1,
            "url": "http://litloft.local:3000/api/files/abc/stream",
            "title": "t",
            "artworkUrl": "http://evil.example/steal"
        ]

        guard case .media(.load(let source), _)? =
            ShellBridge.route(body: body, from: origin(), server: server) else {
            Issue.record("the file itself should still load")
            return
        }
        #expect(source.artworkURL == nil)
    }

    @Test("a load without a url or a title is not a command")
    func loadNeedsUrlAndTitle() {
        let bodies: [[String: Any]] = [
            ["type": "media.load", "seq": 1, "title": "t"],
            ["type": "media.load", "seq": 1, "url": "http://litloft.local:3000/x"],
            ["type": "media.load", "seq": 1, "url": 5, "title": "t"]
        ]
        for body in bodies {
            #expect(ShellBridge.route(body: body, from: origin(), server: server) == nil)
        }
    }

    @Test("a position the player cannot use is not a command")
    func unusableNumbersAreRejected() {
        let rejected: [[String: Any]] = [
            ["type": "media.seek", "seq": 1, "time": Double.nan],
            ["type": "media.seek", "seq": 1, "time": Double.infinity],
            ["type": "media.seek", "seq": 1],
            ["type": "media.setRate", "seq": 1, "rate": 0.0],
            ["type": "media.setRate", "seq": 1, "rate": -1.0],
            ["type": "media.setVolume", "seq": 1, "volume": Double.nan]
        ]
        for body in rejected {
            #expect(ShellBridge.route(body: body, from: origin(), server: server) == nil)
        }
    }

    @Test("a volume outside the scale is brought back onto it")
    func volumeIsClamped() {
        #expect(ShellBridge.route(body: ["type": "media.setVolume", "seq": 1, "volume": 4.0],
                                  from: origin(), server: server) == .media(.setVolume(1), seq: 1))
        #expect(ShellBridge.route(body: ["type": "media.setVolume", "seq": 1, "volume": -2.0],
                                  from: origin(), server: server) == .media(.setVolume(0), seq: 1))
    }

}

@MainActor
struct WebViewModelTests {
    private func model() -> WebViewModel {
        WebViewModel(serverURL: URL(string: "http://litloft.local:3000")!)
    }

    @Test("an unreachable server raises the retry screen")
    func unreachableShowsError() {
        let model = model()
        model.markFailed(URLError(.cannotConnectToHost))

        guard case .failed(let message) = model.state else {
            Issue.record("expected the error state, got \(model.state)")
            return
        }
        #expect(message.contains("litloft.local"))
    }

    @Test("a cancelled load leaves the state alone")
    func cancelledIsNotAFailure() {
        let model = model()
        model.markLoading()
        model.markFailed(URLError(.cancelled))

        #expect(model.state == .loading)
    }

    @Test("a cancelled load does not erase an error already on screen")
    func cancelledDoesNotClearAnError() {
        let model = model()
        model.markFailed(URLError(.timedOut))
        model.markFailed(URLError(.cancelled))

        guard case .failed = model.state else {
            Issue.record("expected the error state to survive, got \(model.state)")
            return
        }
    }

    @Test("another domain's -999 is not a cancellation")
    func foreignDomainIsNotCancelled() {
        let model = model()
        model.markLoading()
        model.markFailed(NSError(domain: "WKErrorDomain", code: -999))

        guard case .failed = model.state else {
            Issue.record("a -999 outside NSURLErrorDomain must still reach the error view")
            return
        }
    }

    @Test("an error outside NSURLErrorDomain keeps its own description")
    func foreignDomainKeepsItsMessage() {
        let model = model()
        model.markFailed(NSError(
            domain: "WKErrorDomain",
            code: 102,
            userInfo: [NSLocalizedDescriptionKey: "Frame load interrupted"]
        ))

        guard case .failed(let message) = model.state else {
            Issue.record("expected the error state")
            return
        }
        #expect(message == "Frame load interrupted")
    }

    @Test("retry puts it back into loading")
    func retryReloads() {
        let model = model()
        model.markFailed(URLError(.timedOut))
        let before = model.reloadToken

        model.retry()

        #expect(model.state == .loading)
        #expect(model.reloadToken == before + 1)
    }
}
