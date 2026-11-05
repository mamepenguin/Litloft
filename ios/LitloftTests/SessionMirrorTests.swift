import Foundation
import Testing

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000/")!

@MainActor
struct SessionMirrorTests {
    private func session(token: String?, viewer: String?) -> SessionItem {
        SessionItem(origin: "http://litloft.local:3000", accessToken: token, viewer: viewer)
    }

    @Test("SPEC-IOS-001 I5: arming mirrors the server and its session cookies as stored", arguments: [
        ("http://litloft.local:3000/", "litloft.local", "http://litloft.local:3000"),
        ("https://litloft.example/", "litloft.example", "https://litloft.example"),
        ("http://192.168.1.50:3000/", "192.168.1.50", "http://192.168.1.50:3000")
    ])
    func armingWritesTheMirror(address: String, host: String, origin: String) async {
        let url = URL(string: address)!
        let jar = FakeCookieJar([
            makeCookie(name: "access_token", value: "jwt-1", domain: host),
            makeCookie(name: "lit_viewer", value: "Yu%20ichi", domain: host),
            makeCookie(name: "NEXT_LOCALE", value: "ja", domain: host)
        ])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: url, jar: jar, store: store)

        mirror.arm()

        let expected = SessionItem(origin: origin, accessToken: "jwt-1", viewer: "Yu%20ichi")
        #expect(await eventually { store.item == expected })
        #expect(store.defaults.string(forKey: "share.server") == url.absoluteString)
        #expect(mirror.state == .armed)
    }

    @Test("SPEC-IOS-001 I5: before arming nothing is written or deleted, even from an empty store")
    func nothingBeforeArming() async {
        let old = session(token: "old", viewer: "me")
        let store = FakeSharedSession(item: old)
        let jar = FakeCookieJar()
        let mirror = SessionMirror(server: server, jar: jar, store: store)

        await jar.setCookie(makeCookie(name: "lit_viewer", value: "someone"))
        await jar.deleteCookie(makeCookie(name: "lit_viewer", value: "someone"))
        await settle()

        #expect(store.item == old)
        #expect(store.defaults.string(forKey: "share.server") == nil)
        #expect(mirror.state == .notArmed)

        mirror.arm()

        #expect(await eventually { store.item == nil && store.defaults.string(forKey: "share.server") != nil })
    }

    @Test("SPEC-IOS-001 I5: an armed mirror follows each change, and locking drops the token")
    func followsChanges() async {
        let jar = FakeCookieJar([makeCookie(name: "access_token", value: "jwt-1")])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: server, jar: jar, store: store)
        mirror.arm()
        #expect(await eventually { store.item == session(token: "jwt-1", viewer: nil) })

        await jar.setCookie(makeCookie(name: "lit_viewer", value: "me"))
        #expect(await eventually { store.item == session(token: "jwt-1", viewer: "me") })

        await jar.setCookie(makeCookie(name: "access_token", value: "jwt-2"))
        #expect(await eventually { store.item == session(token: "jwt-2", viewer: "me") })

        await jar.deleteCookie(makeCookie(name: "access_token"))
        #expect(await eventually { store.item == session(token: nil, viewer: "me") })
    }

    @Test("SPEC-IOS-001 I5: with neither cookie the item is deleted rather than written empty")
    func neitherCookieDeletesTheItem() async {
        let jar = FakeCookieJar([makeCookie(name: "access_token", value: "jwt-1")])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: server, jar: jar, store: store)
        mirror.arm()
        #expect(await eventually { store.item != nil })

        await jar.deleteCookie(makeCookie(name: "access_token"))

        #expect(await eventually { store.item == nil })
        #expect(store.defaults.string(forKey: "share.server") == server.absoluteString)
    }

    @Test("SPEC-IOS-001 I5: only the server's own session cookies are mirrored")
    func onlyTheServersSession() async {
        let jar = FakeCookieJar([
            makeCookie(name: "access_token", value: "foreign", domain: "evil.example"),
            makeCookie(name: "lit_viewer", value: "foreign", domain: "evil.example"),
            makeCookie(name: "lit_viewer", value: "me", domain: "litloft.local"),
            makeCookie(name: "anything", value: "x", domain: "litloft.local")
        ])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: server, jar: jar, store: store)

        mirror.arm()

        #expect(await eventually { store.item == session(token: nil, viewer: "me") })
    }

    @Test("SPEC-IOS-001: a second arm does nothing")
    func secondArmIsIgnored() async {
        let jar = FakeCookieJar([makeCookie(name: "access_token", value: "jwt-1")])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: server, jar: jar, store: store)

        mirror.arm()
        mirror.arm()

        #expect(await eventually { store.item != nil })
        #expect(jar.observerCount == 1)
    }

    @Test("SPEC-IOS-001 I5: disarming stops observing at once, and a disarmed mirror never writes")
    func disarmedNeverWrites() async {
        let jar = FakeCookieJar([makeCookie(name: "access_token", value: "jwt-1")])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: server, jar: jar, store: store)
        mirror.arm()
        #expect(await eventually { store.item == session(token: "jwt-1", viewer: nil) })
        #expect(jar.observerCount == 1)

        mirror.disarm()

        #expect(jar.observerCount == 0)
        #expect(mirror.state == .disarmed)
        await jar.setCookie(makeCookie(name: "access_token", value: "jwt-2"))
        await jar.deleteCookie(makeCookie(name: "access_token"))
        mirror.cookiesDidChange()
        mirror.arm()
        await settle()
        #expect(store.item == session(token: "jwt-1", viewer: nil))
    }

    @Test("SPEC-IOS-001: a failed keychain write leaves the previous item")
    func failedWriteKeepsThePreviousItem() async {
        let jar = FakeCookieJar([makeCookie(name: "access_token", value: "jwt-1")])
        let store = FakeSharedSession()
        let mirror = SessionMirror(server: server, jar: jar, store: store)
        mirror.arm()
        #expect(await eventually { store.item == session(token: "jwt-1", viewer: nil) })

        store.failsWrites = true
        await jar.setCookie(makeCookie(name: "access_token", value: "jwt-2"))
        await settle()

        #expect(store.item == session(token: "jwt-1", viewer: nil))
    }

    @Test("SPEC-IOS-001: the keychain item is the JSON object the extension reads")
    func itemWireShape() throws {
        let full = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(SessionItem(origin: "http://litloft.local:3000", accessToken: "t", viewer: "v"))
        ) as? [String: String]
        #expect(full == ["origin": "http://litloft.local:3000", "access_token": "t", "viewer": "v"])

        let tokenOnly = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(SessionItem(origin: "http://litloft.local:3000", accessToken: "t", viewer: nil))
        ) as? [String: String]
        #expect(tokenOnly == ["origin": "http://litloft.local:3000", "access_token": "t"])

        let decoded = try JSONDecoder().decode(
            SessionItem.self, from: Data(#"{"origin":"http://a:1","viewer":"v"}"#.utf8)
        )
        #expect(decoded == SessionItem(origin: "http://a:1", accessToken: nil, viewer: "v"))
    }
}
