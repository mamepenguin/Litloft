import Foundation

/// The wire shape shared with `frontend/src/lib/nativeBridge.ts`. Both sides
/// are hand-written, so a change here is a change there.
struct ShellMessage: Codable, Equatable {
    let type: String
    let seq: Int
}

/// What the shell reports back while something is playing. `appliedSeq` is the
/// highest command it has acted on, which is how the web side tells a reading
/// taken before a command from one taken after it.
struct MediaTick: Codable, Equatable {
    let type = "media.tick"
    let appliedSeq: Int
    let time: Double
    let duration: Double
    let paused: Bool
    let rate: Double
    let volume: Double
    let ended: Bool

    private enum CodingKeys: String, CodingKey {
        case type, appliedSeq, time, duration, paused, rate, volume, ended
    }
}

struct MediaSource: Equatable {
    let url: URL
    let title: String
    let artist: String?
    let artworkURL: URL?
    let startAt: Double
}

enum MediaCommand: Equatable {
    case load(MediaSource)
    case play
    case pause
    case seek(Double)
    case setRate(Double)
    case setVolume(Double)
    case unload
}

/// What a decoded message asks the shell to do.
enum ShellAction: Equatable {
    case reply(ShellMessage)
    case media(MediaCommand, seq: Int)
}

enum ShellMessageType {
    static let ping = "ping"
    static let pong = "pong"
}
