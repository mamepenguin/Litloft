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
        let reply = try #require(ShellBridge.reply(to: "ping", seq: 42))

        #expect(reply.type == "pong")
        #expect(reply.seq == 42)
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

    @Test("an unknown message type is not answered")
    func unknownTypeIsUnanswered() {
        #expect(ShellBridge.reply(to: "seek", seq: 1) == nil)
        #expect(ShellBridge.reply(to: "pong", seq: 1) == nil)
        #expect(ShellBridge.reply(to: "", seq: 1) == nil)
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
