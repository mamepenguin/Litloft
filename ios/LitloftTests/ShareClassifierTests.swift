import Foundation
import Testing
import UIKit
import UniformTypeIdentifiers

@testable import Litloft

private func urlProvider(_ string: String, preview: Bool = false) -> NSItemProvider {
    let provider = NSItemProvider(object: URL(string: string)! as NSURL)
    if preview {
        provider.registerDataRepresentation(forTypeIdentifier: UTType.jpeg.identifier, visibility: .all) { done in
            done(Data([0xFF, 0xD8, 0xFF]), nil)
            return nil
        }
    }
    return provider
}

private func textProvider(_ text: String) -> NSItemProvider {
    NSItemProvider(object: text as NSString)
}

private func dataProvider(_ type: UTType) -> NSItemProvider {
    let provider = NSItemProvider()
    provider.registerDataRepresentation(forTypeIdentifier: type.identifier, visibility: .all) { done in
        done(Data([1, 2, 3]), nil)
        return nil
    }
    return provider
}

private func item(
    _ attachments: [NSItemProvider],
    title: String? = nil,
    contentText: String? = nil
) -> NSExtensionItem {
    let item = NSExtensionItem()
    item.attachments = attachments
    item.attributedTitle = title.map(NSAttributedString.init(string:))
    item.attributedContentText = contentText.map(NSAttributedString.init(string:))
    return item
}

struct ShareClassifierTests {
    @Test("SPEC-IOS-002 I3: an http(s) URL makes a link, and its preview image is not saved", arguments: [
        "https://example.com/article", "http://example.com/"
    ])
    func urlWithPreviewIsALink(address: String) async {
        let payload = await ShareClassifier.classify([item([urlProvider(address, preview: true)])])

        #expect(payload == .link(URL(string: address)!, title: nil))
    }

    @Test("SPEC-IOS-002 I3: a link wins over files and text, and only the first URL is saved")
    func linkBeatsFilesAndText() async {
        let photo = dataProvider(.jpeg)
        let payload = await ShareClassifier.classify([
            item([photo, textProvider("note"), urlProvider("https://a.example/1"), urlProvider("https://b.example/2")])
        ])

        #expect(payload == .link(URL(string: "https://a.example/1")!, title: "note"))
    }

    @Test("SPEC-IOS-002 I3: the first URL counts across input items")
    func firstURLAcrossItems() async {
        let payload = await ShareClassifier.classify([
            item([dataProvider(.png)]),
            item([urlProvider("https://first.example/")]),
            item([urlProvider("https://second.example/")])
        ])

        #expect(payload == .link(URL(string: "https://first.example/")!, title: nil))
    }

    @Test("SPEC-IOS-002 I3: a URL that is not http(s) is not a link")
    func fileURLIsAFile() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("shared-\(UUID().uuidString).pdf")
        try Data("%PDF-1.4".utf8).write(to: file)
        let provider = NSItemProvider(object: file as NSURL)

        let payload = await ShareClassifier.classify([item([provider, textProvider("caption")])])

        #expect(payload == .files([provider]))
    }

    @Test("SPEC-IOS-002 I3: images, movies, PDFs and web archives are files, in the order shared", arguments: [
        UTType.jpeg, UTType.heic, UTType.quickTimeMovie, UTType.pdf, UTType.webArchive
    ])
    func dataTypesAreFiles(type: UTType) async {
        let first = dataProvider(type)
        let second = dataProvider(.png)

        let payload = await ShareClassifier.classify([item([first, textProvider("not saved"), second])])

        #expect(payload == .files([first, second]))
    }

    @Test("SPEC-IOS-002 I3: several text attachments are joined with one empty line")
    func textsAreJoined() async {
        let payload = await ShareClassifier.classify([
            item([textProvider("first"), textProvider("second")]),
            item([textProvider("third")])
        ])

        #expect(payload == .text("first\n\nsecond\n\nthird"))
    }

    @Test("SPEC-IOS-002 I3: rich text is saved as its plain text")
    func richTextIsPlain() async {
        let rich = NSAttributedString(string: "Bold words", attributes: [.font: UIFont.boldSystemFont(ofSize: 20)])
        let payload = await ShareClassifier.classify([item([NSItemProvider(object: rich)])])

        #expect(payload == .text("Bold words"))
    }

    @Test("SPEC-IOS-002 I3: shared text is kept byte for byte")
    func textIsUnchanged() async {
        let text = "  先頭の空白\r\n\t末尾\n\n"
        let payload = await ShareClassifier.classify([item([textProvider(text)])])

        #expect(payload == .text(text))
    }

    @Test("SPEC-IOS-002: the item's content text is the text when nothing else is text or a URL")
    func contentTextCountsAsText() async {
        #expect(await ShareClassifier.classify([item([], contentText: "caption")]) == .text("caption"))
        #expect(await ShareClassifier.classify([item([textProvider("body")], contentText: "caption")]) == .text("body"))
        let photo = dataProvider(.jpeg)
        #expect(await ShareClassifier.classify([item([photo], contentText: "caption")]) == .files([photo]))
    }

    @Test("SPEC-IOS-002 I3: a share with nothing usable is nothing")
    func nothingUsable() async {
        #expect(await ShareClassifier.classify([item([dataProvider(.folder)], contentText: "")]) == .nothing)
        #expect(await ShareClassifier.classify([item([dataProvider(.folder)], contentText: "caption")]) == .text("caption"))
    }

    @Test("SPEC-IOS-002: the clip title is the first single-line candidate of at most 200 characters", arguments: [
        ("  Page title  ", "caption", ["note"], "Page title" as String?),
        (nil, " caption ", ["note"], "caption" as String?),
        ("two\nlines", "caption", ["note"], "caption" as String?),
        (String(repeating: "t", count: 201), nil, ["from attachment"], "from attachment" as String?),
        (String(repeating: "t", count: 200), nil, [], String(repeating: "t", count: 200) as String?),
        ("   ", "", [], nil as String?),
        (nil, nil, ["line one\nline two"], nil as String?)
    ])
    func clipTitle(title: String?, contentText: String?, texts: [String], expected: String?) async {
        let attachments = texts.map(textProvider) + [urlProvider("https://example.com/a")]
        let payload = await ShareClassifier.classify([item(attachments, title: title, contentText: contentText)])

        #expect(payload == .link(URL(string: "https://example.com/a")!, title: expected))
    }
}
