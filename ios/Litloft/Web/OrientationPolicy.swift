import UIKit

/// What the app lets the system rotate to. The application delegate reads it,
/// and it replaces the build settings' orientations for every idiom, so both
/// sets are spelled out here.
enum OrientationPolicy {
    @MainActor static var isLocked = false

    static func supported(locked: Bool, idiom: UIUserInterfaceIdiom) -> UIInterfaceOrientationMask {
        guard idiom == .phone else { return .all }
        return locked ? .landscape : [.portrait, .landscapeLeft, .landscapeRight]
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    @MainActor
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        OrientationPolicy.supported(locked: OrientationPolicy.isLocked, idiom: UIDevice.current.userInterfaceIdiom)
    }
}
