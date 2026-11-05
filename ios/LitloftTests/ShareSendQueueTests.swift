import Foundation
import Testing
import UniformTypeIdentifiers

@testable import Litloft

private let mebibyte = 1_048_576
private let quickTimeouts = ShareTimeouts(json: 2, chunk: 5, create: 1, complete: 0.5)
private let quickPolling = CompletePolling(interval: .milliseconds(100), base: .seconds(1), perFiftyMiB: .zero)
private let now = localDate(2026, 8, 13, 9, 4, 5)

/// Counts what the test's server has been asked, across its connections.
private final class Tally: @unchecked Sendable {
    private let lock = NSLock()
    private var counts: [String: Int] = [:]

    func next(_ key: String) -> Int {
        lock.withLock {
            counts[key, default: 0] += 1
            return counts[key]!
        }
    }
}

private enum Answers {
    static func initOK(_ request: ScriptedServer.Request) -> ScriptedServer.Reply {
        let size = request.json?["file_size"] as? Int ?? 0
        let total = max(1, (size + 5 * mebibyte - 1) / (5 * mebibyte))
        return .json(200, #"{"upload_id":"u1","chunk_size":5242880,"total_chunks":\#(total)}"#)
    }

    static let chunkOK = ScriptedServer.Reply.json(200, #"{"received":1,"total":1}"#)
    static let completeOK = ScriptedServer.Reply.json(200, #"{"id":"f1","name":"photo.jpg"}"#)
    static let createOK = ScriptedServer.Reply.json(201, #"{"id":"n1"}"#)
    static let clipOK = ScriptedServer.Reply.json(202, #"{"id":"c1"}"#)
    static let exists = ScriptedServer.Reply.json(409, #"{"detail":"File already exists"}"#)

    /// A server on which everything succeeds, unless `override` answers first.
    static func server(
        _ override: @escaping @Sendable (ScriptedServer.Request) -> ScriptedServer.Reply? = { _ in nil }
    ) -> @Sendable (ScriptedServer.Request) -> ScriptedServer.Reply {
        { request in
            if let reply = override(request) { return reply }
            switch (request.method, request.path) {
            case ("POST", let path) where path.hasSuffix("/upload/init"): return initOK(request)
            case ("POST", let path) where path.hasSuffix("/chunk"): return chunkOK
            case ("POST", let path) where path.hasSuffix("/complete"): return completeOK
            case ("DELETE", _): return .json(200, "{}")
            case ("POST", let path) where path.hasSuffix("/files"): return createOK
            case ("POST", let path) where path.hasSuffix("/clips"): return clipOK
            case ("GET", let path) where path.hasSuffix("/files/by-path"): return .json(404, #"{"detail":"Not found"}"#)
            default: return .status(404)
            }
        }
    }
}

private func makeFile(_ name: String, bytes: Int) throws -> URL {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ShareSendQueueTests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent(name)
    var data = Data(count: bytes)
    for index in stride(from: 0, to: bytes, by: 4096) { data[index] = UInt8(truncatingIfNeeded: index / 4096) }
    try data.write(to: url)
    return url
}

private func fileItem(_ name: String, bytes: Int = 1_024) throws -> (ShareItem, URL) {
    let url = try makeFile(name, bytes: bytes)
    let provider = try #require(NSItemProvider(contentsOf: url))
    provider.suggestedName = (name as NSString).deletingPathExtension
    return (.file(provider), url)
}

@MainActor
private struct Harness {
    let server: ScriptedServer
    let queue: ShareSendQueue
    let defaults: UserDefaults
    let origin: String

    var remembered: [String] {
        defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("share.") }.sorted()
    }

    static func make(
        _ items: [ShareItem],
        drive: String = "Photos",
        folder: String = "Inbox",
        viewer: String? = "Yu%20ichi",
        polling: CompletePolling = quickPolling,
        answer: @escaping @Sendable (ScriptedServer.Request) -> ScriptedServer.Reply = Answers.server()
    ) async throws -> Harness {
        let server = try ScriptedServer(answer)
        let url = try await server.start()
        let defaults = UserDefaults(suiteName: "ShareSendQueueTests-\(UUID().uuidString)")!
        let origin = "http://127.0.0.1:\(url.port!)"
        let queue = ShareSendQueue(
            items: items,
            destination: ShareDestination(drive: drive, folder: folder),
            client: ShareAPIClient(server: url, accessToken: "jwt-1", viewer: viewer, timeouts: quickTimeouts),
            memory: ShareMemory(defaults: defaults, origin: origin),
            polling: polling,
            now: { now }
        )
        return Harness(server: server, queue: queue, defaults: defaults, origin: origin)
    }
}

@MainActor
struct ShareSendQueueTests {
    // MARK: files

    @Test("SPEC-IOS-002 I1 I10: a file is uploaded in 5 MiB chunks as a share, with the session")
    func uploadsAFile() async throws {
        let (item, url) = try fileItem("photo.jpg", bytes: 5 * mebibyte + 10)
        let harness = try await Harness.make([item])
        defer { harness.server.stop() }

        await harness.queue.send()

        let inits = harness.server.requests("POST", "/upload/init")
        try #require(inits.count == 1)
        #expect(inits[0].path == "/api/drives/Photos/upload/init")
        #expect(inits[0].json?["filename"] as? String == "photo.jpg")
        #expect(inits[0].json?["file_size"] as? Int == 5 * mebibyte + 10)
        #expect(inits[0].json?["folder_path"] as? String == "Inbox")
        #expect(inits[0].json?["chunk_size"] as? Int == 5 * mebibyte)
        #expect(inits[0].json?["inbox_source"] as? String == "share")
        for request in harness.server.requests {
            #expect(request.header("Authorization") == "Bearer jwt-1")
            #expect(request.header("X-Lit-Viewer") == "Yu%20ichi")
        }
        let chunks = harness.server.requests("POST", "/upload/u1/chunk")
        #expect(chunks.compactMap { $0.formField("chunk_index").map { String(decoding: $0, as: UTF8.self) } } == ["0", "1"])
        #expect(chunks.compactMap { $0.formField("chunk")?.count } == [5 * mebibyte, 10])
        #expect(chunks.compactMap { $0.formField("chunk") }.reduce(Data(), +) == (try Data(contentsOf: url)))
        #expect(harness.server.requests("POST", "/upload/u1/complete").count == 1)
        #expect(harness.queue.statuses.map(\.state) == [.saved])
        #expect(harness.queue.state == .saved)
    }

    @Test("SPEC-IOS-002: an upload is named by the provider's suggested name and the delivered file's extension")
    func uploadName() async throws {
        let url = try makeFile("x.HEIC", bytes: 64)
        let provider = try #require(NSItemProvider(contentsOf: url))
        provider.suggestedName = "IMG_4021"
        let harness = try await Harness.make([.file(provider)])
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("POST", "/upload/init").first?.json?["filename"] as? String == "IMG_4021.HEIC")
    }

    @Test("SPEC-IOS-002 I7: a taken name lands under the first free suffix")
    func takenNameTakesASuffix() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            guard request.path.hasSuffix("/upload/init") else { return nil }
            let name = request.json?["filename"] as? String
            return name == "photo.jpg" || name == "photo (1).jpg" ? Answers.exists : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
            == ["photo.jpg", "photo (1).jpg", "photo (2).jpg"])
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002 I7: when every suffix up to 99 is taken the item fails visibly")
    func suffixesExhausted() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/upload/init") ? Answers.exists : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        let names = harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
        #expect(names == ["photo.jpg"] + (1...99).map { "photo (\($0)).jpg" })
        #expect(harness.server.requests("POST", "/chunk").isEmpty)
        #expect(harness.queue.statuses.map(\.state) == [.failed(.tooManyWithThisName)])
        #expect(harness.queue.state == .finishedWithFailures)
    }

    @Test("SPEC-IOS-002 I7: any other 409 fails the item without a suffix")
    func otherConflictFails() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/upload/init") ? .json(409, #"{"detail":"Path is held by a trashed file"}"#) : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("POST", "/upload/init").count == 1)
        #expect(harness.queue.statuses.map(\.state) == [.failed(.genericFailure)])
    }

    @Test("SPEC-IOS-002: an init refusal is shown by its own message, never the server's detail", arguments: [
        (400, #"{"detail":"File too large (max 50GB)"}"#, ShareMessage.fileTooLarge(limitGB: 50)),
        (400, #"{"detail":"Something else"}"#, ShareMessage.fileTooLarge(limitGB: nil)),
        (507, #"{"detail":"No space left"}"#, ShareMessage.diskFull),
        (500, #"{"detail":"Traceback secret"}"#, ShareMessage.genericFailure),
        (200, #"not json"#, ShareMessage.genericFailure)
    ])
    func initRefusals(status: Int, body: String, message: ShareMessage) async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/upload/init") ? .json(status, body) : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.statuses.map(\.state) == [.failed(message)])
        #expect(harness.queue.statuses.first?.offers.contains(.retry) == true)
        #expect(harness.server.requests("POST", "/chunk").isEmpty)
    }

    @Test("SPEC-IOS-002 I6: an upload that fails on a chunk deletes its session and sends no complete", arguments: [
        ScriptedServer.Reply.json(500, "{}"), ScriptedServer.Reply.drop
    ])
    func chunkFailureDeletesTheSession(reply: ScriptedServer.Reply) async throws {
        let (first, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([first, .text("next")], answer: Answers.server { request in
            request.path.hasSuffix("/chunk") ? reply : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("DELETE", "/api/drives/Photos/upload/u1").count == 1)
        #expect(harness.server.requests("POST", "/complete").isEmpty)
        #expect(harness.queue.statuses.map(\.state) == [.failed(.genericFailure), .saved])
    }

    // MARK: the queue

    @Test("SPEC-IOS-002 I6: a failed item does not stop the queue, and nothing is remembered")
    func failedItemGoesOn() async throws {
        let (first, _) = try fileItem("a.jpg")
        let (third, _) = try fileItem("c.jpg")
        let harness = try await Harness.make([first, .text("second"), third], answer: Answers.server { request in
            request.path.hasSuffix("/upload/init") && request.json?["filename"] as? String == "a.jpg"
                ? .json(500, #"{"detail":"boom"}"#) : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.statuses.map(\.state) == [.failed(.genericFailure), .saved, .saved])
        #expect(harness.queue.state == .finishedWithFailures)
        #expect(harness.remembered.isEmpty)
    }

    @Test("SPEC-IOS-002: a failed item's retry starts it again from the beginning")
    func retryAFailedItem() async throws {
        let tally = Tally()
        let (item, _) = try fileItem("a.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/upload/init") && tally.next("init") == 1 ? .json(500, "{}") : nil
        })
        defer { harness.server.stop() }
        await harness.queue.send()
        #expect(harness.queue.state == .finishedWithFailures)

        await harness.queue.retryItem(at: 0)

        #expect(harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
            == ["a.jpg", "a.jpg"])
        #expect(harness.queue.statuses.map(\.state) == [.saved])
        #expect(harness.queue.state == .saved)
    }

    @Test("SPEC-IOS-002 I6: a drive that answers 404 or 403 stops the queue, and later items wait", arguments: [404, 403])
    func driveGoneStops(status: Int) async throws {
        let harness = try await Harness.make([.text("one"), .text("two")], answer: Answers.server { request in
            request.path.hasSuffix("/files") ? .json(status, #"{"detail":"Drive not found"}"#) : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.state == .stopped(.driveNotAvailable))
        #expect(harness.queue.statuses.map(\.state) == [.failed(.driveNotAvailable), .waiting])
        #expect(harness.server.requests("POST", "/files").count == 1)
    }

    @Test("SPEC-IOS-002 I4: after a 404, a picked drive and its folder apply to the unsaved items only")
    func anotherDriveAfter404() async throws {
        let harness = try await Harness.make(
            [.text("saved first"), .text("refused"), .text("after")],
            answer: Answers.server { request in
                guard request.path == "/api/drives/Gone/files" else { return nil }
                let content = request.json?["content"] as? String
                return content == "saved first" ? nil : .json(404, "{}")
            }
        )
        defer { harness.server.stop() }
        harness.defaults.set("Clips", forKey: "share.folder.\(harness.origin).Notes")
        let queue = ShareSendQueue(
            items: [.text("saved first"), .text("refused"), .text("after")],
            destination: ShareDestination(drive: "Gone", folder: "Inbox"),
            client: ShareAPIClient(
                server: URL(string: harness.origin)!, accessToken: "jwt-1", viewer: "me", timeouts: quickTimeouts
            ),
            memory: ShareMemory(defaults: harness.defaults, origin: harness.origin),
            polling: quickPolling,
            now: { now }
        )
        await queue.send()
        #expect(queue.state == .stopped(.driveNotAvailable))

        queue.pickDrive("Notes")
        #expect(queue.destination == ShareDestination(drive: "Notes", folder: "Clips"))
        await queue.retry()

        let creates = harness.server.requests("POST", "/files")
        #expect(creates.map(\.path) == [
            "/api/drives/Gone/files", "/api/drives/Gone/files", "/api/drives/Notes/files", "/api/drives/Notes/files"
        ])
        #expect(creates.compactMap { ($0.json?["path"] as? String)?.hasPrefix("Clips/") }.suffix(2) == [true, true])
        #expect(queue.statuses.map(\.state) == [.saved, .saved, .saved])
        #expect(harness.defaults.string(forKey: "share.lastDrive.\(harness.origin)") == "Notes")
        #expect(harness.defaults.string(forKey: "share.folder.\(harness.origin).Notes") == "Clips")
    }

    @Test("SPEC-IOS-002 I6: an unreachable server stops the queue")
    func unreachableStops() async throws {
        let closed = try ScriptedServer { _ in .status(200) }
        let url = try await closed.start()
        closed.stop()
        let defaults = UserDefaults(suiteName: "ShareSendQueueTests-\(UUID().uuidString)")!
        let queue = ShareSendQueue(
            items: [.text("one"), .text("two")],
            destination: ShareDestination(drive: "Photos", folder: "Inbox"),
            client: ShareAPIClient(server: url, accessToken: nil, viewer: nil, timeouts: quickTimeouts),
            memory: ShareMemory(defaults: defaults, origin: "http://127.0.0.1:\(url.port!)"),
            polling: quickPolling,
            now: { now }
        )

        await queue.send()

        #expect(queue.state == .stopped(.cannotReach))
        #expect(queue.statuses.last?.state == .waiting)
    }

    @Test("SPEC-IOS-002 I4: a full save remembers the drive and folder for this server")
    func fullSaveRemembers() async throws {
        let harness = try await Harness.make([.text("one")], drive: "Notes", folder: "")
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.state == .saved)
        #expect(harness.defaults.string(forKey: "share.lastDrive.\(harness.origin)") == "Notes")
        #expect(harness.defaults.string(forKey: "share.folder.\(harness.origin).Notes") == "")
    }

    // MARK: notes and clips

    @Test("SPEC-IOS-002 I1 I3 I9: text is created as a Markdown note with a share arrival", arguments: [
        ("Inbox", "Inbox/会議のメモ.md"), ("", "会議のメモ.md")
    ])
    func textCreate(folder: String, path: String) async throws {
        let text = "会議のメモ\r\n本文 🚀\n"
        let harness = try await Harness.make([.text(text)], folder: folder)
        defer { harness.server.stop() }

        await harness.queue.send()

        let create = try #require(harness.server.requests("POST", "/api/drives/Photos/files").first)
        #expect(create.json?["path"] as? String == path)
        #expect(create.json?["content"] as? String == text)
        #expect(create.json?["conflict_mode"] as? String == "rename")
        #expect(create.json?["arrival"] as? [String: String] == ["source": "share", "i18n_key": "inbox.sourceShare"])
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002 I9: a link note holds the title and the URL")
    func linkNoteCreate() async throws {
        let url = URL(string: "https://example.com/a")!
        let harness = try await Harness.make([.linkNote(url, title: "Weekly review")])
        defer { harness.server.stop() }

        await harness.queue.send()

        let create = try #require(harness.server.requests("POST", "/files").first)
        #expect(create.json?["path"] as? String == "Inbox/Weekly review.md")
        #expect(create.json?["content"] as? String == "Weekly review\n\nhttps://example.com/a\n")
        #expect(create.json?["arrival"] as? [String: String] == ["source": "share", "i18n_key": "inbox.sourceShare"])
    }

    @Test("SPEC-IOS-002 I8: a web clip goes to knowledge with the drive and the viewer", arguments: [
        ("Inbox", "Inbox" as String?), ("", nil as String?)
    ])
    func webClip(folder: String, subfolder: String?) async throws {
        let url = URL(string: "https://example.com/a")!
        let harness = try await Harness.make([.webClip(url, title: "Page")], drive: "My Drive", folder: folder)
        defer { harness.server.stop() }

        await harness.queue.send()

        let clip = try #require(harness.server.requests("POST", "/api/addons/knowledge/clips").first)
        #expect(clip.json?["url"] as? String == "https://example.com/a")
        #expect(clip.json?["title"] as? String == "Page")
        #expect(clip.json?["subfolder"] as? String == subfolder)
        #expect((clip.json?.keys.contains("subfolder") ?? true) == (subfolder != nil))
        #expect(clip.header("X-Lit-Drive") == "My%20Drive")
        #expect(clip.header("X-Lit-Viewer") == "Yu%20ichi")
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002: a clip error is shown as the table says", arguments: [
        (400, ShareItemState.failed(.clipUnavailable), [ShareOffer.saveAsLink, .retry]),
        (401, .failed(.clipUnavailable), [.saveAsLink, .retry]),
        (404, .failed(.clipUnavailable), [.saveAsLink, .retry]),
        (422, .failed(.clipUnavailable), [.saveAsLink, .retry]),
        (503, .failed(.clipUnavailable), [.saveAsLink, .retry]),
        (502, .unknown, [.saveAgain]),
        (504, .unknown, [.saveAgain]),
        (500, .failed(.genericFailure), [.retry])
    ])
    func clipErrors(status: Int, state: ShareItemState, offers: [ShareOffer]) async throws {
        let harness = try await Harness.make([.webClip(URL(string: "https://example.com/a")!, title: nil)],
                                             answer: Answers.server { request in
            request.path.hasSuffix("/clips") ? .json(status, #"{"detail":"x"}"#) : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.statuses.first?.state == state)
        #expect(Set(harness.queue.statuses.first?.offers ?? []) == Set(offers))
        #expect(harness.queue.state == .finishedWithFailures)
    }

    @Test("SPEC-IOS-002: a clip that answers 403 means the drive is not available, and stops the queue")
    func clipForbiddenStops() async throws {
        let harness = try await Harness.make(
            [.webClip(URL(string: "https://example.com/a")!, title: nil), .text("later")],
            answer: Answers.server { request in request.path.hasSuffix("/clips") ? .json(403, "{}") : nil }
        )
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.state == .stopped(.driveNotAvailable))
        #expect(harness.queue.statuses.map(\.state) == [.failed(.driveNotAvailable), .waiting])
    }

    @Test("SPEC-IOS-002: リンクとして保存 sends the refused clip as a link note")
    func saveAsLinkAfterClipRefusal() async throws {
        let harness = try await Harness.make([.webClip(URL(string: "https://example.com/a")!, title: "Page")],
                                             answer: Answers.server { request in
            request.path.hasSuffix("/clips") ? .json(503, "{}") : nil
        })
        defer { harness.server.stop() }
        await harness.queue.send()

        await harness.queue.saveAsLink(at: 0)

        let create = try #require(harness.server.requests("POST", "/files").first)
        #expect(create.json?["content"] as? String == "Page\n\nhttps://example.com/a\n")
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002 I6: an unanswered create is unknown, sent once, and sent again only on もう一度保存", arguments: [
        ScriptedServer.Reply.never, ScriptedServer.Reply.drop
    ])
    func unansweredCreate(reply: ScriptedServer.Reply) async throws {
        let tally = Tally()
        let harness = try await Harness.make([.text("note")], answer: Answers.server { request in
            request.path.hasSuffix("/files") && tally.next("create") == 1 ? reply : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.queue.statuses.map(\.state) == [.unknown])
        #expect(harness.queue.statuses.first?.offers == [.saveAgain])
        #expect(harness.server.requests("POST", "/files").count == 1)

        await harness.queue.retryItem(at: 0)

        #expect(harness.server.requests("POST", "/files").count == 2)
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    // MARK: an unanswered /complete

    @Test("SPEC-IOS-002 I6: after an unanswered complete, by-path finding the target saves the item")
    func unansweredCompleteFoundByPath() async throws {
        let tally = Tally()
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            if request.path.hasSuffix("/complete") { return .never }
            guard request.path.hasSuffix("/files/by-path") else { return nil }
            switch tally.next("by-path") {
            case 1: return .json(404, "{}")
            case 2: return .json(500, "{}")
            case 3: return .drop
            default: return .json(200, #"{"id":"f1"}"#)
            }
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("POST", "/complete").count == 1)
        let lookups = harness.server.requests("GET", "/api/drives/Photos/files/by-path")
        #expect(lookups.count == 4)
        #expect(lookups.allSatisfy { $0.query["path"] == "Inbox/photo.jpg" })
        #expect(harness.queue.statuses.map(\.state) == [.saved])
        #expect(harness.queue.state == .saved)
    }

    @Test("SPEC-IOS-002 I6: when by-path never finds it within the window, the item is unknown")
    func unansweredCompleteNotFound() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let started = ContinuousClock.now
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/complete") ? .never : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(ContinuousClock.now - started >= .seconds(1))
        #expect(harness.server.requests("GET", "/files/by-path").count >= 2)
        #expect(harness.server.requests("POST", "/complete").count == 1)
        #expect(harness.queue.statuses.map(\.state) == [.unknown])
        #expect(harness.queue.statuses.first?.offers == [.saveAgain])
        #expect(harness.queue.state == .finishedWithFailures)
    }

    @Test("SPEC-IOS-002 I6 I7: もう一度保存 after unknown, refused as existing under the original name, is saved")
    func saveAgainFindsItLanded() async throws {
        let tally = Tally()
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            if request.path.hasSuffix("/complete") { return .never }
            if request.path.hasSuffix("/upload/init"), tally.next("init") > 1 { return Answers.exists }
            return nil
        })
        defer { harness.server.stop() }
        await harness.queue.send()
        #expect(harness.queue.statuses.map(\.state) == [.unknown])
        let chunksBefore = harness.server.requests("POST", "/chunk").count

        await harness.queue.retryItem(at: 0)

        #expect(harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
            == ["photo.jpg", "photo.jpg"])
        #expect(harness.server.requests("POST", "/chunk").count == chunksBefore)
        #expect(harness.server.requests("POST", "/complete").count == 1)
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002 I6: もう一度保存 after unknown, accepted at init, uploads again under the original name")
    func saveAgainUploads() async throws {
        let tally = Tally()
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            if request.path.hasSuffix("/complete"), tally.next("complete") == 1 { return .never }
            return nil
        })
        defer { harness.server.stop() }
        await harness.queue.send()
        #expect(harness.queue.statuses.map(\.state) == [.unknown])

        await harness.queue.retryItem(at: 0)

        #expect(harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
            == ["photo.jpg", "photo.jpg"])
        #expect(harness.server.requests("POST", "/complete").count == 2)
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002: a subtitle sidecar is not looked for after an unanswered complete")
    func sidecarSkipsPolling() async throws {
        let (item, _) = try fileItem("episode.srt")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/complete") ? .never : nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("POST", "/complete").count == 1)
        #expect(harness.server.requests("GET", "/files/by-path").isEmpty)
        #expect(harness.queue.statuses.map(\.state) == [.unknown])
    }

    // MARK: cancel

    @Test("SPEC-IOS-002 I6: キャンセル during init awaits its answer and deletes the session it opened")
    func cancelDuringInit() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item, .text("later")], answer: Answers.server { request in
            request.path.hasSuffix("/upload/init") ? .delayed(.milliseconds(500), Answers.initOK(request)) : nil
        })
        defer { harness.server.stop() }
        let sending = Task { await harness.queue.send() }
        #expect(await eventually { !harness.server.requests("POST", "/upload/init").isEmpty })

        await harness.queue.cancel()
        await sending.value

        #expect(harness.server.requests("DELETE", "/api/drives/Photos/upload/u1").count == 1)
        #expect(harness.server.requests("POST", "/chunk").isEmpty)
        #expect(harness.server.requests("POST", "/files").isEmpty)
        #expect(harness.queue.state == .closed)
        #expect(harness.remembered.isEmpty)
    }

    @Test("SPEC-IOS-002 I6: キャンセル during a chunk abandons it and deletes the session")
    func cancelDuringChunk() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            request.path.hasSuffix("/chunk") ? .never : nil
        })
        defer { harness.server.stop() }
        let sending = Task { await harness.queue.send() }
        #expect(await eventually { !harness.server.requests("POST", "/chunk").isEmpty })

        await harness.queue.cancel()
        await sending.value

        #expect(harness.server.requests("DELETE", "/api/drives/Photos/upload/u1").count == 1)
        #expect(harness.server.requests("POST", "/complete").isEmpty)
        #expect(harness.queue.state == .closed)
    }

