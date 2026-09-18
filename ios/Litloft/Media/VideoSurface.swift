import AVFoundation
import AVKit
import UIKit
import WebKit
import os

final class PlayerLayerView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    // swiftlint:disable:next force_cast
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

/// Shows the player's video behind the web view, where the page draws its
/// frame. The page makes that frame and its ancestors transparent; this keeps
/// the web view's own layers transparent too and follows the frame on every
/// display frame.
@MainActor
final class VideoSurface: NSObject {
    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "surface")
    private let player: AVPlayer
    let view = PlayerLayerView()
    private weak var webView: WKWebView?

    private var showsVideo = false
    private var geometry: SurfaceGeometry?
    private var pageColor: UIColor?
    private weak var scroller: UIScrollView?
    private var scrollerBox: CGRect?
    private var framesSinceSearch = 0
    private var swipe: Double = 0
    private var followsSwipe = false
    private var link: CADisplayLink?
    private var observers: [NSObjectProtocol] = []

    private var pip: PictureInPicture?
    private let makePictureInPicture: (AVPlayerLayer) -> PictureInPicture?
    private(set) var pipStarting = false
    private var wasInBackground = false
    private let fullscreen: SystemFullscreen

    /// Picture in picture started, stopped, or became possible or impossible.
    var onPictureInPictureChange: (() -> Void)?
    /// The system's fullscreen player went away; the viewer may have moved the
    /// video while it was up.
    var onFullscreenEnd: (() -> Void)?

    init(
        player: AVPlayer,
        pictureInPicture: @escaping (AVPlayerLayer) -> PictureInPicture? = { SystemPictureInPicture(layer: $0) },
        fullscreen: SystemFullscreen = SystemFullscreenPlayer()
    ) {
        self.player = player
        makePictureInPicture = pictureInPicture
        self.fullscreen = fullscreen
        super.init()
        fullscreen.onChange = { [weak self] active in self?.fullscreenChanged(active) }
        view.isUserInteractionEnabled = false
        view.backgroundColor = .black
        view.isHidden = true
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
    }

    isolated deinit {
        link?.invalidate()
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        view.removeFromSuperview()
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        webView.isOpaque = false
        webView.insertSubview(view, at: 0)
        preparePictureInPicture()
        watchLifecycle()

        let link = CADisplayLink(target: DisplayLinkTarget(self), selector: #selector(DisplayLinkTarget.tick))
        link.isPaused = true
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    // MARK: what the page says

    /// Called for every load and unload. Only a video has anything to show,
    /// and a new file shows nothing until its page places it.
    func showsVideo(_ shows: Bool) {
        // Whatever is in picture in picture is this player, and the file it was
        // playing is on its way out.
        if isPictureInPictureActive { pip?.stop() }
        fullscreen.dismiss()
        showsVideo = shows
        geometry = nil
        scroller = nil
        scrollerBox = nil
        refresh()
        onPictureInPictureChange?()
    }

    func place(_ geometry: SurfaceGeometry?) {
        self.geometry = geometry
        if case .scroller(let box) = geometry?.anchor {
            if box != scrollerBox || scroller?.window == nil {
                scrollerBox = box
                searchForScroller()
            }
        } else {
            scroller = nil
            scrollerBox = nil
        }
        followSwipe()
        refresh()
    }

    func setPageColor(_ color: PageColor) {
        pageColor = UIColor(red: color.red, green: color.green, blue: color.blue, alpha: 1)
        clearBackgrounds()
    }

    // MARK: following the frame

    private var visible: Bool { showsVideo && geometry != nil }

    private func refresh() {
        link?.isPaused = !visible
        if visible {
            clearBackgrounds()
            follow()
        } else {
            view.isHidden = true
        }
    }

    /// WebKit builds a scrolling element's scroll view a frame or more after
    /// the page has laid it out, which is when the page reports it; until one
    /// turns up, it is looked for again every few frames.
    private func searchForScroller() {
        guard let box = scrollerBox else { return }
        framesSinceSearch = 0
        scroller = findScroller(matching: box)
    }

    fileprivate func follow() {
        guard visible, let geometry, let webView else { return }
        if scrollerBox != nil, scroller?.window == nil {
            framesSinceSearch += 1
            if framesSinceSearch >= 10 { searchForScroller() }
        }
        let main = webView.scrollView
        let offsets = SurfacePlacement.Offsets(
            document: Double(main.contentOffset.y + main.adjustedContentInset.top),
            scroller: scroller.map {
                (
                    top: Double($0.superview?.convert($0.frame.origin, to: webView).y ?? 0),
                    scrolled: Double($0.contentOffset.y + $0.adjustedContentInset.top)
                )
            }
        )
        guard let frame = SurfacePlacement.frame(for: geometry, offsets: offsets, swipe: swipe) else {
            view.isHidden = true
            return
        }
        if view.frame != frame {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            view.frame = frame
            CATransaction.commit()
        }
        view.isHidden = false
    }

    /// The web view and its scroll view are painted for overscroll (`WebView`),
    /// and that paint would cover the video. The web view's own background is
    /// drawn beneath its subviews, the video included, so it keeps the page's
    /// colour and fills whatever the page leaves bare, a back-swipe snapshot
    /// included; the scroll view above it is cleared.
    private func clearBackgrounds() {
        guard let webView else { return }
        if let pageColor {
            if webView.backgroundColor != pageColor { webView.backgroundColor = pageColor }
            if webView.underPageBackgroundColor != pageColor { webView.underPageBackgroundColor = pageColor }
        }
        guard showsVideo else { return }
        if webView.scrollView.backgroundColor != .clear { webView.scrollView.backgroundColor = .clear }
        for subview in webView.scrollView.subviews
        where Self.isContentView(subview) && subview.backgroundColor != .clear {
            subview.backgroundColor = .clear
        }
    }

    nonisolated static func isContentView(_ view: UIView) -> Bool {
        String(describing: type(of: view)) == "WKContentView"
    }

    /// WebKit backs a scrolling element with a scroll view of its own, placed
    /// where the element is; the page reports the element's box, so the box
    /// identifies it.
    private func findScroller(matching box: CGRect) -> UIScrollView? {
        guard let webView else { return nil }
        // The page reports where the element is in the document; the scroll
        // views are where they are now.
        let main = webView.scrollView
        let documentOffset = Double(main.contentOffset.y + main.adjustedContentInset.top)
        let expected = CGRect(
            x: box.minX, y: box.minY - documentOffset, width: box.width, height: box.height
        )
        var found: UIScrollView?
        func walk(_ parent: UIView) {
            for subview in parent.subviews {
                if let scroll = subview as? UIScrollView, scroll !== webView.scrollView,
                   let frame = scroll.superview?.convert(scroll.frame, to: webView),
                   Self.matches(frame, expected) {
                    found = scroll
                }
                walk(subview)
            }
        }
        walk(webView.scrollView)
        return found
    }

    nonisolated static func matches(_ frame: CGRect, _ box: CGRect) -> Bool {
        let tolerance: CGFloat = 2
        return abs(frame.minX - box.minX) < tolerance && abs(frame.minY - box.minY) < tolerance
            && abs(frame.width - box.width) < tolerance && abs(frame.height - box.height) < tolerance
    }

    /// A back swipe slides a snapshot of the page, not the page. The system's
    /// recognizers sit on the web view's ancestors and exist only once
    /// back-forward gestures are allowed, so they are looked up late.
    private func followSwipe() {
        guard !followsSwipe, let webView else { return }
        var ancestor: UIView? = webView
        while let current = ancestor {
            for recognizer in current.gestureRecognizers ?? []
            where recognizer is UIPanGestureRecognizer && Self.slidesThePage(recognizer) {
                recognizer.addTarget(self, action: #selector(swiped(_:)))
                followsSwipe = true
            }
            ancestor = current.superview
        }
    }

    /// The system's own back-forward swipe, named for the parallax it draws.
    nonisolated static func slidesThePage(_ recognizer: UIGestureRecognizer) -> Bool {
        String(describing: type(of: recognizer)).contains("ParallaxTransition")
    }

    @objc func swiped(_ recognizer: UIPanGestureRecognizer) {
        switch recognizer.state {
        case .began, .changed:
            swipe = Double(recognizer.translation(in: webView).x)
        default:
            swipe = 0
        }
        follow()
    }

    // MARK: background and picture in picture

    private func watchLifecycle() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.enteredBackground() }
        })
        observers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.becameActive() }
        })
    }

    /// A player still attached to a layer is paused by the system when the app
    /// leaves the screen; audio keeps going once this surface and the system
    /// player have both let go. A picture in picture, either one's, needs its
    /// layer, so nothing lets go while one is on or starting.
    func enteredBackground() {
        wasInBackground = true
        guard !isPictureInPictureActive, !pipStarting, !fullscreen.isInPictureInPicture else { return }
        view.playerLayer.player = nil
        fullscreen.letGo()
    }

    /// Picture in picture kept the layer while it started or ran. Off screen
    /// without it, the system pauses a player that still has one.
    private func letGoIfStillAway() {
        guard wasInBackground else { return }
        enteredBackground()
    }

    func becameActive() {
        view.playerLayer.player = player
        fullscreen.takeBack(player)
        // Pulling Control Center down and letting it go is not coming back.
        guard wasInBackground else { return }
        wasInBackground = false
        if isPictureInPictureActive {
            pip?.stop()
        }
    }

    var isPictureInPictureActive: Bool { pip?.isActive ?? false }

    var isPictureInPicturePossible: Bool {
        showsVideo && (pip?.isPossible ?? false)
    }

    func setPictureInPicture(_ active: Bool) {
        guard showsVideo, let pip else { return }
        if active, !pip.isActive {
            pip.start()
        } else if !active, pip.isActive {
            pip.stop()
        }
    }

    private func preparePictureInPicture() {
        guard let pip = makePictureInPicture(view.playerLayer) else { return }
        pip.onStarting = { [weak self] starting in self?.pipStarting = starting }
        pip.onChange = { [weak self] in
            // Started, stopped or gave up. Off screen without it, the player
            // has to let go of its layer or the system pauses it.
            self?.letGoIfStillAway()
            self?.onPictureInPictureChange?()
        }
        self.pip = pip
    }
}

// MARK: the system's fullscreen player

extension VideoSurface {
    func presentFullscreen() {
        guard showsVideo, !fullscreen.isActive, let webView else { return }
        if isPictureInPictureActive { pip?.stop() }
        fullscreen.present(player, from: webView)
    }

    /// While it is active it owns picture in picture, so this surface's own
    /// does not also start when the app leaves the screen.
    fileprivate func fullscreenChanged(_ active: Bool) {
        pip?.startsAutomatically = !active
        guard !active else { return }
        letGoIfStillAway()
        onFullscreenEnd?()
    }
}

/// A display link keeps its target alive; this keeps the surface out of that.
@MainActor
private final class DisplayLinkTarget: NSObject {
    private weak var surface: VideoSurface?

    init(_ surface: VideoSurface) {
        self.surface = surface
    }

    @objc func tick() {
        surface?.follow()
    }
}
