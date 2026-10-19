import Foundation
import MediaPlayer

/// What the lock screen and Control Center show, and the transport they offer.
///
/// Elapsed time is published when something changes rather than on every tick:
/// the system extrapolates from the position and the rate it was last given.
@MainActor
final class NowPlaying {
    struct State {
        let title: String
        let artist: String?
        let duration: Double
        let time: Double
        let rate: Double
    }

    /// Whoever owns the player wires these; a press with nothing behind it does
    /// nothing rather than being remembered.
    var onPlay: (() -> Void)?
    var onPause: (() -> Void)?
    var onSeek: ((Double) -> Void)?

    private let center = MPNowPlayingInfoCenter.default()
    private var artworkTask: Task<Void, Never>?

    /// The shell answers the transport only while it has something to play;
    /// otherwise Control Center offers buttons that do nothing.
    private(set) var hasCommands = false

    func takeCommands() {
        guard !hasCommands else { return }
        hasCommands = true

        let commands = MPRemoteCommandCenter.shared()

        commands.playCommand.addTarget { [weak self] _ in
            self?.onPlay?()
            return .success
        }
        commands.pauseCommand.addTarget { [weak self] _ in
            self?.onPause?()
            return .success
        }
        commands.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.onTogglePlayPause()
            return .success
        }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.onSeek?(event.positionTime)
            return .success
        }
    }

    /// Set when the shell knows whether it is playing, so the toggle can pick.
    var isPlaying = false

    func onTogglePlayPause() {
        if isPlaying { onPause?() } else { onPlay?() }
    }

    func update(_ state: State) {
        var info = center.nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = state.title
        info[MPMediaItemPropertyArtist] = state.artist ?? ""
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = state.time
        info[MPNowPlayingInfoPropertyPlaybackRate] = state.rate
        info[MPNowPlayingInfoPropertyIsLiveStream] = state.duration <= 0

        if state.duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = state.duration
        } else {
            info.removeValue(forKey: MPMediaItemPropertyPlaybackDuration)
        }

        center.nowPlayingInfo = info
    }

    /// A new file starts with no artwork rather than the last one's.
    func clearArtwork() {
        artworkTask?.cancel()
        artworkTask = nil
        center.nowPlayingInfo?.removeValue(forKey: MPMediaItemPropertyArtwork)
    }

    func showArtwork(from url: URL, cookies: [HTTPCookie]) {
        artworkTask?.cancel()
        artworkTask = Task { [weak self] in
            guard let image = await Self.fetchImage(url, cookies: cookies), !Task.isCancelled else { return }
            self?.center.nowPlayingInfo?[MPMediaItemPropertyArtwork] = Self.artwork(of: image)
        }
    }

    /// The system asks for the picture on a queue of its own, so the handler
    /// must not be tied to the main actor: an isolated one traps there.
    nonisolated static func artwork(of image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }

    func releaseCommands() {
        guard hasCommands else { return }
        hasCommands = false

        let commands = MPRemoteCommandCenter.shared()
        for command in [
            commands.playCommand,
            commands.pauseCommand,
            commands.togglePlayPauseCommand
        ] {
            command.removeTarget(nil)
        }
        commands.changePlaybackPositionCommand.removeTarget(nil)
    }

    func clear() {
        artworkTask?.cancel()
        artworkTask = nil
        center.nowPlayingInfo = nil
        releaseCommands()
    }

    /// The thumbnail sits behind the same access control as the file, and the
    /// shared cookie storage is deliberately empty, so the session rides on the
    /// request itself.
    private static func fetchImage(_ url: URL, cookies: [HTTPCookie]) async -> UIImage? {
        var request = URLRequest(url: url)
        for (field, value) in HTTPCookie.requestHeaderFields(with: cookies) {
            request.setValue(value, forHTTPHeaderField: field)
        }

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200
        else { return nil }

        return UIImage(data: data)
    }
}
