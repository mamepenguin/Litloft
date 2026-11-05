import Foundation
import Observation
import UniformTypeIdentifiers

#if !SHARE_EXTENSION
@testable import Litloft
#endif

enum ShareItem {
    case file(NSItemProvider)
    case text(String)
    case webClip(URL, title: String?)
    case linkNote(URL, title: String?)
}

/// Every message the sheet can show.
enum ShareMessage: Equatable, Sendable {
    case connectFirst
    case cannotReach
    case localNetworkDenied
    case noDrives
    case lockedHint
    case foldersNotLoaded
    case nothingToSave
    case textTooLarge
    case fileTooLarge(limitGB: Int?)
    case diskFull
    case tooManyWithThisName
    case driveNotAvailable
    case clipUnavailable
    case unknown
    case checking
    case preparing
    case waiting
    case genericFailure
    case saved
}

enum ShareOffer: Equatable, Sendable {
    case retry
    case saveAgain
    case saveAsLink
    case openSettings
}

enum ShareItemState: Equatable, Sendable {
    case waiting
    case preparing
    case sending
    case saved
    case failed(ShareMessage)
    case checking
    case unknown
}

struct ShareItemStatus: Equatable, Sendable {
    var name: String
    var state: ShareItemState
    var offers: [ShareOffer]
}

enum ShareQueueState: Equatable, Sendable {
    case idle
    case sending
    case stopped(ShareMessage)
    case finishedWithFailures
    case saved
    case closing
    case closed
}

/// How long an unanswered `/complete` is looked for at its target path.
struct CompletePolling: Equatable, Sendable {
    var interval: Duration
    var base: Duration
    var perFiftyMiB: Duration

    static let standard = CompletePolling(
        interval: .seconds(5),
        base: .seconds(120),
        perFiftyMiB: .seconds(1)
    )

    func window(forFileSize bytes: Int64) -> Duration {
        let block: Int64 = 50 * 1_024 * 1_024
        // A partial block still gets the time it takes at the spec's rate.
        let blocks = bytes <= 0 ? 0 : (bytes + block - 1) / block
        return base + perFiftyMiB * Int(blocks)
    }
}

/// Sends one share's items in order, one at a time.
@MainActor
@Observable
final class ShareSendQueue {
    private enum Attempt {
        case first
        case again
    }

    private enum Phase {
        case idle
        case preparing
        case initUpload
        case chunk
        case complete
        case polling
        case create
        case clip
    }

    private enum Outcome: Error {
        case saved
        case failed(ShareMessage)
        case unknown
        case stopped(ShareMessage)
        case cancelled
    }

    private struct PreparedFile {
        var url: URL
        var isTemporary: Bool
        var name: String
        var size: Int
    }

    private var items: [ShareItem]
    private let client: ShareAPIClient
    private let memory: ShareMemory
    private let polling: CompletePolling
    private let now: () -> Date

    private(set) var destination: ShareDestination
    private(set) var state: ShareQueueState = .idle
    private(set) var statuses: [ShareItemStatus]

    private var phase: Phase = .idle
    private var cancelling = false
    private let chunkSize = 5 * 1_024 * 1_024
    private let temporaryDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent("LitloftShare", isDirectory: true)

    init(
        items: [ShareItem],
        destination: ShareDestination,
        client: ShareAPIClient,
        memory: ShareMemory,
        polling: CompletePolling,
        now: @escaping () -> Date
    ) {
        self.items = items
        self.destination = destination
        self.client = client
        self.memory = memory
        self.polling = polling
        self.now = now
        statuses = items.enumerated().map { index, item in
            ShareItemStatus(
                name: Self.displayName(of: item, position: index + 1, now: now(), folder: destination.folder),
                state: .waiting,
                offers: []
            )
        }
    }

    // MARK: sending

    func send() async {
        switch state {
        case .sending, .closing, .closed:
            return
        default:
            break
        }
        if statuses.allSatisfy({ $0.state == .saved }) { return }
        await run(statuses.indices.filter { statuses[$0].state != .saved }, attempt: .first)
    }

    func retry() async {
        switch state {
        case .sending, .closing, .closed:
            return
        default:
            break
        }
        await run(statuses.indices.filter { statuses[$0].state != .saved }, attempt: .first)
    }

