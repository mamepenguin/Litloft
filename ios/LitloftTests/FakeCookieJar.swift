import Foundation
import Testing

@testable import Litloft

@MainActor
final class FakeCookieJar: CookieJar {
    private(set) var cookies: [HTTPCookie]
    private(set) var calls: [String] = []

    init(_ cookies: [HTTPCookie] = []) {
        self.cookies = cookies
    }

    func setCookie(_ cookie: HTTPCookie) async {
        calls.append("set:\(cookie.name)")
        cookies.removeAll { $0.name == cookie.name && $0.domain == cookie.domain }
        cookies.append(cookie)
    }

    func allCookies() async -> [HTTPCookie] {
        cookies
    }

    func deleteCookie(_ cookie: HTTPCookie) async {
        calls.append("delete:\(cookie.name)")
        cookies.removeAll { $0.name == cookie.name && $0.domain == cookie.domain }
    }
}

func makeCookie(
    name: String,
    value: String = "v",
    domain: String = "litloft.local",
    expires: Date? = nil,
    httpOnly: Bool = false,
    sameSite: HTTPCookieStringPolicy? = nil
) -> HTTPCookie {
    var properties: [HTTPCookiePropertyKey: Any] = [
        .name: name,
        .value: value,
        .domain: domain,
        .path: "/"
    ]
    if let expires { properties[.expires] = expires }
    if httpOnly { properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE" }
    if let sameSite { properties[.sameSitePolicy] = sameSite }
    return HTTPCookie(properties: properties)!
}
