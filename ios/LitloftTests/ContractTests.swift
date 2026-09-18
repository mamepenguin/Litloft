import Foundation
import Testing
import WebKit

@testable import Litloft

/// The samples the web side's tests also read, so a change to the wire on one
/// side fails here or there rather than on a device.
private enum SharedContract {
    static let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("frontend/src/lib/__tests__/fixtures/shell-contract.json")

    static func whole() throws -> [String: Any] {
        let data = try Data(contentsOf: url)
        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    static func load() throws -> [String: [String: [String: Any]]] {
        try whole().compactMapValues { $0 as? [String: [String: Any]] }
    }
}

private let server = URL(string: "http://litloft.local:3000")!
private let trusted = MessageOrigin(isMainFrame: true, scheme: "http", host: "litloft.local", port: 3000)

struct ContractTests {
    @Test("every command the web side sends is understood as meant")
    func commands() throws {
        let commands = try #require(try SharedContract.load()["commands"])
        func route(_ name: String) throws -> ShellAction? {
            ShellBridge.route(body: try #require(commands[name]), from: trusted, server: server)
        }

        #expect(try route("load") == .media(.load(MediaSource(
            url: URL(string: "http://litloft.local:3000/api/files/abc/stream")!,
            title: "A recording",
            artist: "Someone",
            artworkURL: URL(string: "http://litloft.local:3000/api/files/abc/thumbnail")!,
            kind: .video
        )), loadId: "load-1"))
        #expect(try route("play") == .media(.play, loadId: "load-1"))
        #expect(try route("pause") == .media(.pause, loadId: "load-1"))
        #expect(try route("seek") == .media(.seek(time: 42.5, seekId: "seek-1"), loadId: "load-1"))
        #expect(try route("unload") == .media(.unload, loadId: "load-1"))
        #expect(try route("setRate") == .media(.setRate(1.5), loadId: nil))
        #expect(try route("setVolume") == .media(.setVolume(0.25), loadId: nil))
        #expect(try route("surfaceDocument") == .media(.surface(SurfaceGeometry(
            left: 0, width: 402, height: 226.125, anchor: .document, top: 104, stick: nil
        )), loadId: "load-1"))
        #expect(try route("surfaceSticky") == .media(.surface(SurfaceGeometry(
            left: 16, width: 370, height: 208.125,
            anchor: .scroller(CGRect(x: 0, y: 56, width: 402, height: 722)), top: 24,
            stick: SurfaceGeometry.Stick(top: 8, limit: 1200)
        )), loadId: "load-1"))
        #expect(try route("surfaceFixed") == .media(.surface(SurfaceGeometry(
            left: 0, width: 874, height: 402, anchor: .fixed, top: 0, stick: nil
        )), loadId: "load-1"))
        #expect(try route("surfaceGone") == .media(.surface(nil), loadId: "load-1"))
        #expect(try route("pip") == .media(.pip(active: true), loadId: "load-1"))
        #expect(try route("fullscreen") == .media(.fullscreen, loadId: "load-1"))
        #expect(try route("pageBackground") == .pageBackground(PageColor(
            red: 0x1A / 255, green: 0x0E / 255, blue: 0x10 / 255
        )))
        #expect(try route("embedFullscreen") == .embedFullscreen(videoId: "dQw4w9WgXcQ"))
    }

    @MainActor
    @Test("the shell announces the contract version the shared sample names")
    func versionIsTheSharedOne() throws {
        #expect(try SharedContract.whole()["version"] as? Int == ShellBridge.contractVersion)

        let configuration = WKWebViewConfiguration()
        ShellBridge(server: server).install(in: configuration)
        let scripts = configuration.userContentController.userScripts.map(\.source)
        #expect(scripts.contains { $0.contains("__litloftShell") && $0.contains("\(ShellBridge.contractVersion)") })
    }

    @Test("every command in the shared sample is checked here")
    func everyCommandIsCovered() throws {
        let names = try #require(try SharedContract.load()["commands"]).keys
        #expect(Set(names) == [
            "load", "play", "pause", "seek", "unload", "setRate", "setVolume",
            "surfaceDocument", "surfaceSticky", "surfaceFixed", "surfaceGone", "pip", "fullscreen", "pageBackground",
            "embedFullscreen"
        ])
    }

    @Test("every report in the shared sample is checked here")
    func everyStateIsCovered() throws {
        let names = try #require(try SharedContract.load()["states"]).keys
        #expect(Set(names) == [
            "loading", "readyWhilePaused", "seekLanded", "failed", "waitingWhilePlaying",
            "inPictureInPicture", "nothingLoaded"
        ])
    }

    @Test("every report the shell sends is spelled as the web side reads it", arguments: [
        ("loading", MediaState(
            loadId: "load-1", status: .loading, seekId: nil,
            time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, waiting: false,
            pip: false, pipPossible: false
        )),
        ("readyWhilePaused", MediaState(
            loadId: "load-1", status: .ready, seekId: nil,
            time: 0, duration: 180, paused: true, rate: 1, volume: 1, buffered: 12, ended: false, waiting: false,
            pip: false, pipPossible: true
        )),
        ("seekLanded", MediaState(
            loadId: "load-1", status: .ready, seekId: "seek-1",
            time: 42.5, duration: 180, paused: false, rate: 1.5, volume: 0.25, buffered: 60,
            ended: false, waiting: false,
            pip: false, pipPossible: true
        )),
        ("failed", MediaState(
            loadId: "load-1", status: .failed, seekId: nil,
            time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, waiting: false,
            pip: false, pipPossible: false
        )),
        ("waitingWhilePlaying", MediaState(
            loadId: "load-1", status: .ready, seekId: nil,
            time: 11.5, duration: 180, paused: false, rate: 1, volume: 1, buffered: 11.5,
            ended: false, waiting: true,
            pip: false, pipPossible: true
        )),
        ("inPictureInPicture", MediaState(
            loadId: "load-1", status: .ready, seekId: nil,
            time: 42.5, duration: 180, paused: false, rate: 1.5, volume: 0.25, buffered: 60,
            ended: false, waiting: false,
            pip: true, pipPossible: true
        )),
        ("nothingLoaded", MediaState(
            loadId: nil, status: .loading, seekId: nil,
            time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, waiting: false,
            pip: false, pipPossible: false
        ))
    ])
    func states(name: String, state: MediaState) throws {
        let sample = try #require(try SharedContract.load()["states"]?[name])
        let encoded = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as? [String: Any]
        )

        #expect(NSDictionary(dictionary: encoded).isEqual(to: sample), "\(name): \(encoded) vs \(sample)")
    }
}
