import Foundation
import os

/// Keeps Litloft's session cookies across launches. WebKit may purge its own
/// website data, which is the only other place they live.
enum CookieVault {
    /// Set by the backend on unlock, and the viewer identity that rides
    /// alongside it.
    static let trackedNames: Set<String> = ["access_token", "lit_viewer"]

    private static let account = "session-cookies"
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "cookies")

    /// A cookie belongs to the session only if the configured server issued it.
    /// Matching on name alone would adopt a same-named cookie from any origin
    /// the web view happens to have visited.
    static func tracked(in cookies: [HTTPCookie], host: String) -> [HTTPCookie] {
        cookies.filter { trackedNames.contains($0.name) && matches(domain: $0.domain, host: host) }
    }

    static func matches(domain: String, host: String) -> Bool {
        let domain = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
        let host = host.lowercased()
        let lowered = domain.lowercased()
        return lowered == host || host.hasSuffix("." + lowered)
    }

    /// An empty set is a sign-out, not a no-op: it clears what was stored.
    static func save(_ cookies: [HTTPCookie]) {
        let stored = cookies.compactMap(StoredCookie.init)
        guard !stored.isEmpty else {
            clear()
            return
        }

        do {
            try Keychain.set(try JSONEncoder().encode(stored), account: account)
        } catch {
            // The session still works for this launch; it just will not
            // outlive a website-data purge.
            log.error("could not persist session cookies: \(error, privacy: .public)")
        }
    }

    static func load() -> [HTTPCookie] {
        guard let data = Keychain.data(account: account) else { return [] }
        do {
            return try JSONDecoder().decode([StoredCookie].self, from: data)
                .filter { !$0.isExpired }
                .compactMap { $0.makeCookie() }
        } catch {
            Keychain.remove(account: account)
            return []
        }
    }

    static func clear() {
        Keychain.remove(account: account)
    }
}
