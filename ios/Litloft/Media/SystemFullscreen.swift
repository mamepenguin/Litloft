import AVFoundation
import AVKit
import UIKit

/// The system's own fullscreen player for the video the shell holds, behind a
/// door a test can open: the real one presents a view controller.
@MainActor
protocol SystemFullscreen: AnyObject {
    /// On screen, or carried on in the picture in picture it started.
    var isActive: Bool { get }
    /// It went away and left no picture in picture of its own behind.
    var onEnd: (() -> Void)? { get set }
    func present(_ player: AVPlayer, from view: UIView)
    func dismiss()
}

@MainActor
final class SystemFullscreenPlayer: NSObject, SystemFullscreen, AVPlayerViewControllerDelegate {
    /// Made once and kept, with its player: releasing the controller, or
    /// taking the player from it, puts the player back to the start.
    private var controller: AVPlayerViewController?
    private(set) var isActive = false
    private var onScreen = false
    private var inPictureInPicture = false

    var onEnd: (() -> Void)?

    func present(_ player: AVPlayer, from view: UIView) {
        guard !isActive, let presenter = Self.topmost(from: view) else { return }
        let controller = controller ?? makeController()
        if controller.player !== player { controller.player = player }
        isActive = true
        onScreen = true
        presenter.present(controller, animated: true)
    }

    func dismiss() {
        guard isActive else { return }
        if onScreen { controller?.dismiss(animated: false) }
        end()
    }

    private func makeController() -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.delegate = self
        controller.modalPresentationStyle = .fullScreen
        self.controller = controller
        return controller
    }

    private func end() {
        guard isActive else { return }
        isActive = false
        onScreen = false
        inPictureInPicture = false
        onEnd?()
    }

    private static func topmost(from view: UIView) -> UIViewController? {
        var top = view.window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willEndFullScreenPresentationWithAnimationCoordinator coordinator: UIViewControllerTransitionCoordinator
    ) {
        coordinator.animate(alongsideTransition: nil) { [weak self] context in
            guard !context.isCancelled else { return }
            MainActor.assumeIsolated {
                guard let self else { return }
                self.onScreen = false
                if !self.inPictureInPicture { self.end() }
            }
        }
    }

    nonisolated func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        MainActor.assumeIsolated { inPictureInPicture = true }
    }

    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        MainActor.assumeIsolated { leftPictureInPicture() }
    }

    nonisolated func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
        MainActor.assumeIsolated { leftPictureInPicture() }
    }

    /// The page's frame shows the video again; the fullscreen player is not
    /// brought back.
    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }

    private func leftPictureInPicture() {
        inPictureInPicture = false
        if !onScreen { end() }
    }
}
