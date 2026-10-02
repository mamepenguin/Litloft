import Testing
import UIKit

@testable import Litloft

@MainActor
struct LandscapeLockTests {
    private let server = URL(string: "http://litloft.local:3000/")!

    private func model(idiom: UIUserInterfaceIdiom = .phone) -> WebViewModel {
        WebViewModel(serverURL: server, idiom: idiom)
    }

    @Test("a request for landscape locks it on a phone, and going back unlocks it")
    func locksAndUnlocks() {
        let model = model()
        var changes: [Bool] = []
        model.onLandscapeLockChange = { changes.append($0) }

        model.setImmersive(true, landscape: true)
        #expect(model.immersive)
        #expect(model.landscapeLocked)

        model.setImmersive(false)
        #expect(!model.immersive)
        #expect(!model.landscapeLocked)
        #expect(changes == [true, false])
    }

    @Test("a plain immersive request does not lock")
    func plainRequestDoesNotLock() {
        let model = model()

        model.setImmersive(true)

        #expect(model.immersive)
        #expect(!model.landscapeLocked)
    }

    @Test("an iPad never locks, whatever the page asks")
    func padNeverLocks() {
        let model = model(idiom: .pad)

        model.setImmersive(true, landscape: true)

        #expect(model.immersive)
        #expect(!model.landscapeLocked)
    }

    @Test("a lock that is asked for again is reported once")
    func lockIsReportedOnce() {
        let model = model()
        var changes: [Bool] = []
        model.onLandscapeLockChange = { changes.append($0) }

        model.setImmersive(true, landscape: true)
        model.setImmersive(true, landscape: true)

        #expect(changes == [true])
    }

    @Test("a refused rotation clears the lock, keeps the shell immersive, and asks for a layout")
    func refusalClearsTheLock() {
        let model = model()
        var laidOut = 0
        model.onImmersiveLaidOut = { laidOut += 1 }
        model.setImmersive(true, landscape: true)

        model.refuseLandscape()

        #expect(!model.landscapeLocked)
        #expect(model.immersive)
        #expect(laidOut == 1)
    }
}
