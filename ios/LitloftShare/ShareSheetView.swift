import SwiftUI
import UniformTypeIdentifiers

struct ShareSheetView: View {
    let model: ShareSheetModel
    let onFinish: () -> Void
    let onCancel: () -> Void
    let onSendingChange: (Bool) -> Void
    let onOpenSettings: () -> Void

    @State private var showingDrives = false
    @State private var showingFolders = false

    var body: some View {
        NavigationStack {
            List {
                previewSection
                if model.state != .nothingToSave {
                    destinationSection
                }
                statusSection
                messageSection
            }
            .navigationTitle("Litloft")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(buttonTitle) {
                        switch model.state {
                        case .sending, .stopped, .finishedWithFailures:
                            Task {
                                await model.cancel()
                                onCancel()
                            }
                        default:
                            onCancel()
                        }
                    }
                    .disabled(model.state == .sending && model.queue == nil)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.state == .saved {
                        EmptyView()
                    } else if model.state == .stopped(.driveNotAvailable)
                        || model.state == .finishedWithFailures {
                        Button("share.retry") {
                            Task { await model.retry() }
                        }
                    } else {
                        Button("share.save") {
                            Task {
                                onSendingChange(true)
                                await model.save()
                                onSendingChange(false)
                            }
                        }
                        .disabled(!model.canSave)
                    }
                }
            }
        }
        .sheet(isPresented: $showingDrives) {
            DrivePicker(model: model, isPresented: $showingDrives)
        }
        .sheet(isPresented: $showingFolders) {
            FolderPicker(model: model, isPresented: $showingFolders)
        }
        .onChange(of: model.state) { _, state in
            if state == .saved {
                Task {
                    try? await Task.sleep(for: .seconds(1))
                    onFinish()
                }
            }
        }
    }

    private var buttonTitle: LocalizedStringKey {
        switch model.state {
        case .stopped, .finishedWithFailures, .closed:
            return "share.close"
        default:
            return "share.cancel"
        }
    }

    @ViewBuilder
    private var previewSection: some View {
        Section {
            switch model.payload {
            case .nothing:
                Text("share.nothingToSave")
            case .text(let text):
                VStack(alignment: .leading, spacing: 6) {
                    Text(text.prefix(6 * 80))
                        .lineLimit(6)
                        .font(.body)
                    Text(ShareNote.text(text, folder: model.destination.folder, now: Date()).path)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
            case .link(let url, _):
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.linkKind == .webClip ? "share.webClip" : "share.linkNote")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(url.host() ?? "")
                        .font(.headline)
                    Text(url.absoluteString)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            case .files(let providers):
                FilePreview(providers: providers)
            }
        }
    }

    @ViewBuilder
    private var destinationSection: some View {
        Section {
            Button {
                showingDrives = true
            } label: {
                LabeledContent("share.drive", value: model.destination.drive ?? "")
            }
            .disabled(model.state == .sending)
            Button {
                showingFolders = true
            } label: {
                LabeledContent(
                    "share.folder",
                    value: model.destination.folder.isEmpty ? String(localized: "share.root") : "\(model.destination.folder)/"
                )
            }
            .disabled(model.state == .sending || model.destination.drive == nil)
        } header: {
            Text("share.destination")
        } footer: {
            if model.showsLockedHint {
                Text("share.lockedHint")
            }
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        if let queue = model.queue, !queue.statuses.isEmpty {
            Section {
                ForEach(Array(queue.statuses.enumerated()), id: \.offset) { index, status in
                    StatusRow(status: status) { offer in
                        Task {
                            switch offer {
                            case .retry:
                                await model.retryItem(at: index)
                            case .saveAgain:
                                await model.retryItem(at: index)
                            case .saveAsLink:
                                await model.saveAsLink(at: index)
                            case .openSettings:
                                openSettings()
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var messageSection: some View {
        switch model.state {
        case .blocked(let message), .stopped(let message):
            Section {
                Text(message.text)
                    .foregroundStyle(.red)
                if model.state == .blocked(.cannotReach) || model.state == .blocked(.localNetworkDenied) {
                    Button("share.retry") {
                        Task { await model.load() }
                    }
                }
                if model.state == .blocked(.localNetworkDenied) {
                    Button("share.openSettings") { openSettings() }
                }
            }
        case .textTooLarge(let bytes):
            Section {
                Text("share.textTooLarge")
                    .foregroundStyle(.red)
                Text(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        case .saved:
            Section {
                Label("share.saved", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.teal)
                Text("\(model.destination.drive ?? "") · \(model.destination.folder)/")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        case .nothingToSave:
            Section {
                Text("share.nothingToSave")
            }
        default:
            EmptyView()
        }
    }

    private func openSettings() {
        onOpenSettings()
    }
}

private struct StatusRow: View {
    let status: ShareItemStatus
    let onOffer: (ShareOffer) -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            stateIcon
            VStack(alignment: .leading, spacing: 4) {
                Text(status.name)
                    .lineLimit(1)
                if case .failed(let message) = status.state {
                    Text(message.text)
                        .font(.footnote)
                        .foregroundStyle(.red)
                } else if case .unknown = status.state {
                    Text(ShareMessage.unknown.text)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            ForEach(Array(status.offers.enumerated()), id: \.offset) { _, offer in
                Button(offer.title) { onOffer(offer) }
                    .buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder
    private var stateIcon: some View {
        switch status.state {
        case .saved:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.teal)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.red)
        case .unknown:
            Image(systemName: "questionmark.circle.fill").foregroundStyle(.secondary)
        case .checking:
            ProgressView()
        case .sending, .preparing:
            ProgressView()
        case .waiting:
            Image(systemName: "clock").foregroundStyle(.secondary)
        }
    }
}

private struct FilePreview: View {
    let providers: [NSItemProvider]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                ForEach(Array(providers.prefix(4).enumerated()), id: \.offset) { _, provider in
                    ProviderImage(provider: provider)
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            Text("share.items \(providers.count)")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ProviderImage: View {
    let provider: NSItemProvider
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "doc.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.secondarySystemBackground))
            }
        }
        .task {
            image = await withCheckedContinuation { continuation in
                provider.loadPreviewImage(options: [
                    NSItemProviderPreferredImageSizeKey: CGSize(width: 160, height: 160)
                ]) { image, _ in
                    continuation.resume(returning: image as? UIImage)
                }
            }
        }
    }
}

private struct DrivePicker: View {
    let model: ShareSheetModel
    @Binding var isPresented: Bool

    var body: some View {
        NavigationStack {
            List(model.drives, id: \.self) { drive in
                Button {
                    Task {
                        await model.pickDrive(drive)
                        isPresented = false
                    }
                } label: {
                    HStack {
                        Text(drive)
                        Spacer()
                        if model.destination.drive == drive {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
            .navigationTitle("share.drive")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("share.cancel") { isPresented = false }
                }
            }
        }
    }
}

private struct FolderPicker: View {
    let model: ShareSheetModel
    @Binding var isPresented: Bool
    @State private var root = ""
    @State private var folders: [String] = []
    @State private var failed = false

    var body: some View {
        NavigationStack {
            List {
                if failed {
                    Text("share.foldersNotLoaded").foregroundStyle(.red)
                    Button("share.retry") { Task { await load() } }
                }
                ForEach(folders, id: \.self) { path in
                    Button {
                        root = path
                        Task { await load() }
                    } label: {
                        HStack {
                            Text(path.split(separator: "/").last.map(String.init) ?? path)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle(root.isEmpty ? String(localized: "share.root") : root)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("share.cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("share.saveHere") {
                        model.pickFolder(root)
                        isPresented = false
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    if !root.isEmpty {
                        Button("share.up") {
                            root = (root as NSString).deletingLastPathComponent
                            if root == "." { root = "" }
                            Task { await load() }
                        }
                    }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        failed = false
        do {
            folders = try await model.loadFolders(root: root)
        } catch {
            failed = true
            folders = []
        }
    }
}