    func retryItem(at index: Int) async {
        guard statuses.indices.contains(index), state != .closing, state != .closed else { return }
        let attempt: Attempt = statuses[index].state == .unknown ? .again : .first
        await run([index], attempt: attempt)
    }

    func saveAsLink(at index: Int) async {
        guard case .webClip(let url, let title)? = item(at: index) else { return }
        items[index] = .linkNote(url, title: title)
        statuses[index].state = .waiting
        statuses[index].offers = []
        await run([index], attempt: .first)
    }

    func pickDrive(_ drive: String) {
        destination = ShareDestination(drive: drive, folder: memory.folder(for: drive))
    }

    func cancel() async {
        guard state == .sending || state == .closing else {
            if state != .closed { state = .closed }
            return
        }
        cancelling = true
        state = .closing
        switch phase {
        case .chunk, .complete, .polling:
            client.cancelInFlight()
        default:
            break
        }
    }

    private func item(at index: Int) -> ShareItem? {
        statuses.indices.contains(index) ? items[index] : nil
    }

    private func run(_ indices: [Int], attempt: Attempt) async {
        state = .sending
        for index in indices {
            if cancelling {
                close()
                return
            }
            guard statuses[index].state != .saved else { continue }
            let outcome = await sendItem(at: index, attempt: attempt)
            switch outcome {
            case .saved:
                statuses[index].state = .saved
                statuses[index].offers = []
            case .unknown:
                statuses[index].state = .unknown
                statuses[index].offers = [.saveAgain]
            case .failed(let message):
                statuses[index].state = .failed(message)
                statuses[index].offers = offers(for: message)
            case .stopped(let message):
                statuses[index].state = .failed(message)
                statuses[index].offers = offers(for: message)
                let remaining = indices.filter { $0 > index && statuses[$0].state != .saved }
                for later in remaining {
                    statuses[later].state = .waiting
                    statuses[later].offers = []
                }
                state = .stopped(message)
                return
            case .cancelled:
                close()
                return
            }
        }
        finish()
    }

    private func finish() {
        if statuses.allSatisfy({ $0.state == .saved }), let drive = destination.drive {
            memory.remember(drive: drive, folder: destination.folder)
            state = .saved
            return
        }
        state = .finishedWithFailures
    }

    private func close() {
        state = .closed
        phase = .idle
    }

    private func offers(for message: ShareMessage) -> [ShareOffer] {
        switch message {
        case .clipUnavailable:
            return [.saveAsLink, .retry]
        default:
            return [.retry]
        }
    }

    // MARK: one item

    private func sendItem(at index: Int, attempt: Attempt) async -> Outcome {
        switch items[index] {
        case .text(let text):
            return await createNote(ShareNote.text(text, folder: destination.folder, now: now()), at: index)
        case .linkNote(let url, let title):
            return await createNote(ShareNote.link(url, title: title, folder: destination.folder, now: now()), at: index)
        case .webClip(let url, let title):
            return await sendClip(url: url, title: title, at: index)
        case .file(let provider):
            return await sendFile(provider, at: index, attempt: attempt)
        }
    }

    private func createNote(_ note: ShareNoteFile, at index: Int) async -> Outcome {
        guard let drive = destination.drive else { return .failed(.driveNotAvailable) }
        phase = .create
        statuses[index].state = .sending
        do {
            let response = try await client.createFile(drive: drive, path: note.path, content: note.content)
            if cancelling { return .cancelled }
            if (200...299).contains(response.status) { return .saved }
            if response.status == 403 || response.status == 404 { return .stopped(.driveNotAvailable) }
            return .failed(.genericFailure)
        } catch let error as ShareAPIError {
            if cancelling { return .cancelled }
            return outcome(for: error, unanswered: .unknown)
        } catch {
            return .failed(.genericFailure)
        }
    }

