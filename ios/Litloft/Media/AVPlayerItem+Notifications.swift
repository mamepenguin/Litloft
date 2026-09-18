import AVFoundation

extension AVPlayerItem {
    /// Runs `action` on the main actor each time this item posts `name`.
    func observe(_ name: Notification.Name, _ action: @escaping @MainActor () -> Void) -> NSObjectProtocol {
        NotificationCenter.default.addObserver(forName: name, object: self, queue: .main) { _ in
            Task { @MainActor in action() }
        }
    }
}
