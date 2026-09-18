import Foundation
import Testing

@testable import Litloft

private func response(_ disposition: String?) -> URLResponse {
    HTTPURLResponse(
        url: URL(string: "http://litloft.local:3000/api/files/abc/download")!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: disposition.map { ["Content-Disposition": $0] }
    )!
}

@Suite
struct FileDownloadsTests {
    @Test("a file the server sends as an attachment is taken as a download")
    func attachments() {
        #expect(FileDownloads.isAttachment(response("attachment; filename*=UTF-8''note.md")))
        #expect(FileDownloads.isAttachment(response("Attachment")), "the header is not case sensitive")
        #expect(FileDownloads.isAttachment(response(" attachment; filename=\"a.mp4\"")))
    }

    @Test("anything the page is meant to draw is left alone")
    func pages() {
        #expect(!FileDownloads.isAttachment(response("inline")))
        #expect(!FileDownloads.isAttachment(response(nil)))
        #expect(!FileDownloads.isAttachment(URLResponse(
            url: URL(string: "http://litloft.local:3000/files/abc")!,
            mimeType: "text/html",
            expectedContentLength: 0,
            textEncodingName: nil
        )))
    }

    @Test("the file keeps its name, and two of one name do not collide")
    func places() {
        let first = FileDownloads.place(named: "話.mp4")
        let second = FileDownloads.place(named: "話.mp4")

        #expect(first.lastPathComponent == "話.mp4")
        #expect(first != second)
        #expect(FileManager.default.fileExists(atPath: first.deletingLastPathComponent().path))
        #expect(FileDownloads.place(named: "").lastPathComponent == "download", "a file with no name is still a file")
    }

    @MainActor
    @Test("a file that arrives is offered where it was put")
    func offersWhatArrived() {
        let downloads = FileDownloads()
        var offered: [URL] = []
        downloads.offer = { offered.append($0) }
        let place = URL(fileURLWithPath: "/tmp/a/話.mp4")
        let key = ObjectIdentifier(downloads)

        downloads.keep(place, as: key)
        downloads.arrived(key)

        #expect(offered == [place])
    }

    @MainActor
    @Test("a file that never arrives is not offered")
    func offersNothingElse() {
        let downloads = FileDownloads()
        var offered: [URL] = []
        downloads.offer = { offered.append($0) }
        let key = ObjectIdentifier(downloads)

        downloads.keep(URL(fileURLWithPath: "/tmp/a/lost.mp4"), as: key)
        downloads.lost(key)
        downloads.arrived(key)
        downloads.arrived(ObjectIdentifier(FileDownloads()))

        #expect(offered.isEmpty)
    }
}
