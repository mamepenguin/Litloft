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
    var onMediaCommand: ((MediaCommand, String?) -> Void)?

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
        case .media(let command, let loadId):
            onMediaCommand?(command, loadId)
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
              let type = body["type"] as? String
        else { return nil }

        if type == ShellMessageType.ping {
            guard let seq = body["seq"] as? Int else { return nil }
            return .reply(ShellMessage(type: ShellMessageType.pong, seq: seq))
        }
        return mediaAction(type, body, server: server)
    }

    /// A command about a file must name it; the player-wide settings do not.
    private nonisolated static func mediaAction(
        _ type: String,
        _ body: [String: Any],
        server: URL
    ) -> ShellAction? {
        if let setting = playerSetting(type, body) {
            return .media(setting, loadId: nil)
        }
        guard let loadId = nonEmpty(body["loadId"]),
              let command = fileCommand(type, body, server: server)
        else { return nil }
        return .media(command, loadId: loadId)
    }

    private nonisolated static func playerSetting(_ type: String, _ body: [String: Any]) -> MediaCommand? {
        switch type {
        case "media.setRate":
            (body["rate"] as? Double).flatMap { $0.isFinite && $0 > 0 ? .setRate($0) : nil }
        case "media.setVolume":
            (body["volume"] as? Double).flatMap { $0.isFinite ? .setVolume(min(max($0, 0), 1)) : nil }
        default:
            nil
        }
    }

    private nonisolated static func fileCommand(
        _ type: String,
        _ body: [String: Any],
        server: URL
    ) -> MediaCommand? {
        switch type {
        case "media.load":
            return source(body, server: server).map(MediaCommand.load)
        case "media.play":
            return .play
        case "media.pause":
            return .pause
        case "media.unload":
            return .unload
        case "media.seek":
            guard let seekId = nonEmpty(body["seekId"]),
                  let time = body["time"] as? Double, time.isFinite
            else { return nil }
            return .seek(time: time, seekId: seekId)
        default:
            return nil
        }
    }

    private nonisolated static func nonEmpty(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }

    /// The session's cookies go with whatever is loaded here, so both addresses
    /// must be the server's own. Artwork from anywhere else is dropped rather
    /// than refusing the file, since the file itself is fine.
    private nonisolated static func source(_ body: [String: Any], server: URL) -> MediaSource? {
        guard let raw = body["url"] as? String,
              let url = URL(string: raw),
              MessageOrigin.isSameOrigin(url, as: server),
              let title = body["title"] as? String
        else { return nil }

        let artwork = (body["artworkUrl"] as? String)
            .flatMap(URL.init(string:))
            .flatMap { MessageOrigin.isSameOrigin($0, as: server) ? $0 : nil }

        return MediaSource(
            url: url,
            title: title,
            artist: body["artist"] as? String,
            artworkURL: artwork
        )
    }

    func deliver(_ state: MediaState) {
        send(state, describedAs: "media.state")
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