    private func sendClip(url: URL, title: String?, at index: Int) async -> Outcome {
        guard let drive = destination.drive else { return .failed(.driveNotAvailable) }
        phase = .clip
        statuses[index].state = .sending
        do {
            let subfolder = destination.folder.isEmpty ? nil : destination.folder
            let response = try await client.createClip(drive: drive, url: url, subfolder: subfolder, title: title)
            if cancelling { return .cancelled }
            switch response.status {
            case 200...299:
                return .saved
            case 400, 401, 404, 422, 503:
                return .failed(.clipUnavailable)
            case 403:
                return .stopped(.driveNotAvailable)
            case 502, 504:
                return .unknown
            default:
                return .failed(.genericFailure)
            }
        } catch let error as ShareAPIError {
            if cancelling { return .cancelled }
            return outcome(for: error, unanswered: .unknown)
        } catch {
            return .failed(.genericFailure)
        }
    }

    private func sendFile(_ provider: NSItemProvider, at index: Int, attempt: Attempt) async -> Outcome {
        guard let drive = destination.drive else { return .failed(.driveNotAvailable) }

        phase = .preparing
        statuses[index].state = .preparing
        let prepared: PreparedFile
        do {
            prepared = try await prepare(provider, position: index + 1)
        } catch {
            return .failed(.genericFailure)
        }
        defer {
            if prepared.isTemporary {
                try? FileManager.default.removeItem(at: prepared.url)
            }
        }
        statuses[index].name = prepared.name
        if cancelling { return .cancelled }

        var filename = prepared.name
        var uploadID: String
        phase = .initUpload
        statuses[index].state = .sending

        var suffix = 0
        while true {
            let response: ShareResponse
            do {
                response = try await client.initUpload(
                    drive: drive,
                    filename: filename,
                    fileSize: prepared.size,
                    folder: destination.folder,
                    chunkSize: chunkSize
                )
            } catch let error as ShareAPIError {
                if cancelling { return .cancelled }
                return outcome(for: error, unanswered: .failed(.genericFailure))
            } catch {
                return .failed(.genericFailure)
            }
            if cancelling {
                if (200...299).contains(response.status), let id = uploadSessionID(from: response) {
                    await client.deleteUpload(drive: drive, uploadID: id)
                }
                return .cancelled
            }

            if (200...299).contains(response.status) {
                guard let id = uploadSessionID(from: response) else { return .failed(.genericFailure) }
                uploadID = id
                break
            }
            if response.status == 409 {
                guard detail(of: response) == "File already exists" else {
                    return .failed(.genericFailure)
                }
                if attempt == .again {
                    // The earlier attempt landed after all.
                    return .saved
                }
                guard suffix < 99 else { return .failed(.tooManyWithThisName) }
                suffix += 1
                filename = Self.suffixed(prepared.name, suffix)
                continue
            }
            if response.status == 400 {
                return .failed(.fileTooLarge(limitGB: Self.sizeLimit(from: detail(of: response))))
            }
            if response.status == 507 {
                return .failed(.diskFull)
            }
            if response.status == 403 || response.status == 404 {
                return .stopped(.driveNotAvailable)
            }
            return .failed(.genericFailure)
        }

        // The upload is open; a failure from here deletes it.
        let uploaded = await sendChunks(
            drive: drive,
            uploadID: uploadID,
            url: prepared.url,
            size: prepared.size,
            index: index,
            filename: filename
        )
        if case .failure(let outcome) = uploaded { return outcome }
        if cancelling {
            await client.deleteUpload(drive: drive, uploadID: uploadID)
            return .cancelled
        }

        phase = .complete
        statuses[index].state = .sending
        let target = destination.folder.isEmpty ? filename : "\(destination.folder)/\(filename)"
        do {
            let response = try await client.complete(drive: drive, uploadID: uploadID)
            if cancelling { return .cancelled }
            if (200...299).contains(response.status) { return .saved }
            if response.status == 403 || response.status == 404 { return .stopped(.driveNotAvailable) }
            return .failed(.genericFailure)
        } catch let error as ShareAPIError {
            if cancelling { return .cancelled }
            if case .transport(let code) = error, Self.isUnreachable(code) {
                return .stopped(.cannotReach)
            }
        } catch {
            return .failed(.genericFailure)
        }

        // The server received `/complete` but no answer came back.
        if Self.isSidecar(filename) { return .unknown }
        if cancelling { return .cancelled }
        return await pollForFile(drive: drive, path: target, size: prepared.size, index: index)
    }

