import SwiftUI

struct WebShell: View {
    let onChangeServer: () -> Void

    @State private var model: WebViewModel
    @State private var orientation: OrientationController

    init(serverURL: URL, onChangeServer: @escaping () -> Void) {
        self.init(model: WebViewModel(serverURL: serverURL), onChangeServer: onChangeServer)
    }

    init(model: WebViewModel, onChangeServer: @escaping () -> Void) {
        self.onChangeServer = onChangeServer
        let orientation = OrientationController()
        Self.connect(model, to: orientation)
        _model = State(initialValue: model)
        _orientation = State(initialValue: orientation)
    }

    static func connect(_ model: WebViewModel, to orientation: OrientationController) {
        model.onLandscapeLockChange = { [weak orientation] locked in orientation?.apply(locked: locked) }
        orientation.onRefused = { [weak model] in model?.refuseLandscape() }
    }

    var body: some View {
        ZStack {
            // Fills where the web view does not reach. Unless something is full
            // screen, the web view stays out of the top safe area as the PWA's
            // page does: the page's overlays do not avoid it.
            band.ignoresSafeArea()

            // One modifier whatever the state: two branches would be two
            // views, and SwiftUI would build a new web view, reloading the page.
            WebView(model: model)
                .ignoresSafeArea(edges: model.immersive ? [.top, .bottom] : .bottom)
                .onGeometryChange(for: Bool.self) { _ in
                    model.immersive
                } action: { immersive in
                    model.laidOut(immersive: immersive)
                }

            if case .failed(let message) = model.state {
                ConnectionErrorView(
                    message: message,
                    onRetry: { model.retry() },
                    onChangeServer: onChangeServer
                )
            }
        }
        .statusBarHidden(model.immersive)
    }

    private var band: Color {
        if model.immersive { return .black }
        guard let color = model.pageColor else { return Color(.systemBackground) }
        return Color(red: color.red, green: color.green, blue: color.blue)
    }
}
