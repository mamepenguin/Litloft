import Foundation

/// The wire shape shared with `frontend/src/lib/nativeBridge.ts`. Both sides
/// are checked against `frontend/src/lib/__tests__/fixtures/shell-contract.json`.
struct ShellMessage: Codable, Equatable {
    let type: String
    let seq: Int
}

enum MediaStatus: String, Encodable, Equatable {
    case loading
    case ready
    case failed
}

/// What the shell reports about the file it holds, sent whenever any of it
/// changes. `loadId` and `seekId` are the web side's own ids handed back, so it
/// matches a report by equality rather than inferring from its order.
struct MediaState: Encodable, Equatable {
    let loadId: String?
    let status: MediaStatus
    let seekId: String?
    let time: Double
    let duration: Double
    let paused: Bool
    let rate: Double
    let volume: Double
    /// Seconds continuously readable from the start, not a total.
    let buffered: Double
    let ended: Bool
    /// Ran out of data while playing. AVPlayer keeps waiting for a stream that
    /// stops answering rather than failing it.
    let stalled: Bool

    private enum CodingKeys: String, CodingKey {
        case type, loadId, status, seekId, time, duration, paused, rate, volume, buffered, ended, stalled
    }

    /// Absent ids are sent as null rather than left out, as the web side reads them.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("media.state", forKey: .type)
        try container.encode(loadId, forKey: .loadId)
        try container.encode(status, forKey: .status)
        try container.encode(seekId, forKey: .seekId)
        try container.encode(time, forKey: .time)
        try container.encode(duration, forKey: .duration)
        try container.encode(paused, forKey: .paused)
        try container.encode(rate, forKey: .rate)
        try container.encode(volume, forKey: .volume)
        try container.encode(buffered, forKey: .buffered)
        try container.encode(ended, forKey: .ended)
        try container.encode(stalled, forKey: .stalled)
    }
}

struct MediaSource: Equatable {
    let url: URL
    let title: String
    let artist: String?
    let artworkURL: URL?
}

enum MediaCommand: Equatable {
    case load(MediaSource)
    case play
    case pause
    /// A seek the shell makes itself, from the lock screen, has no id: the web
    /// side did not issue it.
    case seek(time: Double, seekId: String?)
    case unload
    case setRate(Double)
    case setVolume(Double)
}

/// What a decoded message asks the shell to do. `loadId` names the file a
/// command is for; the player-wide settings have none.
enum ShellAction: Equatable {
    case reply(ShellMessage)
    case media(MediaCommand, loadId: String?)
}

enum ShellMessageType {
    static let ping = "ping"
    static let pong = "pong"
}
