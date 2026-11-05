import Foundation

@MainActor
@Observable
final class ServerSettings {
    private static let key = "serverURL"

    private(set) var serverURL: URL?
    private(set) var lastAddress = ""

    init(defaults: UserDefaults = .standard, sharedSession: SharedSession? = nil) {
        self.defaults = defaults
        self.sharedSession = sharedSession ?? GroupSharedSession()
        // Through the same gate as typed input: a value stored by an older
        // build, or edited by hand, is not trusted.
        if let stored = defaults.string(forKey: Self.key) {
            serverURL = ServerAddress.parse(stored)
            lastAddress = serverURL?.absoluteString ?? ""
        }
    }

    private let defaults: UserDefaults
    private let sharedSession: SharedSession

    func use(_ url: URL) {
        serverURL = url
        lastAddress = url.absoluteString
        defaults.set(url.absoluteString, forKey: Self.key)
    }

    /// Leaving a server: its session goes out of the jar, then the address
    /// goes out of settings.
    func leave(_ serverURL: URL, jar: CookieJar) async {
        await SessionCookies.forget(from: jar, host: serverURL.host() ?? "")
        forget()
    }

    func forget() {
        lastAddress = serverURL?.absoluteString ?? lastAddress
        serverURL = nil
        defaults.removeObject(forKey: Self.key)
        // The extension's copy goes with the server, so a share after leaving
        // cannot reach the server the viewer left.
        for key in sharedSession.defaults.dictionaryRepresentation().keys
            where key.hasPrefix("share.") {
            sharedSession.defaults.removeObject(forKey: key)
        }
        sharedSession.deleteItem()
    }
}
