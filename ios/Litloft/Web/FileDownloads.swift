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

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String
    ) async -> URL? {
        let place = Self.place(named: suggestedFilename)
        places[ObjectIdentifier(download)] = place
        return place
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let place = places.removeValue(forKey: ObjectIdentifier(download)) else { return }
        offer(place)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        places.removeValue(forKey: ObjectIdentifier(download))
    }

    private static func share(_ file: URL) {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController
        else { return }

        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = root.view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: root.view.bounds.midX, y: root.view.bounds.maxY, width: 0, height: 0
        )
        root.present(sheet, animated: true)
    }
}
