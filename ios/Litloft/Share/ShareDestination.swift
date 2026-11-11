import Foundation

/// Where a share will be saved. An empty folder is the drive root.
struct ShareDestination: Equatable, Sendable {
    var drive: String?
    var folder: String
}

/// The Quick Note destination rules, kept per server in the App Group.
enum ShareDestinationResolver {
    static let defaultFolder = "Inbox"

    static func initial(drives: [String], origin: String, defaults: UserDefaults) -> ShareDestination {
        let remembered = defaults.string(forKey: "share.lastDrive.\(origin)")
        let drive: String?
        if let remembered, drives.contains(remembered) {
            drive = remembered
        } else if drives.count == 1 {
            drive = drives[0]
        } else {
            drive = nil
        }
        guard let drive else {
            return ShareDestination(drive: nil, folder: defaultFolder)
        }
        return ShareDestination(drive: drive, folder: folder(for: drive, origin: origin, defaults: defaults))
    }

    static func folder(for drive: String, origin: String, defaults: UserDefaults) -> String {
        guard let stored = defaults.string(forKey: "share.folder.\(origin).\(drive)"),
              QuickNoteFolder.isValid(stored)
        else { return defaultFolder }
        return stored
    }

    static func remember(drive: String, folder: String, origin: String, defaults: UserDefaults) {
        defaults.set(drive, forKey: "share.lastDrive.\(origin)")
        defaults.set(folder, forKey: "share.folder.\(origin).\(drive)")
    }
}

/// Web Quick Note's `isValidQuickNoteFolder`.
enum QuickNoteFolder {
    private static let maxLength = 200

    static func isValid(_ folder: String) -> Bool {
        guard folder.count <= maxLength else { return false }
        if folder.isEmpty { return true }
        for scalar in folder.unicodeScalars {
            if scalar.value < 0x20 || scalar.value == 0x7F { return false }
        }
        if folder.contains("\\") { return false }
        if folder.hasPrefix("/") || folder.hasSuffix("/") { return false }
        return folder.split(separator: "/", omittingEmptySubsequences: false).allSatisfy {
            !$0.isEmpty && $0 != "." && $0 != ".."
        }
    }
}

/// The remembered destination for one server.
struct ShareMemory {
    let defaults: UserDefaults
    let origin: String

    func initial(drives: [String]) -> ShareDestination {
        ShareDestinationResolver.initial(drives: drives, origin: origin, defaults: defaults)
    }

    func folder(for drive: String) -> String {
        ShareDestinationResolver.folder(for: drive, origin: origin, defaults: defaults)
    }

    func remember(drive: String, folder: String) {
        ShareDestinationResolver.remember(drive: drive, folder: folder, origin: origin, defaults: defaults)
    }
}
