import Foundation
import WebKit

/// Keeps the web view's cookie jar and the keychain in step for the
/// configured server's session cookies.
@MainActor
final class CookieBridge: NSObject, WKHTTPCookieStoreObserver {
    private let host: String
    private weak var jar: WKHTTPCookieStore?

    init(host: String) {
        self.host = host
    }

    /// Injects the stored session, then watches the jar so later changes —
    /// including a sign-out — reach the keychain.
    func attach(to jar: WKHTTPCookieStore, then load: @escaping () -> Void) async {
        self.jar = jar
        await SessionCookies.restoreThenLoad(into: jar, stored: CookieVault.load(), load: load)
        jar.add(self)
    }

    nonisolated func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { @MainActor in
            await SessionCookies.capture(from: cookieStore, host: host)
        }
    }

    func forget() async {
        guard let jar else {
            CookieVault.clear()
            return
        }
        await SessionCookies.forget(from: jar, host: host)
    }
}
