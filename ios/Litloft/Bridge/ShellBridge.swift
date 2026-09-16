import Foundation
import WebKit
import os

/// Carries messages between the web app and the shell. The web side reaches
/// it through `window.webkit.messageHandlers.litloft`; replies go back by
/// calling the `window.__litloft` receiver the web side installs.
@MainActor
final class ShellBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "litloft"

    private let server: URL
    private weak var webView: WKWebView?

    /// Set by whatever owns the player; absent until then, so a command that
    /// arrives early is dropped rather than queued.
    var onMediaCommand: ((MediaCommand, Int) -> Void)?

    init(server: URL) {
        self.server = server
    }
    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "bridge")

    func install(in configuration: WKWebViewConfiguration) {
        configuration.userContentController.add(self, name: Self.handlerName)
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let action = Self.route(body: message.body, from: MessageOrigin(message), server: server) else {
            log.error("dropped an unroutable message")
            return
        }

        switch action {
        case .reply(let message):
            deliver(message)
        case .media(let command, let seq):
            onMediaCommand?(command, seq)
        }
    }

    /// The whole acceptance decision: who may command the shell, what a command
    /// has to look like, and what it asks for. Pure, so a test can hold it.
    ///
    /// The handler is injected into every frame of every document the web view
    /// loads — WebKit offers no way to scope that — so the sender is checked
    /// here instead.
    nonisolated static func route(body: Any, from origin: MessageOrigin, server: URL) -> ShellAction? {
        guard origin.isTrusted(for: server),
              let body = body as? [String: Any],
              let type = body["type"] as? String,
              let seq = body["seq"] as? Int
        else { return nil }

        if type == ShellMessageType.ping {
            return .reply(ShellMessage(type: ShellMessageType.pong, seq: seq))
        }
        guard let command = mediaCommand(type, body) else { return nil }
        return .media(command, seq: seq)
    }

    private nonisolated static func mediaCommand(_ type: String, _ body: [String: Any]) -> MediaCommand? {
        switch type {
        case "media.load":
            return source(body).map(MediaCommand.load)
        case "media.play":
            return .play
        case "media.pause":
            return .pause
        case "media.seek":
            return (body["time"] as? Double).flatMap { $0.isFinite ? .seek($0) : nil }
        case "media.setRate":
            return (body["rate"] as? Double).flatMap { $0.isFinite && $0 > 0 ? .setRate($0) : nil }
        case "media.setVolume":
            return (body["volume"] as? Double).flatMap { $0.isFinite ? .setVolume(min(max($0, 0), 1)) : nil }
        case "media.unload":
            return .unload
        default:
            return nil
        }
    }

    private nonisolated static func source(_ body: [String: Any]) -> MediaSource? {
        guard let raw = body["url"] as? String,
              let url = URL(string: raw),
              let title = body["title"] as? String
        else { return nil }

        let startAt = body["startAt"] as? Double
        return MediaSource(
            url: url,
            title: title,
            artist: body["artist"] as? String,
            artworkURL: (body["artworkUrl"] as? String).flatMap(URL.init(string:)),
            startAt: (startAt?.isFinite == true && startAt! > 0) ? startAt! : 0
        )
    }

    func deliver(_ tick: MediaTick) {
        send(tick, describedAs: tick.type)
    }

    private func deliver(_ message: ShellMessage) {
        send(message, describedAs: message.type)
    }

    private func send(_ payload: some Encodable, describedAs description: String) {
        guard let webView,
              let data = try? JSONEncoder().encode(payload),
              let json = String(data: data, encoding: .utf8)
        else { return }

        // The receiver is absent whenever nothing on the page is listening.
        webView.evaluateJavaScript("window.__litloft?.receive(\(json))") { [log] _, error in
            if let error {
                log.error("could not deliver \(description, privacy: .public): \(error, privacy: .public)")
            }
        }
    }
}
