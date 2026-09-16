import Foundation
import os

/// Keeps Litloft's session cookies across launches. WebKit may purge its own
/// website data, and `AVPlayer` reads `HTTPCookieStorage` rather than the web
/// view's store, so neither is a durable home on its own.
enum CookieVault {
    /// Set by the backend on unlock, and the viewer identity that rides
    /// alongside it.
    static let trackedNames: Set<String> = ["access_token", "lit_viewer"]

    private static let account = "session-cookies"
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "cookies")

    static func save(_ cookies: [HTTPCookie]) {
        let stored = cookies
            .filter { trackedNames.contains($0.name) }
            .compactMap(StoredCookie.init)

        guard !stored.isEmpty else { return }

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