    @Test("SPEC-IOS-002 I6: キャンセル during a create awaits it and sends nothing after")
    func cancelDuringCreate() async throws {
        let harness = try await Harness.make([.text("one"), .text("two")], answer: Answers.server { request in
            request.path.hasSuffix("/files") ? .delayed(.milliseconds(500), Answers.createOK) : nil
        })
        defer { harness.server.stop() }
        let sending = Task { await harness.queue.send() }
        #expect(await eventually { !harness.server.requests("POST", "/files").isEmpty })

        await harness.queue.cancel()
        await sending.value

        #expect(harness.server.requests("POST", "/files").count == 1)
        #expect(harness.queue.state == .closed)
        #expect(harness.remembered.isEmpty)
    }

    @Test("SPEC-IOS-002: キャンセル during an unanswered complete does not poll for it")
    func cancelDuringComplete() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], polling: CompletePolling(
            interval: .milliseconds(100), base: .seconds(5), perFiftyMiB: .zero
        ), answer: Answers.server { request in
            request.path.hasSuffix("/complete") ? .never : nil
        })
        defer { harness.server.stop() }
        let sending = Task { await harness.queue.send() }
        #expect(await eventually { !harness.server.requests("POST", "/complete").isEmpty })

        await harness.queue.cancel()
        await sending.value

        #expect(harness.server.requests("GET", "/files/by-path").isEmpty)
        #expect(harness.server.requests("DELETE", "/upload/u1").isEmpty)
        #expect(harness.queue.state == .closed)
    }

    @Test("SPEC-IOS-002 I6 I7: the bar's retry sends an unknown file with its original name")
    func barRetryUnknownUsesOriginalName() async throws {
        let tally = Tally()
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            if request.path.hasSuffix("/complete") { return .never }
            if request.path.hasSuffix("/upload/init"), tally.next("init") > 1 { return Answers.exists }
            return nil
        })
        defer { harness.server.stop() }
        await harness.queue.send()
        #expect(harness.queue.statuses.map(\.state) == [.unknown])
        let chunksBefore = harness.server.requests("POST", "/chunk").count

        await harness.queue.retry()

        #expect(harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
            == ["photo.jpg", "photo.jpg"])
        #expect(harness.server.requests("POST", "/chunk").count == chunksBefore)
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    @Test("SPEC-IOS-002 I6 I7: a retry that fails after an unknown still checks the original name")
    func retryAfterUnknownKeepsOriginalName() async throws {
        let tally = Tally()
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            if request.path.hasSuffix("/complete") { return .never }
            if request.path.hasSuffix("/upload/init") {
                let count = tally.next("init")
                if count == 2 { return .json(500, "{}") }
                if count >= 3 { return Answers.exists }
            }
            return nil
        })
        defer { harness.server.stop() }
        await harness.queue.send()
        #expect(harness.queue.statuses.map(\.state) == [.unknown])

        await harness.queue.retry()
        #expect(harness.queue.statuses.map(\.state) == [.failed(.genericFailure)])

        await harness.queue.retry()
        #expect(harness.queue.statuses.map(\.state) == [.saved])
        #expect(harness.server.requests("POST", "/upload/init").compactMap { $0.json?["filename"] as? String }
            == ["photo.jpg", "photo.jpg", "photo.jpg"])
        #expect(harness.server.requests("POST", "/chunk").count == 1)
    }

    @Test("SPEC-IOS-002 I6: a complete that loses the connection is polled like an unanswered one")
    func completeConnectionLostPolls() async throws {
        let (item, _) = try fileItem("photo.jpg")
        let harness = try await Harness.make([item], answer: Answers.server { request in
            if request.path.hasSuffix("/complete") { return .drop }
            if request.path.hasSuffix("/files/by-path") { return .json(200, #"{"id":"f1"}"#) }
            return nil
        })
        defer { harness.server.stop() }

        await harness.queue.send()

        #expect(harness.server.requests("POST", "/complete").count == 1)
        #expect(!harness.server.requests("GET", "/files/by-path").isEmpty)
        #expect(harness.queue.statuses.map(\.state) == [.saved])
    }

    // MARK: constants

    @Test("SPEC-IOS-002: the timeouts and the polling window are the spec's")
    func timeoutsAndWindow() {
        #expect(ShareTimeouts.standard == ShareTimeouts(json: 30, chunk: 120, create: 60, complete: 900))
        #expect(CompletePolling.standard.interval == .seconds(5))
        #expect(CompletePolling.standard.window(forFileSize: 0) == .seconds(120))
        #expect(CompletePolling.standard.window(forFileSize: Int64(50 * mebibyte)) == .seconds(121))
        #expect(CompletePolling.standard.window(forFileSize: Int64(500 * mebibyte)) == .seconds(130))
    }
}
