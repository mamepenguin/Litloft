import Foundation
import Testing

@testable import Litloft

private let quickTimeouts = ShareTimeouts(json: 2, chunk: 5, create: 1, complete: 0.5)

private func drivesBody(_ names: [String]) -> String {
    "[" + names.map { #"{"name":"\#($0)","protected":false,"file_count":1}"# }.joined(separator: ",") + "]"
}

private func authBody(protected: Bool, groups: [String]) -> String {
    let list = groups.map { "\"\($0)\"" }.joined(separator: ",")
    return #"{"unlocked_groups":[\#(list)],"has_protected_drives":\#(protected),"is_admin":false}"#
}

private struct Script: Sendable {
    var drives = drivesBody(["Photos"])
    var auth = authBody(protected: false, groups: [])
    var addons: ScriptedServer.Reply = .json(200, #"{"addons":{"knowledge":{}},"slots":{}}"#)

    func answer(_ request: ScriptedServer.Request) -> ScriptedServer.Reply {
        switch request.path {
        case "/api/drives": return .json(200, drives)
        case "/api/auth/status": return .json(200, auth)
        case "/api/addons/status": return addons
        default: return .status(404)
        }
    }
}

@MainActor
private struct Sheet {
    let server: ScriptedServer
    let model: ShareSheetModel
    let session: FakeSharedSession

    static func make(
        _ payload: SharePayload,
        script: Script = Script(),
        token: String? = "jwt-1",
        viewer: String? = "me",
        itemOrigin: ((String) -> String)? = nil
    ) async throws -> Sheet {
        let server = try ScriptedServer { script.answer($0) }
        let url = try await server.start()
        let origin = "http://127.0.0.1:\(url.port!)"
        let session = FakeSharedSession(item: SessionItem(
            origin: itemOrigin?(origin) ?? origin, accessToken: token, viewer: viewer
        ))
        session.defaults.set(url.absoluteString, forKey: "share.server")
        let model = ShareSheetModel(payload: payload, session: session, timeouts: quickTimeouts)
        return Sheet(server: server, model: model, session: session)
    }
}

@MainActor
struct ShareSheetModelTests {
    @Test("SPEC-IOS-002: without share.server the sheet asks to connect first, and sends nothing")
    func noServer() async {
        let session = FakeSharedSession()
        let model = ShareSheetModel(payload: .text("hi"), session: session, timeouts: quickTimeouts)

        await model.load()

        #expect(model.state == .blocked(.connectFirst))
        #expect(!model.canSave)
    }

    @Test("SPEC-IOS-002 I3: a share of nothing sends no request")
    func nothingSendsNothing() async throws {
        let sheet = try await Sheet.make(.nothing)
        defer { sheet.server.stop() }

        await sheet.model.load()
        await settle()

        #expect(sheet.model.state == .nothingToSave)
        #expect(sheet.server.requests.isEmpty)
    }

    @Test("SPEC-IOS-002 I3: text over 1 MiB of UTF-8 is refused before any request", arguments: [
        String(repeating: "a", count: 1_048_577),
        String(repeating: "あ", count: 349_526)
    ])
    func textTooLarge(text: String) async throws {
        let sheet = try await Sheet.make(.text(text))
        defer { sheet.server.stop() }

        await sheet.model.load()
        await settle()

        #expect(sheet.model.state == .textTooLarge(bytes: text.utf8.count))
        #expect(!sheet.model.canSave)
        #expect(sheet.server.requests.isEmpty)
    }

    @Test("SPEC-IOS-002: text of exactly 1 MiB can be saved")
    func textAtTheLimit() async throws {
        let sheet = try await Sheet.make(.text(String(repeating: "a", count: 1_048_576)))
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(sheet.model.state == .ready)
        #expect(sheet.model.canSave)
    }

    @Test("SPEC-IOS-002 I5: every request carries the mirrored token and viewer")
    func sessionHeaders() async throws {
        let sheet = try await Sheet.make(.text("hi"), viewer: "Yu%20ichi")
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(Set(sheet.server.requests.map(\.path)) == ["/api/drives", "/api/auth/status"])
        for request in sheet.server.requests {
            #expect(request.header("Authorization") == "Bearer jwt-1")
            #expect(request.header("X-Lit-Viewer") == "Yu%20ichi")
        }
    }

    @Test("SPEC-IOS-002 I5: an item mirrored for another origin is not sent")
    func foreignItemIsNotSent() async throws {
        let sheet = try await Sheet.make(.text("hi"), itemOrigin: { _ in "http://other.local:3000" })
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(sheet.model.state == .ready)
        #expect(!sheet.server.requests.isEmpty)
        for request in sheet.server.requests {
            #expect(request.header("Authorization") == nil)
            #expect(request.header("X-Lit-Viewer") == nil)
        }
    }

    @Test("SPEC-IOS-002 I5: a mirrored viewer without a token is still sent and still makes a clip")
    func viewerWithoutToken() async throws {
        var script = Script()
        script.addons = .json(200, #"{"addons":{"knowledge":{}},"slots":{}}"#)
        let sheet = try await Sheet.make(.text("hi"), script: script, token: nil, viewer: "me")
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(sheet.model.canSave)
        for request in sheet.server.requests {
            #expect(request.header("Authorization") == nil)
            #expect(request.header("X-Lit-Viewer") == "me")
        }

        let link = try await Sheet.make(
            .link(URL(string: "https://example.com/a")!, title: nil),
            script: script,
            token: nil,
            viewer: "me"
        )
        defer { link.server.stop() }
        await link.model.load()
        #expect(await eventually { link.model.state == .ready })
        #expect(link.model.linkKind == .webClip)
    }

    @Test("SPEC-IOS-002 I5: an item mirrored for another port of the same host is not sent")
    func otherPortOfTheSameHostIsNotSent() async throws {
        let sheet = try await Sheet.make(.text("hi"), itemOrigin: { origin in
            origin.replacingOccurrences(of: "http://127.0.0.1:", with: "http://127.0.0.1:1")
        })
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(sheet.model.state == .ready)
        #expect(!sheet.server.requests.isEmpty)
        for request in sheet.server.requests {
            #expect(request.header("Authorization") == nil)
            #expect(request.header("X-Lit-Viewer") == nil)
        }
    }

    @Test("SPEC-IOS-002 I5: an item mirrored for another scheme of the same host is not sent")
    func otherSchemeOfTheSameHostIsNotSent() async throws {
        let sheet = try await Sheet.make(.text("hi"), itemOrigin: { origin in
            origin.replacingOccurrences(of: "http://", with: "https://")
        })
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(sheet.model.state == .ready)
        #expect(!sheet.server.requests.isEmpty)
        for request in sheet.server.requests {
            #expect(request.header("Authorization") == nil)
            #expect(request.header("X-Lit-Viewer") == nil)
        }
    }

    @Test("SPEC-IOS-002: no drive to save to blocks the sheet")
    func noDrives() async throws {
        var script = Script()
        script.drives = "[]"
        let sheet = try await Sheet.make(.text("hi"), script: script)
        defer { sheet.server.stop() }

        await sheet.model.load()

        #expect(sheet.model.state == .blocked(.noDrives))
        #expect(!sheet.model.canSave)
    }

    @Test("SPEC-IOS-002: an unreachable server blocks the sheet")
    func unreachable() async throws {
        let closed = try ScriptedServer { _ in .status(200) }
        let url = try await closed.start()
        closed.stop()
        let session = FakeSharedSession()
        session.defaults.set(url.absoluteString, forKey: "share.server")
        let model = ShareSheetModel(payload: .text("hi"), session: session, timeouts: quickTimeouts)

        await model.load()

        #expect(model.state == .blocked(.cannotReach))
    }

    @Test("SPEC-IOS-002: several drives and no memory wait for a pick, and the pick takes Inbox")
    func needsDrive() async throws {
        var script = Script()
        script.drives = drivesBody(["Photos", "Notes"])
        let sheet = try await Sheet.make(.text("hi"), script: script)
        defer { sheet.server.stop() }

        await sheet.model.load()
        #expect(sheet.model.state == .needsDrive)
        #expect(!sheet.model.canSave)

        await sheet.model.pickDrive("Notes")

        #expect(sheet.model.state == .ready)
        #expect(sheet.model.destination == ShareDestination(drive: "Notes", folder: "Inbox"))
        #expect(sheet.model.canSave)
    }

    @Test("SPEC-IOS-002: the locked hint shows only when protected drives exist and none is unlocked")
    func lockedHint() async throws {
        var locked = Script()
        locked.auth = authBody(protected: true, groups: [])
        let hinted = try await Sheet.make(.text("hi"), script: locked)
        defer { hinted.server.stop() }
        await hinted.model.load()
        #expect(hinted.model.showsLockedHint)

        var unlocked = Script()
        unlocked.auth = authBody(protected: true, groups: ["family"])
        let plain = try await Sheet.make(.text("hi"), script: unlocked)
        defer { plain.server.stop() }
        await plain.model.load()
        #expect(!plain.model.showsLockedHint)
        #expect(plain.model.state == .ready)
    }

    @Test("SPEC-IOS-002 I8: a link waits for addons/status with 保存 disabled, then is a web clip")
    func linkResolvesToWebClip() async throws {
        var script = Script()
        script.addons = .delayed(.milliseconds(700), .json(200, #"{"addons":{"knowledge":{}},"slots":{}}"#))
        let sheet = try await Sheet.make(.link(URL(string: "https://example.com/a")!, title: nil), script: script)
        defer { sheet.server.stop() }

        let loading = Task { await sheet.model.load() }
        #expect(await eventually { sheet.model.state == .resolvingKind })
        #expect(!sheet.model.canSave)
        await loading.value
        #expect(await eventually { sheet.model.state == .ready })

        #expect(sheet.model.linkKind == .webClip)
        #expect(sheet.model.canSave)
        #expect(sheet.server.requests("GET", "/api/addons/status").first?.query["drive"] == "Photos")
    }

    @Test("SPEC-IOS-002 I8: without knowledge, without a viewer, or when the status fails, a link is a link note",
          arguments: [
              (ScriptedServer.Reply.json(200, #"{"addons":{},"slots":{}}"#), "me" as String?),
              (ScriptedServer.Reply.json(200, #"{"addons":{"knowledge":{}},"slots":{}}"#), nil as String?),
              (ScriptedServer.Reply.json(500, "{}"), "me" as String?),
              (ScriptedServer.Reply.drop, "me" as String?)
          ])
    func linkNote(addons: ScriptedServer.Reply, viewer: String?) async throws {
        var script = Script()
        script.addons = addons
        let sheet = try await Sheet.make(.link(URL(string: "https://example.com/a")!, title: nil), script: script, viewer: viewer)
        defer { sheet.server.stop() }

        await sheet.model.load()
        #expect(await eventually { sheet.model.state == .ready })

        #expect(sheet.model.linkKind == .linkNote)
    }

    @Test("SPEC-IOS-002 I8: picking another drive asks addons/status again for that drive")
    func driveChangeReasksKind() async throws {
        var script = Script()
        script.drives = drivesBody(["Photos", "Notes"])
        let sheet = try await Sheet.make(.link(URL(string: "https://example.com/a")!, title: nil), script: script)
        defer { sheet.server.stop() }
        await sheet.model.load()
        #expect(sheet.model.state == .needsDrive)
        await sheet.model.pickDrive("Photos")
        #expect(await eventually { sheet.model.state == .ready })

        await sheet.model.pickDrive("Notes")
        #expect(await eventually { sheet.model.state == .ready })

        #expect(sheet.server.requests("GET", "/api/addons/status").compactMap { $0.query["drive"] }
            == ["Photos", "Notes"])
    }

    @Test("SPEC-IOS-002 I4: after a stop the drive row changes the queue, keeps Retry, and never re-offers Save")
    func driveAfterStop() async throws {
        let server = try ScriptedServer { request in
            switch request.path {
            case "/api/drives": return .json(200, drivesBody(["Gone", "Notes"]))
            case "/api/auth/status": return .json(200, authBody(protected: false, groups: []))
            case "/api/drives/Gone/files": return .json(404, "{}")
            case "/api/drives/Notes/files": return .json(201, #"{"id":"n1"}"#)
            default: return .status(404)
            }
        }
        let url = try await server.start()
        defer { server.stop() }
        let origin = "http://127.0.0.1:\(url.port!)"
        let session = FakeSharedSession(item: SessionItem(origin: origin, accessToken: "jwt-1", viewer: "me"))
        session.defaults.set(url.absoluteString, forKey: "share.server")
        session.defaults.set("Clips", forKey: "share.folder.\(origin).Notes")
        let model = ShareSheetModel(payload: .text("one"), session: session, timeouts: quickTimeouts)
        await model.load()
        #expect(model.state == .needsDrive)

        await model.pickDrive("Gone")
        #expect(model.state == .ready)
        await model.save()
        #expect(model.state == .stopped(.driveNotAvailable))
        #expect(!model.canSave)
        #expect(model.hasQueue)
        #expect(model.canPickDrive)
        #expect(!model.canPickFolder)

        // The folder is fixed once the queue exists.
        model.pickFolder("Other")
        #expect(model.savedDestination.folder == "Inbox")

        await model.pickDrive("Notes")
        #expect(model.state == .stopped(.driveNotAvailable))
        #expect(!model.canSave)
        #expect(model.destination == ShareDestination(drive: "Notes", folder: "Clips"))

        await model.retry()

        #expect(model.state == .saved)
        #expect(server.requests("POST", "/files").count == 2)
        #expect(model.savedDestination == ShareDestination(drive: "Notes", folder: "Clips"))
    }
}
