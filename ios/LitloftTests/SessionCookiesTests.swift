import Foundation
import Testing

@testable import Litloft

@MainActor
struct SessionCookiesTests {
    @Test("leaving a server takes its session out of the jar")
    func forgetClearsTheSession() async {
        let jar = FakeCookieJar([
            makeCookie(name: "access_token"),
            makeCookie(name: "lit_viewer"),
            makeCookie(name: "NEXT_LOCALE")
        ])

        await SessionCookies.forget(from: jar, host: "litloft.local")

        #expect(await jar.allCookies().map(\.name) == ["NEXT_LOCALE"])
    }

    @Test("leaving a server leaves another server's session alone")
    func forgetSparesOtherHosts() async {
        let jar = FakeCookieJar([
            makeCookie(name: "access_token", domain: "litloft.local"),
            makeCookie(name: "access_token", domain: "other.local")
        ])

        await SessionCookies.forget(from: jar, host: "litloft.local")

        #expect(await jar.allCookies().map(\.domain) == ["other.local"])
    }

    @Test("a cookie from another host is not part of the session")
    func foreignHostIsNotSession() {
        let cookies = [
            makeCookie(name: "access_token", domain: "litloft.local"),
            makeCookie(name: "access_token", domain: "evil.example"),
            makeCookie(name: "lit_viewer", domain: "evil.example")
        ]

        let session = SessionCookies.session(in: cookies, host: "litloft.local")

        #expect(session.count == 1)
        #expect(session.first?.domain == "litloft.local")
    }

    @Test("a cookie the server did not issue is not part of the session")
    func untrackedNameIsIgnored() {
        let cookies = [
            makeCookie(name: "access_token"),
            makeCookie(name: "NEXT_LOCALE"),
            makeCookie(name: "anything")
        ]

        #expect(SessionCookies.session(in: cookies, host: "litloft.local").map(\.name) == ["access_token"])
    }

    @Test("a domain matches its host regardless of dot or case", arguments: [
        (".litloft.local", "litloft.local", true),
        ("litloft.local", "litloft.local", true),
        ("LITLOFT.local", "litloft.LOCAL", true),
        ("MacBook-Pro-M3.local", "macbook-pro-m3.local", true),
        ("litloft.local", "sub.litloft.local", true),
        ("litloft.local", "notlitloft.local", false),
        ("litloft.local", "litloft.local.evil.example", false),
        ("evil.example", "litloft.local", false)
    ])
    func domainMatching(domain: String, host: String, expected: Bool) {
        #expect(SessionCookies.matches(domain: domain, host: host) == expected)
    }
}
