import Foundation

#if !SHARE_EXTENSION
@testable import Litloft
#endif

/// The path and content a text or link-note create sends.
struct ShareNoteFile: Equatable {
    var path: String
    var content: String
}

enum ShareNote {
    static func text(_ text: String, folder: String, now: Date) -> ShareNoteFile {
        let stem = QuickNoteFilename.stem(for: text, at: now)
        return ShareNoteFile(path: path(stem: stem, folder: folder), content: text)
    }

    static func link(_ url: URL, title: String?, folder: String, now: Date) -> ShareNoteFile {
        let timestamp = QuickNoteFilename.timestamp(now)
        let stem = title.map { QuickNoteFilename.stem(for: $0, at: now) }
        let usable = stem.flatMap { $0 == "note-\(timestamp)" ? nil : $0 }
        let name = usable ?? "\(url.host() ?? "") \(timestamp)"
        let content = title.map { "\($0)\n\n\(url.absoluteString)\n" } ?? "\(url.absoluteString)\n"
        return ShareNoteFile(path: path(stem: name, folder: folder), content: content)
    }

    private static func path(stem: String, folder: String) -> String {
        folder.isEmpty ? "\(stem).md" : "\(folder)/\(stem).md"
    }
}
