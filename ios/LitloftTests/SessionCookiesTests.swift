import Foundation
import Testing
import WebKit

@testable import Litloft

@MainActor
struct SessionCookiesTests {
    @Test("the stored session is put back in the jar")
    func restorePutsCookiesBack() async {
        let jar = FakeCookieJar()
        let stored = [makeCookie(name: "access_token"), makeCookie(name: "lit_viewer")]

        await SessionCookies.restore(into: jar, from: stored)

        #expect(jar.calls == ["set:access_token", "set:lit_viewer"])
        #expect(await jar.allCookies().count == 2)
    }

    @Test("the first load happens after the session is in the jar")
    func restoreComesBeforeLoad() async {
        let jar = FakeCookieJar()
        var jarWhenLoadRan: [String] = []
        var loadRan = false

        await SessionCookies.restoreThenLoad(
            into: jar,
            stored: [makeCookie(name: "access_token")],
            load: {
                loadRan = true
                jarWhenLoadRan = jar.cookies.map(\.name)
            }
        )

        #expect(loadRan)
        // Asserting the two sides separately would pass in either order; what
        // matters is what the jar held at the moment the request went out.
        #expect(jarWhenLoadRan == ["access_token"])
    }

    @Test("a cookie from another host is not part of the session")
    func foreignHostIsNotTracked() {
        let cookies = [
            makeCookie(name: "access_token", domain: "litloft.local"),
            makeCookie(name: "access_token", domain: "evil.example"),
            makeCookie(name: "lit_viewer", domain: "evil.example")
        ]

        let tracked = CookieVault.tracked(in: cookies, host: "litloft.local")

        #expect(tracked.count == 1)
        #expect(tracked.first?.domain == "litloft.local")
    }

    @Test("a cookie the server did not issue is not part of the session")
    func untrackedNameIsIgnored() {
        let cookies = [
            makeCookie(name: "access_token"),
            makeCookie(name: "NEXT_LOCALE"),
            makeCookie(name: "anything")
        ]

        #expect(CookieVault.tracked(in: cookies, host: "litloft.local").map(\.name) == ["access_token"])
    }

    @Test("a leading-dot domain still matches its host", arguments: [
        (".litloft.local", "litloft.local", true),
        ("litloft.local", "litloft.local", true),
        ("litloft.local", "sub.litloft.local", true),
        ("litloft.local", "notlitloft.local", false),
        ("evil.example", "litloft.local", false)
    ])
    func domainMatching(domain: String, host: String, expected: Bool) {
        #expect(CookieVault.matches(domain: domain, host: host) == expected)
    }

    @Test("leaving a server takes its session out of the jar")
    func forgetClearsTheJar() async {
        let jar = FakeCookieJar([
            makeCookie(name: "access_token"),
            makeCookie(name: "lit_viewer"),
            makeCookie(name: "NEXT_LOCALE")
        ])

        await SessionCookies.forget(from: jar, host: "litloft.local")

        #expect(await jar.allCookies().map(\.name) == ["NEXT_LOCALE"])
    }
}
