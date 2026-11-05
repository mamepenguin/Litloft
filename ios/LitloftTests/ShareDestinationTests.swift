import Foundation
import Testing

@testable import Litloft

private let origin = "http://litloft.local:3000"

struct ShareDestinationTests {
    private func makeDefaults(_ values: [String: String] = [:]) -> UserDefaults {
        let defaults = UserDefaults(suiteName: "ShareDestinationTests-\(UUID().uuidString)")!
        values.forEach { defaults.set($0.value, forKey: $0.key) }
        return defaults
    }

    @Test("SPEC-IOS-002 I4: the remembered drive is chosen when it is listed")
    func rememberedDriveListed() {
        let defaults = makeDefaults(["share.lastDrive.\(origin)": "Notes"])

        let destination = ShareDestinationResolver.initial(drives: ["Photos", "Notes"], origin: origin, defaults: defaults)

        #expect(destination == ShareDestination(drive: "Notes", folder: "Inbox"))
    }

    @Test("SPEC-IOS-002 I4: a remembered drive that is not listed is never preselected", arguments: [
        (["Photos", "Notes"], nil as String?),
        (["Photos"], "Photos" as String?)
    ])
    func rememberedDriveNotListed(drives: [String], expected: String?) {
        let defaults = makeDefaults(["share.lastDrive.\(origin)": "Locked"])

        let destination = ShareDestinationResolver.initial(drives: drives, origin: origin, defaults: defaults)

        #expect(destination.drive == expected)
        #expect(destination.folder == "Inbox")
    }

    @Test("SPEC-IOS-002: the remembered drive belongs to its server")
    func rememberedDriveIsPerServer() {
        let defaults = makeDefaults([
            "share.lastDrive.http://other.local:3000": "Notes",
            "share.lastDrive.\(origin)": "Photos"
        ])

        let destination = ShareDestinationResolver.initial(drives: ["Photos", "Notes"], origin: origin, defaults: defaults)

        #expect(destination.drive == "Photos")
    }

    @Test("SPEC-IOS-002: with no memory, one drive is chosen and several or none leave the choice open", arguments: [
        ([], nil as String?),
        (["Only"], "Only" as String?),
        (["A", "B"], nil as String?)
    ])
    func noMemory(drives: [String], expected: String?) {
        let destination = ShareDestinationResolver.initial(drives: drives, origin: origin, defaults: makeDefaults())

        #expect(destination == ShareDestination(drive: expected, folder: "Inbox"))
    }

    @Test("SPEC-IOS-002 I4: a remembered folder is used when valid, and Inbox otherwise", arguments: [
        ("Captures/2026" as String?, "Captures/2026"),
        ("" as String?, ""),
        (nil as String?, "Inbox"),
        ("../escape" as String?, "Inbox"),
        ("/absolute" as String?, "Inbox"),
        ("double//slash" as String?, "Inbox")
    ])
    func rememberedFolder(stored: String?, expected: String) {
        var values = ["share.folder.\(origin).Photos": "Valid/Elsewhere"]
        if let stored { values["share.folder.\(origin).Notes"] = stored }
        let defaults = makeDefaults(values)

        #expect(ShareDestinationResolver.folder(for: "Notes", origin: origin, defaults: defaults) == expected)
        #expect(ShareDestinationResolver.folder(for: "Photos", origin: origin, defaults: defaults) == "Valid/Elsewhere")
    }

    @Test("SPEC-IOS-002 I4: the remembered drive and folder are read back for the same server only")
    func rememberRoundTrips() {
        let defaults = makeDefaults()

        ShareDestinationResolver.remember(drive: "Notes", folder: "Clips", origin: origin, defaults: defaults)

        #expect(defaults.string(forKey: "share.lastDrive.\(origin)") == "Notes")
        #expect(defaults.string(forKey: "share.folder.\(origin).Notes") == "Clips")
        #expect(ShareDestinationResolver.initial(drives: ["Photos", "Notes"], origin: origin, defaults: defaults)
            == ShareDestination(drive: "Notes", folder: "Clips"))
        #expect(ShareDestinationResolver.initial(drives: ["Photos", "Notes"], origin: "http://other.local:3000", defaults: defaults)
            == ShareDestination(drive: nil, folder: "Inbox"))
    }

    @Test("SPEC-IOS-002: the folder check is web Quick Note's", arguments: [
        ("Inbox", true),
        ("Inbox/2026", true),
        ("", true),
        ("../escape", false),
        ("Inbox/../../etc", false),
        ("./here", false),
        ("/absolute", false),
        ("trailing/", false),
        ("double//slash", false),
        ("back\\slash", false),
        (String(repeating: "a", count: 300), false),
        ("Inbox\u{0}", false)
    ])
    func folderCheck(folder: String, valid: Bool) {
        #expect(QuickNoteFolder.isValid(folder) == valid)
        #expect(QuickNoteFolder.isValid("Inbox"))
    }
}
