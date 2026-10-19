import UIKit

@MainActor
protocol OrientationScene {
    var isPortrait: Bool { get }
    /// `onRefused` is called if the system will not rotate to `mask`.
    func request(_ mask: UIInterfaceOrientationMask, onRefused: (@MainActor () -> Void)?)
}

struct SceneOrientation: OrientationScene {
    private var scene: UIWindowScene? {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    }

    var isPortrait: Bool { scene?.interfaceOrientation.isPortrait ?? false }

    func request(_ mask: UIInterfaceOrientationMask, onRefused: (@MainActor () -> Void)?) {
        guard let scene else {
            onRefused?()
            return
        }
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in
            Task { @MainActor in onRefused?() }
        }
    }
}

/// Holds the app landscape while it is asked to, and puts it back afterwards.
/// An app already in landscape has nothing to force, so it is left alone and
/// there is nothing to put back.
@MainActor
final class OrientationController {
    var onRefused: (() -> Void)?

    private let scene: OrientationScene
    private var holding = false

    init(scene: OrientationScene = SceneOrientation()) {
        self.scene = scene
    }

    isolated deinit {
        apply(locked: false)
    }

    func apply(locked: Bool) {
        if locked {
            guard !holding, scene.isPortrait else { return }
            holding = true
            OrientationPolicy.isLocked = true
            scene.request(.landscape) { [weak self] in self?.refused() }
        } else if holding {
            holding = false
            OrientationPolicy.isLocked = false
            scene.request(.portrait, onRefused: nil)
        }
    }

    private func refused() {
        guard holding else { return }
        holding = false
        OrientationPolicy.isLocked = false
        onRefused?()
    }
}
