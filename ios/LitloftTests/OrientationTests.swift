import Testing
import UIKit

@testable import Litloft

@MainActor
private final class FakeScene: OrientationScene {
    var isPortrait = true
    private(set) var requests: [UIInterfaceOrientationMask] = []
    private var refusal: (@MainActor () -> Void)?

    func request(_ mask: UIInterfaceOrientationMask, onRefused: (@MainActor () -> Void)?) {
        requests.append(mask)
        refusal = onRefused
    }

    func refuse() { refusal?() }
}

struct OrientationPolicyTests {
    @Test("what the app supports follows the lock, and an iPad is never held")
    func supported() {
        let table: [(Bool, UIUserInterfaceIdiom, UIInterfaceOrientationMask)] = [
            (true, .phone, .landscape),
            (false, .phone, [.portrait, .landscapeLeft, .landscapeRight]),
            (false, .pad, .all),
            (true, .pad, .all)
        ]
        for (locked, idiom, mask) in table {
            #expect(OrientationPolicy.supported(locked: locked, idiom: idiom) == mask, "locked \(locked) on \(idiom.rawValue)")
        }
    }
}

@MainActor
@Suite(.serialized)
struct OrientationWiringTests {
    @Test("the app asks the policy which orientations it supports")
    func theApplicationDelegateAnswersFromThePolicy() throws {
        let delegate = try #require(UIApplication.shared.delegate)
        let ask = { delegate.application?(UIApplication.shared, supportedInterfaceOrientationsFor: nil) }
        defer { OrientationPolicy.isLocked = false }

        OrientationPolicy.isLocked = true
        #expect(ask() == .landscape)

        OrientationPolicy.isLocked = false
        #expect(ask() == [.portrait, .landscapeLeft, .landscapeRight])
    }

    @Test("a request for landscape reaches the scene, and a refusal reaches the model and its layout")
    func modelAndControllerAreJoined() {
        OrientationPolicy.isLocked = false
        let scene = FakeScene()
        let model = WebViewModel(serverURL: URL(string: "http://litloft.local:3000/")!, idiom: .phone)
        let controller = OrientationController(scene: scene)
        var laidOut = 0
        model.onImmersiveLaidOut = { laidOut += 1 }
        WebShell.connect(model, to: controller)

        model.setImmersive(true, landscape: true)
        #expect(scene.requests == [.landscape])

        scene.refuse()
        #expect(!model.landscapeLocked)
        #expect(laidOut == 1)
        #expect(!OrientationPolicy.isLocked)
    }
}

@MainActor
@Suite(.serialized)
struct OrientationControllerTests {
    private func rig(portrait: Bool = true) -> (OrientationController, FakeScene) {
        OrientationPolicy.isLocked = false
        let scene = FakeScene()
        scene.isPortrait = portrait
        return (OrientationController(scene: scene), scene)
    }

    @Test("locking from portrait holds the policy and asks for landscape")
    func locksFromPortrait() {
        let (controller, scene) = rig()
        defer { OrientationPolicy.isLocked = false }

        controller.apply(locked: true)

        #expect(OrientationPolicy.isLocked)
        #expect(scene.requests == [.landscape])
    }

    @Test("an app already in landscape has nothing to force, now or when it lets go")
    func alreadyLandscape() {
        let (controller, scene) = rig(portrait: false)
        defer { OrientationPolicy.isLocked = false }

        controller.apply(locked: true)
        controller.apply(locked: false)

        #expect(!OrientationPolicy.isLocked)
        #expect(scene.requests.isEmpty)
    }

    @Test("letting go restores the policy and asks for portrait")
    func unlocks() {
        let (controller, scene) = rig()

        controller.apply(locked: true)
        controller.apply(locked: false)

        #expect(!OrientationPolicy.isLocked)
        #expect(scene.requests == [.landscape, .portrait])
    }

    @Test("letting go of nothing asks for nothing, and locking twice asks once")
    func idempotent() {
        let (controller, scene) = rig()
        defer { OrientationPolicy.isLocked = false }

        controller.apply(locked: false)
        controller.apply(locked: true)
        controller.apply(locked: true)

        #expect(scene.requests == [.landscape])
    }

    @Test("a refused rotation clears the lock and is reported once")
    func refusal() {
        let (controller, scene) = rig()
        var refused = 0
        controller.onRefused = { refused += 1 }

        controller.apply(locked: true)
        scene.refuse()
        controller.apply(locked: false)

        #expect(refused == 1)
        #expect(!OrientationPolicy.isLocked)
        #expect(scene.requests == [.landscape], "nothing was locked, so there is no portrait to return to")
    }

    @Test("the shell going away while locked puts the app back")
    func teardownUnlocks() {
        let scene = FakeScene()
        OrientationPolicy.isLocked = false
        var controller: OrientationController? = OrientationController(scene: scene)
        controller?.apply(locked: true)

        controller = nil

        #expect(!OrientationPolicy.isLocked)
        #expect(scene.requests == [.landscape, .portrait])
    }
}