    private func sendChunks(
        drive: String,
        uploadID: String,
        url: URL,
        size: Int,
        index: Int,
        filename: String
    ) async -> Result<Void, Outcome> {
        phase = .chunk
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            await client.deleteUpload(drive: drive, uploadID: uploadID)
            return .failure(.failed(.genericFailure))
        }
        defer { try? handle.close() }

        var sent = 0
        var chunkIndex = 0
        while sent < size {
            if cancelling {
                await client.deleteUpload(drive: drive, uploadID: uploadID)
                return .failure(.cancelled)
            }
            let data: Data
            do {
                data = try handle.read(upToCount: min(chunkSize, size - sent)) ?? Data()
            } catch {
                await client.deleteUpload(drive: drive, uploadID: uploadID)
                return .failure(.failed(.genericFailure))
            }
            if data.isEmpty { break }
            do {
                let response = try await client.chunk(drive: drive, uploadID: uploadID, index: chunkIndex, data: data)
                if cancelling {
                    await client.deleteUpload(drive: drive, uploadID: uploadID)
                    return .failure(.cancelled)
                }
                if !(200...299).contains(response.status) {
                    await client.deleteUpload(drive: drive, uploadID: uploadID)
                    if response.status == 403 || response.status == 404 {
                        return .failure(.stopped(.driveNotAvailable))
                    }
                    return .failure(.failed(.genericFailure))
                }
            } catch let error as ShareAPIError {
                await client.deleteUpload(drive: drive, uploadID: uploadID)
                if cancelling { return .failure(.cancelled) }
                if case .transport(let code) = error {
                    if Self.isUnreachable(code) { return .failure(.stopped(.cannotReach)) }
                }
                return .failure(.failed(.genericFailure))
            } catch {
                await client.deleteUpload(drive: drive, uploadID: uploadID)
                return .failure(.failed(.genericFailure))
            }
            sent += data.count
            chunkIndex += 1
        }
        return .success(())
    }

    private func pollForFile(drive: String, path: String, size: Int, index: Int) async -> Outcome {
        phase = .polling
        statuses[index].state = .checking
        let deadline = ContinuousClock.now + polling.window(forFileSize: Int64(size))
        while ContinuousClock.now < deadline {
            if cancelling {
                client.cancelInFlight()
                return .cancelled
            }
            if let found = try? await client.byPath(drive: drive, path: path), found {
                return .saved
            }
            if cancelling { return .cancelled }
            try? await Task.sleep(for: polling.interval)
        }
        return .unknown
    }

    private func outcome(for error: ShareAPIError, unanswered: Outcome) -> Outcome {
        guard case .transport(let code) = error else { return .failed(.genericFailure) }
        if LocalNetworkStatus.denied { return .stopped(.localNetworkDenied) }
        if Self.isUnreachable(code) { return .stopped(.cannotReach) }
        return unanswered
    }

    private static func isUnreachable(_ code: URLError.Code) -> Bool {
        switch code {
        case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .notConnectedToInternet,
             .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateHasUnknownRoot:
            return true
        default:
            return false
        }
    }

    // MARK: files

    private func prepare(_ provider: NSItemProvider, position: Int) async throws -> PreparedFile {
        let source = try await fileURL(provider)
        let attributes = try FileManager.default.attributesOfItem(atPath: source.url.path)
        let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
        let ext = source.url.pathExtension
        let suggested = provider.suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let name: String
        if let suggested, !suggested.isEmpty {
            let stem = (suggested as NSString).deletingPathExtension
            name = ext.isEmpty ? suggested : "\(stem).\(ext)"
        } else {
            let stamp = QuickNoteFilename.timestamp(now())
            name = "shared-\(stamp)-\(position)" + (ext.isEmpty ? "" : ".\(ext)")
        }
        return PreparedFile(url: source.url, isTemporary: source.isTemporary, name: name, size: size)
    }

    private func fileURL(_ provider: NSItemProvider) async throws -> (url: URL, isTemporary: Bool) {
        if let url = await loadObjectURL(provider), url.isFileURL {
            return (url, false)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            var stale = false
            if let item = await loadItem(provider, UTType.fileURL.identifier) {
                if let url = item as? URL { return (url, false) }
                if let url = item as? NSURL { return (url as URL, false) }
                if let data = item as? Data {
                    if let url = try? URL(
                        resolvingBookmarkData: data,
                        options: [],
                        relativeTo: nil,
                        bookmarkDataIsStale: &stale
                    ) {
                        return (url, false)
                    }
                    if let url = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NSURL.self, from: data) {
                        return (url as URL, false)
                    }
                }
            }
        }

        guard let type = provider.registeredTypeIdentifiers.first(where: { identifier in
            guard let type = UTType(identifier) else { return false }
            return !type.conforms(to: .url) && !type.conforms(to: .text)
        }) else {
            throw ShareAPIError.transport(.unsupportedURL)
        }

        if let inPlace = await loadInPlace(provider, type) {
            return (inPlace, false)
        }
        if let copied = await loadRepresentation(provider, type) {
            return (copied, true)
        }
        throw ShareAPIError.transport(.cannotDecodeContentData)
    }

    private func loadInPlace(_ provider: NSItemProvider, _ type: String) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadInPlaceFileRepresentation(forTypeIdentifier: type) { url, isInPlace, _ in
                continuation.resume(returning: isInPlace ? url : nil)
            }
        }
    }

    private func loadObjectURL(_ provider: NSItemProvider) async -> URL? {
        guard provider.canLoadObject(ofClass: NSURL.self) else { return nil }
        let box = await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: NSURL.self) { object, _ in
                continuation.resume(returning: ShareItemBox(object as? NSSecureCoding))
            }
        }
        return (box.value as? NSURL) as URL?
    }

    private func loadRepresentation(_ provider: NSItemProvider, _ type: String) async -> URL? {
        try? FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        return await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                guard let url else {
                    continuation.resume(returning: nil)
                    return
                }
                let destination = self.temporaryDirectory
                    .appendingPathComponent("\(UUID().uuidString)-\(url.lastPathComponent)")
                do {
                    try FileManager.default.copyItem(at: url, to: destination)
                    continuation.resume(returning: destination)
                } catch {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func loadItem(_ provider: NSItemProvider, _ type: String) async -> NSSecureCoding? {
        let box = await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                continuation.resume(returning: ShareItemBox(item))
            }
        }
        return box.value
    }

    private func uploadSessionID(from response: ShareResponse) -> String? {
        let body = try? JSONSerialization.jsonObject(with: response.data) as? [String: Any]
        return body?["upload_id"] as? String
    }

    private func detail(of response: ShareResponse) -> String? {
        let body = try? JSONSerialization.jsonObject(with: response.data) as? [String: Any]
        return body?["detail"] as? String
    }

    private static func suffixed(_ name: String, _ suffix: Int) -> String {
        let ext = (name as NSString).pathExtension
        let stem = (name as NSString).deletingPathExtension
        return ext.isEmpty ? "\(stem) (\(suffix))" : "\(stem) (\(suffix)).\(ext)"
    }

    /// `<n>` from `File too large (max <n>GB)`.
    private static func sizeLimit(from detail: String?) -> Int? {
        guard let detail else { return nil }
        let pattern = #"^File too large \(max ([0-9]+)GB\)$"#
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(detail.startIndex..<detail.endIndex, in: detail)
        guard let match = expression.firstMatch(in: detail, range: range),
              let valueRange = Range(match.range(at: 1), in: detail)
        else { return nil }
        return Int(detail[valueRange])
    }

    private static func isSidecar(_ name: String) -> Bool {
        let ext = (name as NSString).pathExtension.lowercased()
        return ext == "srt" || ext == "vtt"
    }

    private static func displayName(of item: ShareItem, position: Int, now: Date, folder: String) -> String {
        switch item {
        case .file(let provider):
            return provider.suggestedName ?? ""
        case .text(let text):
            return "\(QuickNoteFilename.stem(for: text, at: now)).md"
        case .linkNote(let url, let title):
            return ShareNote.link(url, title: title, folder: folder, now: now).path
        case .webClip(let url, _):
            return url.host() ?? url.absoluteString
        }
    }
}

private final class ShareItemBox: @unchecked Sendable {
    let value: NSSecureCoding?

    init(_ value: NSSecureCoding?) {
        self.value = value
    }
}
