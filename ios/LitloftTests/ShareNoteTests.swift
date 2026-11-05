import Foundation
import Testing

@testable import Litloft

private let now = localDate(2026, 8, 13, 9, 4, 5)

struct ShareNoteTests {
    @Test("SPEC-IOS-002 I9: a text note is named by Quick Note's stem, in the folder or at the root", arguments: [
        ("Inbox", "Inbox/会議のメモ.md"),
        ("Notes/2026", "Notes/2026/会議のメモ.md"),
        ("", "会議のメモ.md")
    ])
    func textNotePath(folder: String, path: String) {
        let text = "会議のメモ\n本文"

        #expect(ShareNote.text(text, folder: folder, now: now) == ShareNoteFile(path: path, content: text))
    }

    @Test("SPEC-IOS-002 I9: text with nothing usable for a name takes the time-stamped stem")
    func textNoteFallback() {
        #expect(ShareNote.text("...", folder: "Inbox", now: now).path == "Inbox/note-20260813-090405.md")
    }

    @Test("SPEC-IOS-002 I9: a titled link note is named by the title and holds the title and the URL")
    func titledLinkNote() {
        let url = URL(string: "https://example.com/articles/1?ref=share")!

        let note = ShareNote.link(url, title: "# Weekly review", folder: "Inbox", now: now)

        #expect(note == ShareNoteFile(
            path: "Inbox/Weekly review.md",
            content: "# Weekly review\n\nhttps://example.com/articles/1?ref=share\n"
        ))
    }

    @Test("SPEC-IOS-002 I9: a link note without a usable title is named by the host and the local time", arguments: [
        nil as String?, "..." as String?
    ])
    func untitledLinkNote(title: String?) {
        let url = URL(string: "https://news.example.org/a")!

        let note = ShareNote.link(url, title: title, folder: "", now: now)

        #expect(note.path == "news.example.org 20260813-090405.md")
        let content = title.map { "\($0)\n\nhttps://news.example.org/a\n" } ?? "https://news.example.org/a\n"
        #expect(note.content == content)
    }
}
