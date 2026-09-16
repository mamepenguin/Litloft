import Foundation

/// An `HTTPCookie` reduced to the fields that survive a round trip through
/// storage. `HTTPCookie` itself is not `Codable`.
struct StoredCookie: Codable, Equatable {
    let name: String
    let value: String
    let domain: String
    let path: String
    let expiresDate: Date?
    let isSecure: Bool
    let isHTTPOnly: Bool
    let sameSite: String?

    init?(_ cookie: HTTPCookie) {
        guard !cookie.name.isEmpty else { return nil }
        name = cookie.name
        value = cookie.value
        domain = cookie.domain
        path = cookie.path
        expiresDate = cookie.expiresDate
        isSecure = cookie.isSecure
        isHTTPOnly = cookie.isHTTPOnly
        sameSite = cookie.sameSitePolicy?.rawValue
    }

    var isExpired: Bool {
        guard let expiresDate else { return false }
        return expiresDate <= Date()
    }

    func makeCookie() -> HTTPCookie? {
        var properties: [HTTPCookiePropertyKey: Any] = [
            .name: name,
            .value: value,
            .domain: domain,
            .path: path
        ]
        if let expiresDate {
            properties[.expires] = expiresDate
        }
        if isSecure {
            properties[.secure] = "TRUE"
        }
        if isHTTPOnly {
            properties[Self.httpOnlyKey] = "TRUE"
        }
        if let sameSite {
            properties[.sameSitePolicy] = HTTPCookieStringPolicy(rawValue: sameSite)
        }
        return HTTPCookie(properties: properties)
    }

    /// `HTTPCookie` reads this back into `isHTTPOnly`, but Foundation ships no
    /// constant for it.
    private static let httpOnlyKey = HTTPCookiePropertyKey("HttpOnly")
}
