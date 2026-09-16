import Foundation

/// Litloft's session lives in the web view's own cookie store, which is
/// persistent — a login already survives a relaunch. The only thing the shell
/// has to do is take the session with it when the viewer leaves a server.
@MainActor
enum SessionCookies {
    /// Set by the backend on unlock, and the viewer identity that rides
    /// alongside it.
    static let names: Set<String> = ["access_token", "lit_viewer"]

    /// A cookie belongs to the session only if the configured server issued it.
    /// Matching on name alone would take a same-named cookie from any origin
    /// the web view happens to have visited.
    static func session(in cookies: [HTTPCookie], host: String) -> [HTTPCookie] {
        cookies.filter { names.contains($0.name) && matches(domain: $0.domain, host: host) }
    }

    static func matches(domain: String, host: String) -> Bool {
        let domain = (domain.hasPrefix(".") ? String(domain.dropFirst()) : domain).lowercased()
        let host = host.lowercased()
        return domain == host || host.hasSuffix("." + domain)
    }

    /// Leaving a server takes its session with it.
    static func forget(from jar: CookieJar, host: String) async {
        for cookie in session(in: await jar.allCookies(), host: host) {
            await jar.deleteCookie(cookie)
        }
    }
}
