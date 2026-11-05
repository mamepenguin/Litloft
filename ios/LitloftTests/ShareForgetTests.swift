import Foundation
import Testing

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000/")!

@MainActor
struct ShareForgetTests {
    private func makeDefaults() -> UserDefaults {
        UserDefaults(suiteName: "ShareForgetTests-\(UUID().uuidString)")!
    }

    @Test("SPEC-IOS-001 I5: forgetting a server deletes the item and every share. key, and only those")
    func forgetDeletesTheGroupKeys() {
        let store = FakeSharedSession(
            item: SessionItem(origin: "http://litloft.local:3000", accessToken: "t", viewer: "v")
        )
        store.defaults.set("http://litloft.local:3000/", forKey: "share.server")
        store.defaults.set("Photos", forKey: "share.lastDrive.http://litloft.local:3000")
        store.defaults.set("Inbox", forKey: "share.folder.http://litloft.local:3000.Photos")
        store.defaults.set("kept", forKey: "unrelated")
        let settings = ServerSettings(defaults: makeDefaults(), sharedSession: store)
        settings.use(server)

        settings.forget()

        #expect(store.item == nil)
        #expect(store.shareKeys.isEmpty)
        #expect(store.defaults.string(forKey: "unrelated") == "kept")
    }

    @Test("SPEC-IOS-001 I5: leaving after disarming removes the mirror and nothing writes it back")
    func leaveAfterDisarm() async {
        let jar = FakeCookieJar([
            makeCookie(name: "access_token", value: "jwt-1"),
            makeCookie(name: "lit_viewer", value: "me")
        ])
        let store = FakeSharedSession()
        let settings = ServerSettings(defaults: makeDefaults(), sharedSession: store)
        settings.use(server)
        let mirror = SessionMirror(server: server, jar: jar, store: store)
        mirror.arm()
        #expect(await eventually { store.item != nil })

        await jar.setCookie(makeCookie(name: "access_token", value: "jwt-2"))
        mirror.disarm()
        await settings.leave(server, jar: jar)
        await settle()

        #expect(store.item == nil)
        #expect(store.shareKeys.isEmpty)
        #expect(settings.serverURL == nil)
    }
}
