import Foundation
import Testing

@testable import Litloft

/// These touch the real keychain, so they do not run alongside each other.
@Suite(.serialized)
struct VaultPersistenceTests {
    @Test("what the backend sets survives the round trip")
    func attributesSurvive() throws {
        CookieVault.clear()
        defer { CookieVault.clear() }

        let source = makeCookie(
            name: "access_token",
            expires: Date(timeIntervalSinceNow: 3600),
            httpOnly: true,
            sameSite: .sameSiteStrict
        )
        #expect(source.isHTTPOnly)
        #expect(source.sameSitePolicy == .sameSiteStrict)

        CookieVault.save([source])
        let restored = try #require(CookieVault.load().first)

        #expect(restored.name == "access_token")
        #expect(restored.isHTTPOnly, "restoring must not weaken the cookie")
        #expect(restored.sameSitePolicy == .sameSiteStrict, "restoring must not weaken the cookie")
        #expect(restored.isSessionOnly == false)
    }

    @Test("signing out clears what was stored")
    func emptyCaptureClears() throws {
        CookieVault.clear()
        defer { CookieVault.clear() }

        CookieVault.save([makeCookie(name: "access_token")])
        #expect(CookieVault.load().isEmpty == false)

        // What a lock looks like: the jar no longer holds a session cookie.
        CookieVault.save([])

        #expect(CookieVault.load().isEmpty)
    }

    @Test("an expired cookie is not restored")
    func expiredIsDropped() {
        CookieVault.clear()
        defer { CookieVault.clear() }

        CookieVault.save([makeCookie(name: "access_token", expires: Date(timeIntervalSince1970: 1))])

        #expect(CookieVault.load().isEmpty)
    }
}
