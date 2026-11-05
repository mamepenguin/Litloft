import Foundation
import Observation

#if !SHARE_EXTENSION
@testable import Litloft
#endif

enum ShareSheetState: Equatable {
    case loading
    case resolvingKind
    case needsDrive
    case ready
    case blocked(ShareMessage)
    case nothingToSave
    case textTooLarge(bytes: Int)
    case sending
    case stopped(ShareMessage)
    case finishedWithFailures
    case saved
    case closed
}

enum ShareLinkKind: Equatable {
    case webClip
    case linkNote
}

/// What the sheet shows and what it sends, kept away from the view.
@MainActor
@Observable
final class ShareSheetModel {
    private static let textLimit = 1_048_576

    let payload: SharePayload
    private let session: SharedSession
    private let timeouts: ShareTimeouts

    private(set) var state: ShareSheetState = .loading
    private(set) var destination = ShareDestination(drive: nil, folder: ShareDestinationResolver.defaultFolder)
    private(set) var drives: [String] = []
    private(set) var showsLockedHint = false
    private(set) var linkKind: ShareLinkKind = .linkNote
    private(set) var queue: ShareSendQueue?

    private var client: ShareAPIClient?
    private var origin = ""

    init(payload: SharePayload, session: SharedSession, timeouts: ShareTimeouts = .standard) {
        self.payload = payload
        self.session = session
        self.timeouts = timeouts
    }

    var canSave: Bool {
        state == .ready && destination.drive != nil
    }

    var statuses: [ShareItemStatus] {
        queue?.statuses ?? []
    }

    func load() async {
        if case .text(let text) = payload, text.utf8.count > Self.textLimit {
            state = .textTooLarge(bytes: text.utf8.count)
            return
        }
        if case .nothing = payload {
            state = .nothingToSave
            return
        }
        guard let address = session.defaults.string(forKey: "share.server"),
              let server = ServerAddress.parse(address)
        else {
            state = .blocked(.connectFirst)
            return
        }

        origin = SessionItem.origin(of: server)
        let item = session.readItem()
        let matches = item?.origin == origin
        let token = matches ? item?.accessToken : nil
        let viewer = matches ? item?.viewer : nil
        let client = ShareAPIClient(server: server, accessToken: token, viewer: viewer, timeouts: timeouts)
        self.client = client

        let loaded: ([String], ShareAuthStatus)
        do {
            async let drives = client.drives()
            async let auth = client.authStatus()
            loaded = try await (drives, auth)
        } catch {
            state = .blocked(LocalNetworkStatus.denied ? .localNetworkDenied : .cannotReach)
            return
        }
        drives = loaded.0
        showsLockedHint = loaded.1.hasProtectedDrives && loaded.1.unlockedGroups.isEmpty
        guard !drives.isEmpty else {
            state = .blocked(.noDrives)
            return
        }

        destination = ShareDestinationResolver.initial(
            drives: drives,
            origin: origin,
            defaults: session.defaults
        )
        guard let drive = destination.drive else {
            state = .needsDrive
            return
        }
        if case .link = payload {
            await resolveKind(drive: drive)
        } else {
            state = .ready
        }
    }

    func pickDrive(_ drive: String) async {
        guard drives.contains(drive) else { return }
        destination = ShareDestination(
            drive: drive,
            folder: ShareDestinationResolver.folder(for: drive, origin: origin, defaults: session.defaults)
        )
        if case .link = payload {
            await resolveKind(drive: drive)
        } else {
            state = .ready
        }
    }

    func pickFolder(_ folder: String) {
        guard QuickNoteFolder.isValid(folder) else { return }
        destination.folder = folder
    }

    func loadFolders(root: String) async throws -> [String] {
        guard let client, let drive = destination.drive else { return [] }
        var folders = try await client.folders(drive: drive, root: root)
        if root.isEmpty && !folders.contains(ShareDestinationResolver.defaultFolder) {
            folders.insert(ShareDestinationResolver.defaultFolder, at: 0)
        }
        return folders
    }

    func save() async {
        guard canSave, let drive = destination.drive, let client else { return }
        let items = shareItems()
        let queue = ShareSendQueue(
            items: items,
            destination: ShareDestination(drive: drive, folder: destination.folder),
            client: client,
            memory: ShareMemory(defaults: session.defaults, origin: origin),
            polling: .standard,
            now: { Date() }
        )
        self.queue = queue
        state = .sending
        await queue.send()
        switch queue.state {
        case .saved:
            state = .saved
        case .stopped(let message):
            state = .stopped(message)
        case .finishedWithFailures:
            state = .finishedWithFailures
        case .closed:
            state = .closed
        default:
            state = .finishedWithFailures
        }
    }

    func retry() async {
        guard let queue else { return }
        state = .sending
        await queue.retry()
        state = state(after: queue)
    }

    func retryItem(at index: Int) async {
        guard let queue else { return }
        state = .sending
        await queue.retryItem(at: index)
        state = state(after: queue)
    }

    func saveAsLink(at index: Int) async {
        guard let queue else { return }
        state = .sending
        await queue.saveAsLink(at: index)
        state = state(after: queue)
    }

    func cancel() async {
        guard let queue else {
            state = .closed
            return
        }
        await queue.cancel()
        state = .closed
    }

    func pickDriveForQueue(_ drive: String) {
        queue?.pickDrive(drive)
        destination = queue?.destination ?? destination
        state = .sending
    }

    private func state(after queue: ShareSendQueue) -> ShareSheetState {
        switch queue.state {
        case .saved: return .saved
        case .stopped(let message): return .stopped(message)
        case .closed: return .closed
        default: return .finishedWithFailures
        }
    }

    private func resolveKind(drive: String) async {
        state = .resolvingKind
        guard let client, client.viewer != nil else {
            linkKind = .linkNote
            state = .ready
            return
        }
        if let available = try? await client.knowledgeAvailable(drive: drive) {
            linkKind = available ? .webClip : .linkNote
        } else {
            linkKind = .linkNote
        }
        state = .ready
    }

    private func shareItems() -> [ShareItem] {
        switch payload {
        case .text(let text):
            return [.text(text)]
        case .files(let providers):
            return providers.map { .file($0) }
        case .link(let url, let title):
            return linkKind == .webClip ? [.webClip(url, title: title)] : [.linkNote(url, title: title)]
        case .nothing:
            return []
        }
    }
}
