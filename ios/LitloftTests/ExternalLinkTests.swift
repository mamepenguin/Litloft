import Foundation
import Testing

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000/")!

private func destination(_ address: String?, current: String? = nil) -> LinkDestination {
    ExternalLink.destination(
        for: address.flatMap { URL(string: $0) },
        server: server,
        current: current.flatMap { URL(string: $0) }
    )
}

@Suite
struct ExternalLinkTests {
    @Test("another site is the system's, whatever it is")
    func otherSites() {
        #expect(destination("https://example.com/article") == .system)
        #expect(destination("http://example.com/article") == .system)
        #expect(destination("https://litloft.local:3000/files/abc") == .system, "another scheme")
        #expect(destination("http://litloft.local:4000/files/abc") == .system, "another port")
        #expect(destination("http://other.local:3000/files/abc") == .system, "another host")
        #expect(destination("mailto:someone@example.com") == .system)
        #expect(destination("tel:+81312345678") == .system)
    }

    @Test("the server's own pages are read in the shell")
    func ownPages() {
        #expect(destination("http://litloft.local:3000/files/abc") == .shell)
        #expect(destination("http://LITLOFT.LOCAL:3000/files/abc") == .shell, "the host is a name, not a string")
        #expect(destination("http://litloft.local:3000/api/files/abc/download") == .shell)
    }

    /// `WKSecurityOrigin` and `URL` disagree about whether a default port is
    /// written down.
    @Test("a default port is the same origin whether or not it is written")
    func defaultPort() {
        let plain = URL(string: "http://litloft.local/")!
        func destination(_ address: String) -> LinkDestination {
            ExternalLink.destination(for: URL(string: address), server: plain, current: nil)
        }

        #expect(destination("http://litloft.local:80/x") == .shell)
        #expect(destination("http://litloft.local/x") == .shell)
    }

    @Test("a link the page neutralised does nothing")
    func neutralised() {
        #expect(destination("javascript:void(0)") == .nothing)
        #expect(destination("data:text/html,<b>hi</b>") == .nothing)
        #expect(destination("about:blank") == .nothing)
        #expect(destination(nil) == .nothing)
        #expect(destination("/files/abc") == .nothing, "no scheme to judge by")
    }

    @Test("a window asking for the page already showing does nothing")
    func samePage() {
        let page = "http://litloft.local:3000/files/abc"
        #expect(destination(page + "#", current: page) == .nothing)
        #expect(destination(page, current: page) == .nothing)
        #expect(destination(page + "#section", current: page + "#other") == .nothing)
        #expect(destination(page, current: "http://litloft.local:3000/files/zzz") == .shell)
        #expect(destination(page + "?t=12", current: page) == .shell, "a different address, not a mark in the page")
    }
}
