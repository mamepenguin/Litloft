import SwiftUI

extension ShareMessage {
    var text: LocalizedStringKey {
        switch self {
        case .connectFirst: return "share.connectFirst"
        case .cannotReach: return "share.cannotReach"
        case .localNetworkDenied: return "share.localNetworkDenied"
        case .noDrives: return "share.noDrives"
        case .lockedHint: return "share.lockedHint"
        case .foldersNotLoaded: return "share.foldersNotLoaded"
        case .nothingToSave: return "share.nothingToSave"
        case .textTooLarge: return "share.textTooLarge"
        case .fileTooLarge(let limit):
            return limit.map { "share.fileTooLargeLimit \($0)" } ?? "share.fileTooLarge"
        case .diskFull: return "share.diskFull"
        case .tooManyWithThisName: return "share.tooManyWithThisName"
        case .driveNotAvailable: return "share.driveNotAvailable"
        case .clipUnavailable: return "share.clipUnavailable"
        case .unknown: return "share.unknown"
        case .checking: return "share.checking"
        case .preparing: return "share.preparing"
        case .waiting: return "share.waiting"
        case .genericFailure: return "share.genericFailure"
        case .saved: return "share.saved"
        }
    }
}

extension ShareOffer {
    var title: LocalizedStringKey {
        switch self {
        case .retry: return "share.retry"
        case .saveAgain: return "share.saveAgain"
        case .saveAsLink: return "share.saveAsLink"
        case .openSettings: return "share.openSettings"
        }
    }
}
