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
    private func route(_ body: Any, from sender: MessageOrigin = origin()) -> ShellAction? {
        ShellBridge.route(body: body, from: sender, server: server)
    }

    @Test("a ping is answered with a pong carrying the same seq")
    func pingIsAnswered() {
        #expect(route(["type": "ping", "seq": 42]) == .reply(ShellMessage(type: "pong", seq: 42)))
    }

    @Test("a well-formed ping from anyone but the server is not answered")
    func onlyTheServerIsAnswered() {
        let ping: Any = ["type": "ping", "seq": 42]

        #expect(route(ping) != nil)
        #expect(route(ping, from: origin(mainFrame: false)) == nil)
        #expect(route(ping, from: origin(host: "evil.example")) == nil)
    }

    @Test("a command from anyone but the server does nothing")
    func onlyTheServerIsObeyed() {
        let play: Any = ["type": "media.play", "loadId": "load-1"]

        #expect(route(play) != nil)
        #expect(route(play, from: origin(mainFrame: false)) == nil)
        #expect(route(play, from: origin(host: "evil.example")) == nil)
    }

    @Test("a body that is not a message asks for nothing")
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
            #expect(route(body) == nil)
        }
    }

    @Test("an unknown message type asks for nothing")
    func unknownTypeIsIgnored() {
        for type in ["pong", "media.state", "media.tick", "seek", ""] {
            #expect(route(["type": type, "loadId": "load-1", "seq": 1]) == nil)
        }
    }

    /// Without the id the shell cannot tell which file a command is for.
    @Test("a command about a file that does not name one does nothing", arguments: [
        "media.load", "media.play", "media.pause", "media.seek", "media.unload", "media.surface", "media.pip"
    ])
    func fileCommandsNeedALoadId(type: String) {
        let base: [String: Any] = [
            "type": type,
            "url": "http://litloft.local:3000/api/files/abc/stream",
            "title": "t",
            "kind": "audio",
            "seekId": "seek-1",
            "time": 1.0,
            "geometry": NSNull(),
            "active": true
        ]
        #expect(route(base) == nil)

        var empty = base
        empty["loadId"] = ""
        #expect(route(empty) == nil)

        var wrongKind = base
        wrongKind["loadId"] = 7
        #expect(route(wrongKind) == nil)
    }

    @Test("a seek that does not name itself does nothing")
    func seekNeedsASeekId() {
        #expect(route(["type": "media.seek", "loadId": "load-1", "time": 1.0]) == nil)
        #expect(route(["type": "media.seek", "loadId": "load-1", "seekId": "", "time": 1.0]) == nil)
    }

    @Test("a player-wide setting needs no file")
    func settingsNeedNoLoadId() {
        #expect(route(["type": "media.setRate", "rate": 1.25]) == .media(.setRate(1.25), loadId: nil))
        #expect(route(["type": "media.setVolume", "volume": 0.5]) == .media(.setVolume(0.5), loadId: nil))
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
            let body: [String: Any] = [
                "type": "media.load", "loadId": "load-1", "kind": "audio", "url": url, "title": "t"
            ]
            #expect(route(body) == nil, "accepted \(url)")
        }
    }

    @Test("artwork from anywhere but the server is dropped, and the file still loads")
    func foreignArtworkIsDropped() {
        let body: [String: Any] = [
            "type": "media.load", "loadId": "load-1", "kind": "audio",
            "url": "http://litloft.local:3000/api/files/abc/stream",
            "title": "t",
            "artworkUrl": "http://evil.example/steal"
        ]

        guard case .media(.load(let source), "load-1")? = route(body) else {
            Issue.record("the file itself should still load")
            return
        }
        #expect(source.artworkURL == nil)
    }

    @Test("a load without a url or a title does nothing")
    func loadNeedsUrlAndTitle() {
        let bodies: [[String: Any]] = [
            ["type": "media.load", "loadId": "load-1", "kind": "audio", "title": "t"],
            ["type": "media.load", "loadId": "load-1", "kind": "audio", "url": "http://litloft.local:3000/x"],
            ["type": "media.load", "loadId": "load-1", "kind": "audio", "url": 5, "title": "t"]
        ]
        for body in bodies {
            #expect(route(body) == nil)
        }
    }

    @Test("a number the player cannot use does nothing")
    func unusableNumbersAreRejected() {
        let rejected: [[String: Any]] = [
            ["type": "media.seek", "loadId": "load-1", "seekId": "s", "time": Double.nan],
            ["type": "media.seek", "loadId": "load-1", "seekId": "s", "time": Double.infinity],
            ["type": "media.seek", "loadId": "load-1", "seekId": "s"],
            ["type": "media.setRate", "rate": 0.0],
            ["type": "media.setRate", "rate": -1.0],
            ["type": "media.setVolume", "volume": Double.nan]
        ]
        for body in rejected {
            #expect(route(body) == nil)
        }
    }

    @Test("a volume outside the scale is brought back onto it")
    func volumeIsClamped() {
        #expect(route(["type": "media.setVolume", "volume": 4.0]) == .media(.setVolume(1), loadId: nil))
        #expect(route(["type": "media.setVolume", "volume": -2.0]) == .media(.setVolume(0), loadId: nil))
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

    /// The shell stops a load itself when it takes the file or hands the
    /// address to another app. Nothing else will report that load.
    @Test("a load the shell stopped settles on what is on screen")
    func stoppedSettlesOnTheScreen() {
        let withPage = model()
        withPage.markLoading()
        withPage.markStopped(pageOnScreen: true)
        #expect(withPage.state == .loaded)

        let without = model()
        without.markLoading()
        without.markStopped(pageOnScreen: false)
        guard case .failed(let message) = without.state else {
            Issue.record("with nothing on screen the viewer must be given a way back, got \(without.state)")
            return
        }
        #expect(message.contains("litloft.local"))
    }

    @Test("an error for a load that is no longer in flight says nothing")
    func failuresOnlyCountWhileLoading() {
        let model = model()
        model.markLoading()
        model.markStopped(pageOnScreen: true)

        model.markFailed(NSError(domain: "WebKitErrorDomain", code: 102))
        model.markFailed(URLError(.notConnectedToInternet))

        #expect(model.state == .loaded)
    }

    @Test("a real failure is shown while a load is in flight")
    func realFailuresReachWhileLoading() {
        let model = model()
        model.markLoading()

        model.markFailed(URLError(.notConnectedToInternet))

        guard case .failed = model.state else {
            Issue.record("a real failure was swallowed, got \(model.state)")
            return
        }
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
