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
    /// Asked to play and waiting for data.
    let waiting: Bool
    let pip: Bool
    /// Whether picture in picture can start for what is loaded now.
    let pipPossible: Bool

    private enum CodingKeys: String, CodingKey {
        case type, loadId, status, seekId, time, duration, paused, rate, volume, buffered, ended, waiting
        case pip, pipPossible
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
        try container.encode(waiting, forKey: .waiting)
        try container.encode(pip, forKey: .pip)
        try container.encode(pipPossible, forKey: .pipPossible)
    }
}

enum MediaKind: String, Equatable {
    case audio
    case video
}

extension MediaState {
    /// Nothing is loaded and nothing will be: only the failure is worth saying.
    static func unreadable(loadId: String) -> MediaState {
        MediaState(
            loadId: loadId, status: .failed, seekId: nil, time: 0, duration: 0,
            paused: true, rate: 1, volume: 1, buffered: 0, ended: false, waiting: false,
            pip: false, pipPossible: false
        )
    }
}

struct MediaSource: Equatable {
    let url: URL
    let title: String
    let artist: String?
    let artworkURL: URL?
    var kind: MediaKind = .audio

    func with(_ kind: MediaKind) -> MediaSource {
        MediaSource(url: url, title: title, artist: artist, artworkURL: artworkURL, kind: kind)
    }
}

/// Where the page draws the video, in terms that do not change while the page
/// scrolls. `top` is from the document's top, from the scrolling element's
/// content top, or from the viewport's top, by `anchor`.
struct SurfaceGeometry: Equatable {
    enum Anchor: Equatable {
        case document
        /// The scrolling element's box, its top in the document's coordinates.
        case scroller(CGRect)
        case fixed
    }

    struct Stick: Equatable {
        /// The viewport top the frame sticks at.
        let top: Double
        /// The content coordinate the frame's bottom cannot pass.
        let limit: Double
    }

    let left: Double
    let width: Double
    let height: Double
    let anchor: Anchor
    let top: Double
    let stick: Stick?
}

struct PageColor: Equatable {
    let red: Double
    let green: Double
    let blue: Double
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
    /// No geometry: the page shows no frame for the video.
    case surface(SurfaceGeometry?)
    case pip(active: Bool)
}

/// What a decoded message asks the shell to do. `loadId` names the file a
/// command is for; the player-wide settings have none.
enum ShellAction: Equatable {
    case reply(ShellMessage)
    case media(MediaCommand, loadId: String?)
    case pageBackground(PageColor)
    case embedFullscreen(videoId: String)
    /// A command about a file this shell cannot read, from a page built
    /// against another version of the contract. Reported rather than dropped,
    /// or the page waits for a load that will never happen.
    case unreadable(loadId: String)
}

enum ShellMessageType {
    static let ping = "ping"
    static let pong = "pong"
}
