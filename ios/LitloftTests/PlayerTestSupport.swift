import AVFoundation
import Foundation
import MediaPlayer
import Testing
import UIKit

@testable import Litloft

@MainActor
final class PlayerRig {
    let player: MediaPlayer
    let session = FakeAudioSession()
    private(set) var states: [MediaState] = []

    init(
        jar: CookieJar = SlowCookieJar(),
        cookieReadLimit: Duration = .seconds(2),
        pictureInPicture: @escaping (AVPlayerLayer) -> PictureInPicture? = { _ in nil },
        fullscreen: SystemFullscreen = FakeSystemFullscreen()
    ) {
        player = MediaPlayer(
            jar: jar,
            audioSession: session,
            cookieReadLimit: cookieReadLimit,
            pictureInPicture: pictureInPicture,
            fullscreen: fullscreen
        )
        player.onState = { [unowned self] in states.append($0) }
    }

    var last: MediaState? { states.last }

    func waitFor(timeout: Duration = .seconds(5), _ condition: () -> Bool) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while !condition() {
            if ContinuousClock.now > deadline { return false }
            try? await Task.sleep(for: .milliseconds(20))
        }
        return true
    }

    func load(_ source: MediaSource, as loadId: String) async {
        await player.apply(.load(source), loadId: loadId).value
    }
}

func tone(seconds: Double) throws -> MediaSource {
    MediaSource(url: try ToneFile.make(seconds: seconds), title: "Tone", artist: nil, artworkURL: nil)
}

/// The running Litloft; these tests need a real stream and a real 404.
enum LocalLitloft {
    static let stream = MediaSource(
        url: URL(string: "http://localhost:3000/api/files/26n_RDXe6Bvv/stream")!,
        title: "Remote", artist: nil, artworkURL: nil
    )
    static let missing = MediaSource(
        url: URL(string: "http://localhost:3000/api/files/zzzzzzzzzzzz/stream")!,
        title: "Missing", artist: nil, artworkURL: nil
    )

    static func require() async throws {
        // The stream answers GET only; one byte is enough to know it is there.
        var request = URLRequest(url: stream.url)
        request.setValue("bytes=0-0", forHTTPHeaderField: "Range")
        request.timeoutInterval = 3
        let status = try? await (URLSession.shared.data(for: request).1 as? HTTPURLResponse)?.statusCode
        try #require(
            status == 206 || status == 200,
            "Litloft is not answering on localhost:3000 (got \(String(describing: status))); these tests stream from it"
        )
    }
}

@MainActor
final class FakePictureInPicture: PictureInPicture {
    var isActive = false
    var isPossible = true
    var startsAutomatically = true
    var starts = 0
    var stops = 0
    var onStarting: ((Bool) -> Void)?
    var onChange: (() -> Void)?

    func start() {
        starts += 1
        onStarting?(true)
        isActive = true
        onStarting?(false)
        onChange?()
    }

    func stop() {
        stops += 1
        isActive = false
        onChange?()
    }

    /// The system starts it by itself when the app leaves the screen.
    func startAutomatically() {
        onStarting?(true)
    }

    func failToStart() {
        onStarting?(false)
        onChange?()
    }
}

@MainActor
final class FakeSystemFullscreen: SystemFullscreen {
    var isActive = false
    var onChange: ((Bool) -> Void)?
    private(set) var presented: [AVPlayer] = []
    private(set) var letGoes = 0

    func present(_ player: AVPlayer, from view: UIView) {
        presented.append(player)
        isActive = true
        onChange?(true)
    }

    func dismiss() {
        end()
    }

    func letGo() {
        letGoes += 1
    }

    /// The viewer closed it, or its picture in picture ended.
    func end() {
        guard isActive else { return }
        isActive = false
        onChange?(false)
    }
}
