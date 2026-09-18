import UIKit
import WebKit

/// A file the page asked for as a download, kept until the viewer says where
/// it goes. The web view would otherwise draw the bytes as a page, leaving
/// the app showing a file with none of its own screen around it.
@MainActor
final class FileDownloads: NSObject, WKDownloadDelegate {
    /// Apart so a test does not raise a sheet it cannot dismiss.
    var offer: @MainActor (URL) -> Void = FileDownloads.share

    private var places: [ObjectIdentifier: URL] = [:]

    nonisolated static func isAttachment(_ response: URLResponse) -> Bool {
        guard let http = response as? HTTPURLResponse,
              let disposition = http.value(forHTTPHeaderField: "Content-Disposition")
        else { return false }

        return disposition.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("attachment")
    }

    /// Each download gets a folder of its own, so two files of the same name do
    /// not take each other's place.
    nonisolated static func place(named suggested: String) -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let name = suggested.isEmpty ? "download" : suggested
        return folder.appendingPathComponent(name)
    }

    func take(_ download: WKDownload) {
        download.delegate = self
    }

    // MARK: what happens to a file, in terms a test can name
    //
    // `WKDownload` cannot be built outside WebKit, so the delegate below only
    // turns one into a key.

    func keep(_ place: URL, as key: ObjectIdentifier) {
        places[key] = place
    }

    func arrived(_ key: ObjectIdentifier) {
        guard let place = places.removeValue(forKey: key) else { return }
        offer(place)
    }

    func lost(_ key: ObjectIdentifier) {
        places.removeValue(forKey: key)
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String
    ) async -> URL? {
        let place = Self.place(named: suggestedFilename)
        keep(place, as: ObjectIdentifier(download))
        return place
    }

    func downloadDidFinish(_ download: WKDownload) {
        arrived(ObjectIdentifier(download))
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        lost(ObjectIdentifier(download))
    }

    /// The sheet is raised over a window of its own rather than over the page:
    /// presenting it on the app's own view controller leaves the web view
    /// resized after it goes.
    private static func share(_ file: URL) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive })
        else {
            // Off screen there is nothing to raise a sheet over, and the file
            // is already downloaded: it waits rather than being dropped.
            whenActive { share(file) }
            return
        }

        let window = UIWindow(windowScene: scene)
        window.backgroundColor = .clear
        window.isOpaque = false
        window.rootViewController = UIViewController()
        window.isHidden = false
        guard let root = window.rootViewController else { return }

        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = root.view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: root.view.bounds.midX, y: root.view.bounds.maxY, width: 0, height: 0
        )
        // The window lives as long as the sheet it holds, and no longer.
        sheet.completionWithItemsHandler = { _, _, _, _ in
            window.isHidden = true
            held.remove(window)
        }
        held.insert(window)
        root.present(sheet, animated: true)
    }

    private static var held: Set<UIWindow> = []

    /// Once, however many times the app is brought back.
    private static func whenActive(_ act: @escaping @MainActor () -> Void) {
        var token: NSObjectProtocol?
        var spent = false
        token = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            guard !spent else { return }
            spent = true
            token.map { NotificationCenter.default.removeObserver($0) }
            MainActor.assumeIsolated(act)
        }
    }
}
