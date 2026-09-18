import AVFoundation
import AVKit
import UIKit

/// The system's own fullscreen player for the video the shell holds, behind a
/// door a test can open: the real one presents a view controller.
@MainActor
protocol SystemFullscreen: AnyObject {
    /// On screen, or carried on in the picture in picture it started.
    var isActive: Bool { get }
    /// Its picture in picture is on or starting.
    var isInPictureInPicture: Bool { get }
    /// It became active or stopped being active.
    var onChange: ((Bool) -> Void)? { get set }
    func present(_ player: AVPlayer, from view: UIView)
    /// Takes it off the screen; a picture in picture it started carries on.
    func dismiss()
    /// A player still held here is paused by the system when the app leaves
    /// the screen, unless it is in picture in picture.
    func letGo()
    /// It shows the player it let go of again.
    func takeBack(_ player: AVPlayer)
}

@MainActor
final class SystemFullscreenPlayer: NSObject, SystemFullscreen, AVPlayerViewControllerDelegate {
    /// Made once and kept, with its player while it is up: releasing it, or
    /// taking the player from it, as it closes puts the player back to the start.
    private var controller: AVPlayerViewController?
    private(set) var isInPictureInPicture = false
    private var reported = false

    var onChange: ((Bool) -> Void)?

    /// Read from the controller rather than kept, so the order AVKit calls
    /// back in does not matter.
    var isActive: Bool {
        isInPictureInPicture || controller?.presentingViewController != nil
    }

    /// The player the fullscreen player shows.
    var player: AVPlayer? { controller?.player }

    func present(_ player: AVPlayer, from view: UIView) {
        guard !isActive, let presenter = Self.topmost(from: view) else { return }
        let controller = controller ?? makeController()
        if controller.player !== player { controller.player = player }
        presenter.present(controller, animated: true)
        settle()
    }

    func dismiss() {
        guard let controller, controller.presentingViewController != nil else { return }
        // Asked while it is still being presented, UIKit finishes that first.
        controller.dismiss(animated: false) { [weak self] in self?.settle() }
        settle()
    }

    func letGo() {
        controller?.player = nil
    }

    func takeBack(_ player: AVPlayer) {
        guard let controller, controller.player == nil else { return }
        controller.player = player
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

    private func settle() {
        let active = isActive
        guard active != reported else { return }
        reported = active
        onChange?(active)
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
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            MainActor.assumeIsolated { self?.settle() }
        }
    }

    nonisolated func playerViewControllerWillStartPictureInPicture(_ playerViewController: AVPlayerViewController) {
        MainActor.assumeIsolated { setPictureInPicture(true) }
    }

    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        MainActor.assumeIsolated { setPictureInPicture(false) }
    }

    nonisolated func playerViewControllerDidStopPictureInPicture(_ playerViewController: AVPlayerViewController) {
        MainActor.assumeIsolated { setPictureInPicture(false) }
    }

    /// The page's frame shows the video again; the fullscreen player is not
    /// brought back.
    nonisolated func playerViewController(
        _ playerViewController: AVPlayerViewController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }

    func setPictureInPicture(_ active: Bool) {
        isInPictureInPicture = active
        settle()
    }
}
