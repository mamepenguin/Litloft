import Foundation
import WebKit

/// Who sent a message, in the terms the shell decides on. Separate from
/// `WKScriptMessage` because that cannot be constructed in a test.
struct MessageOrigin: Equatable {
    let isMainFrame: Bool
    let scheme: String
    let host: String
    /// 0 where the origin used the scheme's default port, matching `WKSecurityOrigin`.
    let port: Int

    init(isMainFrame: Bool, scheme: String, host: String, port: Int) {
        self.isMainFrame = isMainFrame
        self.scheme = scheme
        self.host = host
        self.port = port
    }

    init(_ message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        self.init(
            isMainFrame: message.frameInfo.isMainFrame,
            scheme: origin.protocol,
            host: origin.host,
            port: origin.port
        )
    }

    /// The shell only ever takes commands from the main frame of the server it
    /// was pointed at. Anything the web view loads besides that — an embed, a
    /// redirect, a page reached by a link — is a stranger.
    func isTrusted(for server: URL) -> Bool {
        guard isMainFrame,
              let expectedScheme = server.scheme?.lowercased(),
              let expectedHost = server.host()?.lowercased()
        else { return false }

        return scheme.lowercased() == expectedScheme
            && host.lowercased() == expectedHost
            && Self.canonical(port: port, scheme: expectedScheme)
                == Self.canonical(port: server.port ?? 0, scheme: expectedScheme)
    }

    /// Both sides go through this rather than one being converted to the
    /// other's convention: `URL` omits a default port and `WKSecurityOrigin` is
    /// documented to report 0 for one, but a build that reported 80 instead
    /// would silently stop trusting the server. Folding both to the same value
    /// means either convention agrees.
    private static func canonical(port: Int, scheme: String) -> Int {
        switch (scheme, port) {
        case ("http", 80), ("https", 443):
            return 0
        default:
            return port
        }
    }
}
