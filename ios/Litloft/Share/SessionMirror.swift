import Foundation

/// Keeps the App Group copy of the app's session equal to the web view's
/// cookie store, so a share extension can act with the session the viewer
/// already has.
@MainActor
final class SessionMirror: CookieJarObserver {
    enum State: Equatable {
        case notArmed
        case armed
        case disarmed
    }

    private(set) var state: State = .notArmed

    let origin: String

    private let server: URL
    private let jar: CookieJar
    private let store: SharedSession
    private var generation = 0

    init(server: URL, jar: CookieJar, store: SharedSession) {
        self.server = server
        self.jar = jar
        self.store = store
        origin = SessionItem.origin(of: server)
    }

    /// The first commit after the cookie store has loaded its cookies. Before
    /// this the store is still empty at launch, so a write would erase a
    /// session that is about to be restored.
    func arm() {
        guard state == .notArmed else { return }
        state = .armed
        jar.addObserver(self)
        write()
    }

    /// Called synchronously before leaving the server, so no cookie deletion
    /// can schedule a write after `forget()` has cleared the group.
    func disarm() {
        guard state == .armed else {
            state = .disarmed
            return
        }
        jar.removeObserver(self)
        state = .disarmed
    }

    func cookiesDidChange() {
        guard state == .armed else { return }
        write()
    }

    private func write() {
        generation += 1
        let generation = generation
        Task { @MainActor in
            let cookies = await jar.allCookies()
            guard state == .armed, generation == self.generation else { return }
            store.defaults.set(server.absoluteString, forKey: "share.server")
            let session = SessionCookies.session(in: cookies, host: server.host() ?? "")
            let token = session.first { $0.name == "access_token" }?.value
            let viewer = session.first { $0.name == "lit_viewer" }?.value
            guard token != nil || viewer != nil else {
                store.deleteItem()
                return
            }
            try? store.writeItem(SessionItem(origin: origin, accessToken: token, viewer: viewer))
        }
    }
}
