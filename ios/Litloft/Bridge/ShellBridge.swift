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
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String,
              let seq = body["seq"] as? Int
        else {
            log.error("dropped a message that does not match the wire shape")
            return
        }

        switch type {
        case ShellMessageType.ping:
            log.debug("ping \(seq, privacy: .public)")
            deliver(ShellMessage(type: ShellMessageType.pong, seq: seq))
        default:
            log.error("no handler for message type \(type, privacy: .public)")
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
