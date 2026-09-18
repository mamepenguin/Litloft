import AVFoundation
import AVKit

/// The system's picture in picture, behind a door a test can open: the
/// simulator has none (`isPictureInPictureSupported` is false there), so the
/// rules about when it starts and stops are held with a stand-in.
@MainActor
protocol PictureInPicture: AnyObject {
    var isActive: Bool { get }
    var isPossible: Bool { get }
    /// Whether leaving the app starts it by itself.
    var startsAutomatically: Bool { get set }
    func start()
    func stop()
    /// It is about to start, so the layer it draws from must stay attached.
    var onStarting: ((Bool) -> Void)? { get set }
    /// It started, stopped, failed, or became possible or impossible.
    var onChange: (() -> Void)? { get set }
}

@MainActor
final class SystemPictureInPicture: NSObject, PictureInPicture, AVPictureInPictureControllerDelegate {
    private let controller: AVPictureInPictureController
    private var possibleObservation: NSKeyValueObservation?

    var onStarting: ((Bool) -> Void)?
    var onChange: (() -> Void)?

    /// Nil where the system has no picture in picture at all.
    init?(layer: AVPlayerLayer) {
        guard AVPictureInPictureController.isPictureInPictureSupported(),
              let controller = AVPictureInPictureController(playerLayer: layer)
        else { return nil }
        self.controller = controller
        super.init()
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.delegate = self
        possibleObservation = controller.observe(\.isPictureInPicturePossible) { [weak self] _, _ in
            Task { @MainActor in self?.onChange?() }
        }
    }

    isolated deinit {
        possibleObservation?.invalidate()
    }

    var isActive: Bool { controller.isPictureInPictureActive }
    var isPossible: Bool { controller.isPictureInPicturePossible }

    var startsAutomatically: Bool {
        get { controller.canStartPictureInPictureAutomaticallyFromInline }
        set { controller.canStartPictureInPictureAutomaticallyFromInline = newValue }
    }

    func start() {
        controller.startPictureInPicture()
    }

    func stop() {
        controller.stopPictureInPicture()
    }

    nonisolated func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
        MainActor.assumeIsolated { onStarting?(true) }
    }

    nonisolated func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        MainActor.assumeIsolated {
            onStarting?(false)
            onChange?()
        }
    }

    nonisolated func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        MainActor.assumeIsolated {
            onStarting?(false)
            onChange?()
        }
    }

    nonisolated func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        MainActor.assumeIsolated { onChange?() }
    }

    /// The video is already back behind the page's frame; nothing to restore.
    nonisolated func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }
}
