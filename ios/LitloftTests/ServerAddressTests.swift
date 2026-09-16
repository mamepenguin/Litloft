import Foundation
import Testing

@testable import Litloft

struct ServerAddressTests {
    @Test("a bare host and port gets an http scheme")
    func bareHostAndPort() {
        #expect(ServerAddress.parse("192.168.1.50:3000")?.absoluteString == "http://192.168.1.50:3000")
    }

    @Test("an explicit scheme is kept")
    func explicitScheme() {
        #expect(ServerAddress.parse("https://litloft.local:3000")?.absoluteString == "https://litloft.local:3000")
    }

    @Test("a trailing path is dropped")
    func trailingPath() {
        #expect(ServerAddress.parse("192.168.1.50:3000/drive/x")?.absoluteString == "http://192.168.1.50:3000")
    }

    @Test("surrounding whitespace is ignored")
    func whitespace() {
        #expect(ServerAddress.parse("  localhost:3000  ")?.absoluteString == "http://localhost:3000")
    }

    @Test("a host with no port is accepted")
    func noPort() {
        #expect(ServerAddress.parse("litloft.local")?.absoluteString == "http://litloft.local")
    }

    @Test("a .local hostname with hyphens is accepted")
    func localHostname() {
        #expect(ServerAddress.parse("MacBook-Pro-M3.local:3000")?.absoluteString
            == "http://MacBook-Pro-M3.local:3000")
    }

    @Test("an IPv6 literal is accepted")
    func ipv6() {
        #expect(ServerAddress.parse("http://[fe80::1]:3000") != nil)
    }

    @Test("a mistyped separator is rejected rather than stored", arguments: [
        "localhost'3000",
        "localhost;3000",
        "local host:3000"
    ])
    func mistypedSeparator(_ input: String) {
        #expect(ServerAddress.parse(input) == nil)
    }

    @Test("an unusable address is rejected", arguments: [
        "",
        "   ",
        "://3000",
        "ftp://litloft.local:3000",
        "-litloft.local:3000",
        "litloft-.local:3000",
        "litloft..local:3000",
        "litloft.local:0",
        "litloft.local:70000"
    ])
    func rejected(_ input: String) {
        #expect(ServerAddress.parse(input) == nil)
    }
}

@MainActor
struct ServerSettingsTests {
    private func makeDefaults() -> UserDefaults {
        let suite = UserDefaults(suiteName: "ServerSettingsTests-\(UUID().uuidString)")!
        return suite
    }

    @Test("a valid stored address is restored")
    func restoresValid() {
        let defaults = makeDefaults()
        defaults.set("http://192.168.1.50:3000", forKey: "serverURL")

        #expect(ServerSettings(defaults: defaults).serverURL?.absoluteString == "http://192.168.1.50:3000")
    }

    @Test("an address stored by an older build is not trusted")
    func rejectsStoredGarbage() {
        let defaults = makeDefaults()
        defaults.set("http://localhost'3000", forKey: "serverURL")

        #expect(ServerSettings(defaults: defaults).serverURL == nil)
    }

    @Test("the previous address is offered again after leaving a server")
    func forgetKeepsTheAddressForTheSetupScreen() {
        let defaults = makeDefaults()
        let settings = ServerSettings(defaults: defaults)
        settings.use(URL(string: "http://litloft.local:3000")!)

        settings.forget()

        #expect(settings.serverURL == nil)
        #expect(settings.lastAddress == "http://litloft.local:3000")
    }

    @Test("a restored address is offered as the previous one")
    func restoredAddressIsOffered() {
        let defaults = makeDefaults()
        defaults.set("http://192.168.1.50:3000", forKey: "serverURL")

        #expect(ServerSettings(defaults: defaults).lastAddress == "http://192.168.1.50:3000")
    }

    @Test("leaving a server clears both its session and its address")
    func leaveClearsSessionAndAddress() async {
        let defaults = makeDefaults()
        let settings = ServerSettings(defaults: defaults)
        let url = URL(string: "http://litloft.local:3000")!
        settings.use(url)

        let jar = FakeCookieJar([
            makeCookie(name: "access_token", domain: "litloft.local"),
            makeCookie(name: "NEXT_LOCALE", domain: "litloft.local"),
            makeCookie(name: "access_token", domain: "other.local")
        ])

        await settings.leave(url, jar: jar)

        #expect(settings.serverURL == nil)
        #expect(defaults.string(forKey: "serverURL") == nil)
        #expect(await jar.allCookies().map(\.name).sorted() == ["NEXT_LOCALE", "access_token"])
        #expect(await jar.allCookies().first { $0.name == "access_token" }?.domain == "other.local")
    }

    @Test("forgetting clears the stored address")
    func forget() {
        let defaults = makeDefaults()
        let settings = ServerSettings(defaults: defaults)
        settings.use(URL(string: "http://localhost:3000")!)
        #expect(defaults.string(forKey: "serverURL") == "http://localhost:3000")

        settings.forget()
        #expect(settings.serverURL == nil)
        #expect(defaults.string(forKey: "serverURL") == nil)
    }
}
