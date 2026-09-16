import Foundation
import Testing

@testable import Litloft

/// The samples the web side's tests also read, so a change to the wire on one
/// side fails here or there rather than on a device.
private enum SharedContract {
    static let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("frontend/src/lib/__tests__/fixtures/shell-contract.json")

    static func load() throws -> [String: [String: [String: Any]]] {
        let data = try Data(contentsOf: url)
        return try #require(JSONSerialization.jsonObject(with: data) as? [String: [String: [String: Any]]])
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
            artworkURL: URL(string: "http://litloft.local:3000/api/files/abc/thumbnail")!
        )), loadId: "load-1"))
        #expect(try route("play") == .media(.play, loadId: "load-1"))
        #expect(try route("pause") == .media(.pause, loadId: "load-1"))
        #expect(try route("seek") == .media(.seek(time: 42.5, seekId: "seek-1"), loadId: "load-1"))
        #expect(try route("unload") == .media(.unload, loadId: "load-1"))
        #expect(try route("setRate") == .media(.setRate(1.5), loadId: nil))
        #expect(try route("setVolume") == .media(.setVolume(0.25), loadId: nil))
    }

    @Test("every report in the shared sample is checked here")
    func everyStateIsCovered() throws {
        let names = try #require(try SharedContract.load()["states"]).keys
        #expect(Set(names) == [
            "loading", "readyWhilePaused", "seekLanded", "failed", "stalledWhilePlaying", "nothingLoaded"
        ])
    }

    @Test("every report the shell sends is spelled as the web side reads it", arguments: [
        ("loading", MediaState(
            loadId: "load-1", status: .loading, seekId: nil,
            time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, stalled: false
        )),
        ("readyWhilePaused", MediaState(
            loadId: "load-1", status: .ready, seekId: nil,
            time: 0, duration: 180, paused: true, rate: 1, volume: 1, buffered: 12, ended: false, stalled: false
        )),
        ("seekLanded", MediaState(
            loadId: "load-1", status: .ready, seekId: "seek-1",
            time: 42.5, duration: 180, paused: false, rate: 1.5, volume: 0.25, buffered: 60,
            ended: false, stalled: false
        )),
        ("failed", MediaState(
            loadId: "load-1", status: .failed, seekId: nil,
            time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, stalled: false
        )),
        ("stalledWhilePlaying", MediaState(
            loadId: "load-1", status: .ready, seekId: nil,
            time: 11.5, duration: 180, paused: false, rate: 1, volume: 1, buffered: 11.5,
            ended: false, stalled: true
        )),
        ("nothingLoaded", MediaState(
            loadId: nil, status: .loading, seekId: nil,
            time: 0, duration: 0, paused: true, rate: 1, volume: 1, buffered: 0, ended: false, stalled: false
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
