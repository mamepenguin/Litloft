import Foundation
import WebKit

/// Carries Litloft's session cookies between the three places that need them:
/// the web view's store, `HTTPCookieStorage` (which `AVPlayer` reads), and the
/// keychain (which survives a website-data purge).
@MainActor
final class CookieBridge: NSObject, WKHTTPCookieStoreObserver {
    private weak var store: WKHTTPCookieStore?

    /// Injects the stored session into both jars, then watches the web view's
    /// store so later changes reach them too.
    func attach(to store: WKHTTPCookieStore) async {
        self.store = store

        for cookie in CookieVault.load() {
            await store.setCookie(cookie)
            HTTPCookieStorage.shared.setCookie(cookie)
        }

        store.add(self)
    }

    nonisolated func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { @MainActor in
            await capture(from: cookieStore)
        }
    }

    private func capture(from cookieStore: WKHTTPCookieStore) async {
        let cookies = await cookieStore.allCookies()
        let tracked = cookies.filter { CookieVault.trackedNames.contains($0.name) }

        for cookie in tracked {
            HTTPCookieStorage.shared.setCookie(cookie)
        }
        CookieVault.save(tracked)
    }

    /// Drops the session everywhere. The web view's own store is left to the
    /// caller, which owns its lifetime.
    static func forget() {
        CookieVault.clear()
        for name in CookieVault.trackedNames {
            HTTPCookieStorage.shared.cookies?
                .filter { $0.name == name }
                .forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }
    }
}
