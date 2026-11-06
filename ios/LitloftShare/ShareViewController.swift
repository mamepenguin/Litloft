import SwiftUI
import UIKit

/// The share extension's entry point: classify what was shared, show the
/// sheet, and complete the request when the viewer is done.
final class ShareViewController: UIViewController {
    private var hosting: UIHostingController<ShareSheetView>?
    private var model: ShareSheetModel?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        Task { await presentSheet() }
    }

    @MainActor
    private func presentSheet() async {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let payload = await ShareClassifier.classify(items)
        let model = ShareSheetModel(payload: payload, session: GroupSharedSession())
        self.model = model

        let sheet = ShareSheetView(
            model: model,
            onFinish: { [weak self] in self?.finish() },
            onCancel: { [weak self] in self?.cancel() },
            onSendingChange: { [weak self] sending in self?.isModalInPresentation = sending },
            onOpenSettings: { [weak self] in self?.openSettings() }
        )
        let hosting = UIHostingController(rootView: sheet)
        hosting.view.backgroundColor = .clear
        addChild(hosting)
        view.addSubview(hosting.view)
        hosting.view.frame = view.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        hosting.didMove(toParent: self)
        self.hosting = hosting

        await model.load()
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "LitloftShare", code: 1))
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        extensionContext?.open(url)
    }
}
