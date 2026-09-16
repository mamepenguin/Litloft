import Foundation
import WebKit
import os

/// Carries messages between the web app and the shell. The web side reaches
/// it through `window.webkit.messageHandlers.litloft`; replies go back by
/// calling the `window.__litloft` receiver the web side installs.
@MainActor
final class ShellBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "litloft"

    private weak var webView: WKWebView?
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
        guard let reply = Self.route(body: message.body, fromMainFrame: message.frameInfo.isMainFrame) else {
            log.error("dropped an unroutable message")
            return
        }
        deliver(reply)
    }

    /// The whole acceptance decision: who may command the shell, what a command
    /// has to look like, and what answers it. Pure, so a test can hold it.
    ///
    /// The handler is injected into every frame — WebKit offers no way to scope
    /// that — and replies only ever reach the main frame, so a subframe could
    /// otherwise command the shell and never hear back.
    nonisolated static func route(body: Any, fromMainFrame: Bool) -> ShellMessage? {
        guard fromMainFrame,
              let body = body as? [String: Any],
              let type = body["type"] as? String,
              let seq = body["seq"] as? Int
        else { return nil }

        return reply(to: type, seq: seq)
    }

    /// The whole command table. Pure, so a test can hold it.
    nonisolated static func reply(to type: String, seq: Int) -> ShellMessage? {
        switch type {
        case ShellMessageType.ping:
            return ShellMessage(type: ShellMessageType.pong, seq: seq)
        default:
            return nil
        }
    }

    private func deliver(_ message: ShellMessage) {
        guard let webView,
              let data = try? JSONEncoder().encode(message),
              let json = String(data: data, encoding: .utf8)
        else { return }

        // The receiver is absent whenever nothing on the page is listening.
        webView.evaluateJavaScript("window.__litloft?.receive(\(json))") { [log] _, error in
            if let error {
                log.error("could not deliver \(message.type, privacy: .public): \(error, privacy: .public)")
            }
        }
    }
}
