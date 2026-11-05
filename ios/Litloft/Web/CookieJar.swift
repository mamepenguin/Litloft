import Foundation
import WebKit

/// The subset of `WKHTTPCookieStore` the session logic needs, so that logic
/// can be exercised without a web view.
@MainActor
protocol CookieJar: AnyObject {
    func setCookie(_ cookie: HTTPCookie) async
    func allCookies() async -> [HTTPCookie]
    func deleteCookie(_ cookie: HTTPCookie) async
    func addObserver(_ observer: CookieJarObserver)
    func removeObserver(_ observer: CookieJarObserver)
}

@MainActor
protocol CookieJarObserver: AnyObject {
    func cookiesDidChange()
}

extension WKHTTPCookieStore: CookieJar {
    func addObserver(_ observer: CookieJarObserver) {
        let adapter = CookieStoreObserverAdapter(observer)
        CookieStoreObserverRegistry.shared.retain(adapter, for: observer)
        add(adapter)
    }

    func removeObserver(_ observer: CookieJarObserver) {
        guard let adapter = CookieStoreObserverRegistry.shared.release(observer) else { return }
        remove(adapter)
    }
}

/// `WKHTTPCookieStore` holds its observers weakly, so the adapter has to be
/// kept alive beside the observer it forwards for.
@MainActor
private final class CookieStoreObserverRegistry {
    static let shared = CookieStoreObserverRegistry()

    private var adapters: [ObjectIdentifier: CookieStoreObserverAdapter] = [:]

    func retain(_ adapter: CookieStoreObserverAdapter, for observer: CookieJarObserver) {
        adapters[ObjectIdentifier(observer)] = adapter
    }

    func release(_ observer: CookieJarObserver) -> CookieStoreObserverAdapter? {
        adapters.removeValue(forKey: ObjectIdentifier(observer))
    }
}

@MainActor
private final class CookieStoreObserverAdapter: NSObject, WKHTTPCookieStoreObserver {
    private weak var observer: CookieJarObserver?

    init(_ observer: CookieJarObserver) {
        self.observer = observer
    }

    nonisolated func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { @MainActor in observer?.cookiesDidChange() }
    }
}
