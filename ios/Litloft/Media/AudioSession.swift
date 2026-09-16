import AVFoundation
import os

/// Taking the audio session makes the *whole app* eligible for background
/// audio, the web view's own media included, so the shell only holds it while
/// it has something to play.
@MainActor
protocol AudioSession: AnyObject {
    func take()
    func release()
}

@MainActor
final class SystemAudioSession: AudioSession {
    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "player")

    func take() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            log.error("could not take the audio session: \(error, privacy: .public)")
        }
    }

    func release() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            log.error("could not give up the audio session: \(error, privacy: .public)")
        }
    }
}
