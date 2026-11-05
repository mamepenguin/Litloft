import Foundation
import Testing

@testable import Litloft

/// The table the web side's `quickNoteFilename` tests also read.
private enum FilenameFixture {
    struct Row: Decodable, Sendable {
        struct Local: Decodable, Sendable {
            let year, month, day, hour, minute, second: Int
        }

        let body: String
        let local: Local
        let stem: String

        var testDescription: String {
            String(body.debugDescription.prefix(40))
        }

        var date: Date {
            localDate(local.year, local.month, local.day, local.hour, local.minute, local.second)
        }
    }

    static let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("frontend/src/components/quick-note/__tests__/fixtures/quick-note-filenames.json")

    static let rows: [Row] = (try? JSONDecoder().decode([Row].self, from: Data(contentsOf: url))) ?? []
}

struct QuickNoteFilenameTests {
    @Test("SPEC-IOS-002 I9: the stem equals web Quick Note's for every row of the shared table")
    func stemMatchesTheWeb() throws {
        try #require(FilenameFixture.rows.count > 20)
        for row in FilenameFixture.rows {
            #expect(QuickNoteFilename.stem(for: row.body, at: row.date) == row.stem, "\(row.testDescription)")
        }
    }
}
