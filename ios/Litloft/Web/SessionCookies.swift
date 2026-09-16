import Foundation

/// Moving Litloft's session between the keychain and a cookie jar. Separate
/// from `CookieBridge` so the ordering and the filtering can be tested.
@MainActor
enum SessionCookies {
    /// Puts the stored session back in the jar, and reports what it put there.
    @discardableResult
    static func restore(into jar: CookieJar, from stored: [HTTPCookie]) async -> [HTTPCookie] {
        for cookie in stored {
            await jar.setCookie(cookie)
        }
        return stored
    }

    /// Reads the jar and persists whatever of the session it holds. An empty
    /// result clears the vault, so a sign-out is not mistaken for "no news".
    @discardableResult
    static func capture(from jar: CookieJar, host: String) async -> [HTTPCookie] {
        let tracked = CookieVault.tracked(in: await jar.allCookies(), host: host)
        CookieVault.save(tracked)
        return tracked
    }

    /// The first request must carry the restored session, or it lands on the
    /// unlock screen. Ordering lives here so a test can hold it.
    static func restoreThenLoad(into jar: CookieJar, stored: [HTTPCookie], load: () -> Void) async {
        await restore(into: jar, from: stored)
        load()
    }

    /// Drops the session from every store the shell owns.
    static func forget(from jar: CookieJar, host: String) async {
        for cookie in CookieVault.tracked(in: await jar.allCookies(), host: host) {
            await jar.deleteCookie(cookie)
        }
        CookieVault.clear()
    }
}
