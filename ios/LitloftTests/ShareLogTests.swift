import Foundation
import Testing

@testable import Litloft

private let base = "http://litloft.local:3000"

struct ShareLogTests {
    @Test("SPEC-IOS-002 I10: a logged path keeps the template and drops every name, id and query", arguments: [
        ("/api/drives", "/api/drives"),
        ("/api/auth/status", "/api/auth/status"),
        ("/api/addons/status?drive=My%20Drive", "/api/addons/status"),
        ("/api/drives/My%20Drive/folder-tree?root=Secret%20Folder", "/api/drives/{drive}/folder-tree"),
        ("/api/drives/My%20Drive/upload/init", "/api/drives/{drive}/upload/init"),
        ("/api/drives/My%20Drive/upload/abc123/chunk", "/api/drives/{drive}/upload/{id}/chunk"),
        ("/api/drives/My%20Drive/upload/abc123/complete", "/api/drives/{drive}/upload/{id}/complete"),
        ("/api/drives/My%20Drive/upload/abc123", "/api/drives/{drive}/upload/{id}"),
        ("/api/drives/My%20Drive/files", "/api/drives/{drive}/files"),
        ("/api/drives/My%20Drive/files/by-path?path=Inbox%2Fdiary.md", "/api/drives/{drive}/files/by-path"),
        ("/api/addons/knowledge/clips", "/api/addons/knowledge/clips")
    ])
    func pathTemplate(path: String, template: String) {
        #expect(ShareLog.pathTemplate(for: URL(string: base + path)!) == template)
    }

    @Test("SPEC-IOS-002 I10: a log entry has the method, the template and the outcome, and nothing shared")
    func entryCarriesNoContent() {
        let url = URL(string: base + "/api/drives/Family%20Photos/files/by-path?path=Inbox%2Fdiary.md")!

        let failed = ShareLog.entry(method: "GET", url: url, status: 500, error: nil)
        #expect(failed.contains("GET"))
        #expect(failed.contains("/api/drives/{drive}/files/by-path"))
        #expect(failed.contains("500"))

        let lost = ShareLog.entry(method: "POST", url: url, status: nil, error: .timedOut)
        #expect(lost.contains(String(URLError.Code.timedOut.rawValue)))

        for entry in [failed, lost] {
            for secret in ["Family", "Photos", "diary", "Inbox", "litloft.local", "path="] {
                #expect(!entry.contains(secret), "\(secret)")
            }
        }
    }
}
