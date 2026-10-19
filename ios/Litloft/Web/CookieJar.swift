import Foundation
import WebKit

/// The subset of `WKHTTPCookieStore` the session logic needs, so that logic
/// can be exercised without a web view.
@MainActor
protocol CookieJar: AnyObject {
    func setCookie(_ cookie: HTTPCookie) async
    func allCookies() async -> [HTTPCookie]
    func deleteCookie(_ cookie: HTTPCookie) async
}

extension WKHTTPCookieStore: CookieJar {}
