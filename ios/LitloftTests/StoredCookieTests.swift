import Foundation
import Testing

@testable import Litloft

struct StoredCookieTests {
    private func makeCookie(
        name: String = "access_token",
        value: String = "abc123",
        expires: Date? = nil
    ) -> HTTPCookie {
        var properties: [HTTPCookiePropertyKey: Any] = [
            .name: name,
            .value: value,
            .domain: "192.168.1.50",
            .path: "/"
        ]
        if let expires {
            properties[.expires] = expires
        }
        return HTTPCookie(properties: properties)!
    }

    @Test("a cookie survives a round trip through storage")
    func roundTrip() throws {
        let expires = Date(timeIntervalSince1970: 1_800_000_000)
        let stored = try #require(StoredCookie(makeCookie(expires: expires)))

        let data = try JSONEncoder().encode(stored)
        let decoded = try JSONDecoder().decode(StoredCookie.self, from: data)

        #expect(decoded == stored)

        let rebuilt = try #require(decoded.makeCookie())
        #expect(rebuilt.name == "access_token")
        #expect(rebuilt.value == "abc123")
        #expect(rebuilt.domain == "192.168.1.50")
        #expect(rebuilt.path == "/")
        #expect(rebuilt.expiresDate == expires)
    }

    @Test("a session cookie has no expiry and never reads as expired")
    func sessionCookie() throws {
        let stored = try #require(StoredCookie(makeCookie()))
        #expect(stored.expiresDate == nil)
        #expect(stored.isExpired == false)
    }

    @Test("a past expiry reads as expired")
    func pastExpiry() throws {
        let stored = try #require(StoredCookie(makeCookie(expires: Date(timeIntervalSince1970: 1))))
        #expect(stored.isExpired)
    }

    @Test("a future expiry does not read as expired")
    func futureExpiry() throws {
        let stored = try #require(StoredCookie(makeCookie(expires: .distantFuture)))
        #expect(stored.isExpired == false)
    }
}
