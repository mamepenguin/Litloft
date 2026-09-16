import Foundation
import Testing

@testable import Litloft

struct ShellBridgeTests {
    @Test("a ping is answered with a pong carrying the same seq")
    func pingIsAnswered() throws {
        let reply = try #require(ShellBridge.reply(to: "ping", seq: 42))

        #expect(reply.type == "pong")
        #expect(reply.seq == 42)
    }

    @Test("a well-formed ping from a subframe is not answered")
    func subframeIsNotTrusted() {
        let ping: Any = ["type": "ping", "seq": 42]

        #expect(ShellBridge.route(body: ping, fromMainFrame: true) != nil)
        #expect(ShellBridge.route(body: ping, fromMainFrame: false) == nil)
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
            #expect(ShellBridge.route(body: body, fromMainFrame: true) == nil)
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
