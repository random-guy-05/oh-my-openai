// EnhancementHub.swift — SwiftUI command center for bundled enhancements.
// Compiled into the launcher (mixed ObjC+Swift) and exposed to ObjC via
// @_cdecl entry points. Shares the process, bundle, and UserDefaults domain
// with the launcher.
//
// Design: themed to match the actual Codex app — light surfaces (#FFFFFF /
// #F5F7F6), the multicolor spark brand mark (red #FF4F52 / orange #F49E36 /
// green #00C24B), action blue #0093F7, text #181A1C / #6D6E6F, hairline
// borders #E2E4E0, 10/8/6 radii. Dark-mode variants follow the system.

import AppKit
import Foundation
import SwiftUI
import WebKit

// MARK: - Codex theme
// Tokens extracted from the actual app's renderer (app.asar): dark-first
// surfaces (#202020 / #303030 / #353535), warm light surfaces (#F5F3EE /
// #F7F5F1 / #EBE8E2), text #171717 / #6B6B6B, action blue #0285FF, and the
// app's model accent family (blue #339CFF, green #40C977, orange #FF8549,
// pink #FF8CC1, purple #AD7BF9, red #FF6764).

enum CodexTheme {
  static let red = Color(red: 1.00, green: 0.40, blue: 0.39)      // #FF6764
  static let orange = Color(red: 1.00, green: 0.52, blue: 0.29)   // #FF8549
  static let green = Color(red: 0.25, green: 0.79, blue: 0.47)    // #40C977
  static let blue = Color(red: 0.01, green: 0.52, blue: 1.00)     // #0285FF
  static let softBlue = Color(red: 0.20, green: 0.61, blue: 1.00) // #339CFF
  static let purple = Color(red: 0.68, green: 0.48, blue: 0.98)   // #AD7BF9
  static let pink = Color(red: 1.00, green: 0.55, blue: 0.76)     // #FF8CC1
  static let sparkGradient = LinearGradient(
    colors: [red, orange, green],
    startPoint: .topLeading, endPoint: .bottomTrailing)

  static func dynamic(light: NSColor, dark: NSColor) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
      appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
    })
  }

  // Surfaces (dark-first, warm light mode)
  static let background = dynamic(light: NSColor(red: 0.961, green: 0.953, blue: 0.933, alpha: 1), // #F5F3EE
                                  dark: NSColor(red: 0.125, green: 0.125, blue: 0.125, alpha: 1)) // #202020
  static let sidebar = dynamic(light: NSColor(red: 0.925, green: 0.910, blue: 0.871, alpha: 1),  // #EBE8E2-ish
                               dark: NSColor(red: 0.176, green: 0.176, blue: 0.176, alpha: 1))   // #2D2D2D
  static let card = dynamic(light: NSColor(red: 0.969, green: 0.961, blue: 0.945, alpha: 1),     // #F7F5F1
                            dark: NSColor(red: 0.188, green: 0.188, blue: 0.188, alpha: 1))      // #303030
  static let cardHover = dynamic(light: NSColor(red: 0.925, green: 0.910, blue: 0.871, alpha: 1), // #EBE8E2
                                 dark: NSColor(red: 0.208, green: 0.208, blue: 0.208, alpha: 1)) // #353535

  // Text
  static let textPrimary = dynamic(light: NSColor(red: 0.09, green: 0.09, blue: 0.09, alpha: 1),  // #171717
                                   dark: NSColor(white: 0.94, alpha: 1))
  static let textSecondary = dynamic(light: NSColor(red: 0.42, green: 0.42, blue: 0.42, alpha: 1), // #6B6B6B
                                     dark: NSColor(white: 0.62, alpha: 1))
  static let textTertiary = dynamic(light: NSColor(red: 0.42, green: 0.42, blue: 0.42, alpha: 1),
                                    dark: NSColor(white: 0.52, alpha: 1))

  // Hairlines
  static let border = dynamic(light: NSColor(red: 0.898, green: 0.882, blue: 0.855, alpha: 1), // warm hairline
                              dark: NSColor(white: 1.0, alpha: 0.10))
}

// MARK: - Model

struct Enhancement: Identifiable, Decodable {
  let id: String
  let type: String
  let resolvedVersion: String?
  let description: String?
  let config: Config?
  let toolCommand: [String]?
  let startCommand: [String]?
  let ui: UI?

  struct Config: Decodable {
    let port: Int?
  }

  struct UI: Decodable {
    let label: String?
    let kind: String?
    let openLabel: String?
    let url: String?
  }

  var label: String { ui?.label ?? id }
  var isService: Bool { type == "service" }
  var kind: String { ui?.kind ?? "tool" }
  var openLabel: String { ui?.openLabel ?? "Open" }

  var symbolName: String {
    switch id {
    case "opencodex": return "globe"
    case "ccusage": return "chart.bar.xaxis"
    case "codex-chatgpt-web": return "bubble.left.and.bubble.right.fill"
    case "codexpp": return "wand.and.stars"
    default: return "sparkles"
    }
  }

  var tint: Color {
    switch id {
    case "opencodex": return CodexTheme.softBlue    // #339CFF — app blue
    case "ccusage": return CodexTheme.orange        // #FF8549 — app orange
    case "codex-chatgpt-web": return CodexTheme.purple // #AD7BF9 — app purple
    case "codexpp": return CodexTheme.pink          // #FF8CC1 — app pink
    default: return CodexTheme.blue
    }
  }

  var viewOptions: [String] {
    switch kind {
    case "web": return ["window", "browser"]
    case "ccusage": return ["report"]
    default: return ["launch"]
    }
  }

  var viewLabels: [String] {
    viewOptions.map { view in
      switch view {
      case "window": return "In-app window"
      case "browser": return "Browser"
      case "report": return "Native report"
      default: return "Launch"
      }
    }
  }

  var detail: String {
    var text = description ?? ""
    if let version = resolvedVersion, !text.contains(version) {
      text = "v\(version) · \(text)"
    }
    if let port = config?.port {
      text = "\(text) · localhost:\(port)"
    }
    return text
  }
}

// MARK: - Persistence (shared with the launcher)

private let kEnabledKey = "OMOEEnhancementsEnabled"
private let kViewKey = "OMOEEnhancementsView"

final class HubState: ObservableObject {
  @Published var enabled: [String: Bool] = HubState.loadEnabled()
  @Published var views: [String: String] = HubState.loadViews()

  private static func loadEnabled() -> [String: Bool] {
    UserDefaults.standard.dictionary(forKey: kEnabledKey) as? [String: Bool] ?? [:]
  }

  private static func loadViews() -> [String: String] {
    UserDefaults.standard.dictionary(forKey: kViewKey) as? [String: String] ?? [:]
  }

  func isEnabled(_ id: String) -> Bool {
    enabled[id] ?? true
  }

  func setEnabled(_ id: String, _ value: Bool) {
    enabled[id] = value
    UserDefaults.standard.set(enabled, forKey: kEnabledKey)
  }

  func view(for id: String, options: [String]) -> String {
    let stored = views[id]
    if let stored, options.contains(stored) { return stored }
    return options.first ?? "launch"
  }

  func setView(_ id: String, _ view: String) {
    views[id] = view
    UserDefaults.standard.set(views, forKey: kViewKey)
  }
}

// MARK: - Actions

enum HubActions {
  static func open(_ enhancement: Enhancement, view: String) {
    guard let urlString = enhancement.ui?.url, let url = URL(string: urlString) else {
      launchTool(enhancement)
      return
    }
    if view == "browser" {
      NSWorkspace.shared.open(url)
    } else if view == "window" {
      WebWindow.shared.show(title: enhancement.label, url: url)
    } else {
      launchTool(enhancement)
    }
  }

  static func launchTool(_ enhancement: Enhancement) {
    guard let toolCommand = enhancement.toolCommand, let first = toolCommand.first else { return }
    let supportDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
    let enhDir = Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements/\(enhancement.id)").path

    let binary: String
    if first.hasPrefix("/") {
      binary = first
    } else {
      let joined = (enhDir as NSString).appendingPathComponent(first)
      if FileManager.default.isExecutableFile(atPath: joined) {
        binary = joined
      } else {
        let pathDirs = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/local/bin"
        guard let found = pathDirs.split(separator: ":").map({ String($0) }).first(where: {
          FileManager.default.isExecutableFile(atPath: ($0 as NSString).appendingPathComponent(first))
        }) else { return }
        binary = (found as NSString).appendingPathComponent(first)
      }
    }

    let task = Process()
    task.executableURL = URL(fileURLWithPath: binary)
    task.arguments = Array(toolCommand.dropFirst())
    task.currentDirectoryURL = URL(fileURLWithPath: enhDir, isDirectory: true)
    var environment = ProcessInfo.processInfo.environment
    environment["CODEX_HOME"] = supportDir.appendingPathComponent("CodexHome").path
    environment["CODEX_ELECTRON_USER_DATA_PATH"] = supportDir.appendingPathComponent("Profile").path
    task.environment = environment
    try? task.run()
  }
}

// MARK: - Windows

final class WebWindow: NSObject, NSWindowDelegate {
  static let shared = WebWindow()
  private var windows: [String: NSWindow] = [:]

  func show(title: String, url: URL) {
    if let existing = windows[title] {
      existing.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered, defer: false)
    window.title = title
    window.isReleasedWhenClosed = false
    window.center()
    let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    window.contentView = webView
    webView.load(URLRequest(url: url))
    windows[title] = window
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func windowWillClose(_ notification: Notification) {
    guard let window = notification.object as? NSWindow else { return }
    if let key = windows.first(where: { $0.value == window })?.key {
      windows.removeValue(forKey: key)
    }
  }
}

final class HubWindow: NSObject, NSWindowDelegate {
  static let shared = HubWindow()
  private var window: NSWindow?

  var currentWindow: NSWindow? { window }

  func show(enhancements: [Enhancement]) {
    if let window {
      window.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }
    let hosting = NSHostingController(rootView: HubView(enhancements: enhancements))
    let window = NSWindow(contentViewController: hosting)
    window.title = "Enhancements"
    window.styleMask = [.titled, .closable, .miniaturizable]
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.isReleasedWhenClosed = false
    window.setContentSize(NSSize(width: 640, height: 540))
    window.minSize = NSSize(width: 560, height: 460)
    window.center()
    window.isMovableByWindowBackground = true
    self.window = window
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    NSApp.activate(ignoringOtherApps: true)
    let marker = "/tmp/hub-marker.txt"
    if let text = try? String(contentsOfFile: marker, encoding: .utf8) {
      let frame = window.frame
      let screen = window.screen?.frame ?? .zero
      let info = "ordered-front+regardless frame=\(frame) visible=\(window.isVisible) screen=\(screen) alpha=\(window.alphaValue)\n"
      try? (text + info).write(toFile: marker, atomically: true, encoding: .utf8)
    }
  }

  func windowWillClose(_ notification: Notification) {}
}

// MARK: - Views

struct HubView: View {
  let enhancements: [Enhancement]
  @StateObject private var state = HubState()

  private var services: [Enhancement] { enhancements.filter(\.isService) }
  private var tools: [Enhancement] { enhancements.filter { !$0.isService } }

  var body: some View {
    ZStack {
      CodexTheme.background.ignoresSafeArea()
      VStack(spacing: 0) {
        header
        List {
          if !services.isEmpty {
            Section {
              ForEach(services) { EnhancementRow(enhancement: $0, state: state) }
            } header: {
              Text("SERVICES")
            }
          }
          if !tools.isEmpty {
            Section {
              ForEach(tools) { EnhancementRow(enhancement: $0, state: state) }
            } header: {
              Text("TOOLS")
            }
          }
        }
        .listStyle(.inset)
        .scrollContentBackground(.hidden)
        .environment(\.colorScheme, colorScheme)
        footer
      }
    }
    .frame(minWidth: 560, minHeight: 460)
    .preferredColorScheme(nil)
  }

  @Environment(\.colorScheme) private var colorScheme

  private var header: some View {
    HStack(spacing: 14) {
      // The Codex spark — red/orange/green brand mark
      ZStack {
        RoundedRectangle(cornerRadius: 11, style: .continuous)
          .fill(CodexTheme.sparkGradient)
          .frame(width: 46, height: 46)
          .shadow(color: Color.black.opacity(0.12), radius: 3, y: 1)
        Image(systemName: "sparkles")
          .font(.system(size: 22, weight: .semibold))
          .foregroundStyle(.white)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text("Enhancements")
          .font(.title2.bold())
          .foregroundStyle(CodexTheme.textPrimary)
        Text("Bundled with Oh My OpenAI · Codex side-by-side")
          .font(.system(size: 11.5))
          .foregroundStyle(CodexTheme.textSecondary)
      }
      Spacer()
    }
    .padding(.horizontal, 20)
    .padding(.top, 18)
    .padding(.bottom, 10)
  }

  private var footer: some View {
    VStack(spacing: 0) {
      Rectangle()
        .fill(CodexTheme.border)
        .frame(height: 0.5)
      HStack {
        Text("Settings apply immediately · tools run with the app's isolated CodexHome")
          .font(.system(size: 10.5))
          .foregroundStyle(CodexTheme.textSecondary)
        Spacer()
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 8)
    }
  }
}

struct EnhancementRow: View {
  let enhancement: Enhancement
  @ObservedObject var state: HubState
  @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 28
  @State private var isHovered = false
  @Environment(\.colorScheme) private var colorScheme

  private var isOn: Binding<Bool> {
    Binding(
      get: { state.isEnabled(enhancement.id) },
      set: { state.setEnabled(enhancement.id, $0) })
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        iconTile
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 8) {
            Text(enhancement.label)
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(CodexTheme.textPrimary)
            typeBadge
          }
          Text(enhancement.detail)
            .font(.system(size: 11))
            .foregroundStyle(CodexTheme.textSecondary)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        Spacer(minLength: 8)
        Toggle("", isOn: isOn)
          .toggleStyle(.switch)
          .labelsHidden()
          .controlSize(.small)
          .padding(.trailing, 2)
      }
      if state.isEnabled(enhancement.id) {
        controlsRow
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(isHovered ? CodexTheme.cardHover : CodexTheme.card)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(CodexTheme.border, lineWidth: 1)
    )
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
    .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
    .animation(.easeInOut(duration: 0.18), value: state.isEnabled(enhancement.id))
    .onHover { hovering in
      withAnimation(.easeInOut(duration: 0.12)) { isHovered = hovering }
    }
  }

  private var iconTile: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(LinearGradient(colors: [enhancement.tint.opacity(0.88), enhancement.tint],
                             startPoint: .top, endPoint: .bottom))
        .frame(width: iconSize, height: iconSize)
        .shadow(color: Color.black.opacity(0.10), radius: 2, y: 1)
      Image(systemName: enhancement.symbolName)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(.white)
    }
  }

  private var typeBadge: some View {
    Text(enhancement.isService ? "SERVICE" : "TOOL")
      .font(.system(size: 8.5, weight: .bold))
      .kerning(0.4)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(Capsule().fill(CodexTheme.sidebar))
      .foregroundStyle(CodexTheme.textSecondary)
  }

  private var controlsRow: some View {
    HStack(spacing: 10) {
      if enhancement.viewOptions.count > 1 {
        Picker("View", selection: viewSelection) {
          ForEach(enhancement.viewOptions, id: \.self) { view in
            Text(enhancement.viewLabels[enhancement.viewOptions.firstIndex(of: view) ?? 0])
              .tag(view)
          }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .controlSize(.small)
        .frame(minWidth: 180, maxWidth: 220)
      } else {
        Text(enhancement.viewLabels.first ?? "")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(CodexTheme.textSecondary)
      }
      Spacer()
      Button {
        HubActions.open(enhancement, view: state.view(for: enhancement.id, options: enhancement.viewOptions))
      } label: {
        Label(enhancement.openLabel, systemImage: "arrow.up.right")
          .font(.system(size: 11.5, weight: .medium))
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
      .tint(CodexTheme.blue)
    }
    .padding(.leading, 16 + 12 + iconSize) // aligned with row text
    .padding(.trailing, 2)
  }

  private var viewSelection: Binding<String> {
    Binding(
      get: { state.view(for: enhancement.id, options: enhancement.viewOptions) },
      set: { state.setView(enhancement.id, $0) })
  }
}

// MARK: - Manifest loading

func loadEnhancements() -> [Enhancement] {
  let manifestURL = Bundle.main.bundleURL
    .appendingPathComponent("Contents/Resources/enhancements/manifest.json")
  guard let data = try? Data(contentsOf: manifestURL),
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let items = json["enhancements"] as? [[String: Any]] else {
    return []
  }
  let decoder = JSONDecoder()
  return items.compactMap { dict -> Enhancement? in
    guard let encoded = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
    return try? decoder.decode(Enhancement.self, from: encoded)
  }
}

// MARK: - ObjC entry points

@_cdecl("ShowEnhancementHub")
public func ShowEnhancementHub() {
  try? "called\n".write(toFile: "/tmp/hub-marker.txt", atomically: true, encoding: .utf8)
  DispatchQueue.main.async {
    let marker = "/tmp/hub-marker.txt"
    if let text = try? String(contentsOfFile: marker, encoding: .utf8) {
      try? (text + "async-ran\n").write(toFile: marker, atomically: true, encoding: .utf8)
    }
    HubWindow.shared.show(enhancements: loadEnhancements())
  }
}

@_cdecl("ShowWebWindow")
public func ShowWebWindow(label: UnsafePointer<CChar>?, url: UnsafePointer<CChar>?) {
  guard let labelPtr = label, let urlPtr = url else { return }
  let title = String(cString: labelPtr)
  guard let urlString = String(cString: urlPtr) as String?,
        let url = URL(string: urlString) else { return }
  DispatchQueue.main.async {
    WebWindow.shared.show(title: title, url: url)
  }
}

// Render the hub window's own view hierarchy to a PNG (no Screen Recording
// permission needed — a process can capture its own views).
@_cdecl("CaptureHubWindow")
public func CaptureHubWindow() {
  DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
    guard let window = HubWindow.shared.currentWindow,
          let view = window.contentView,
          let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
      try? "no-window".write(toFile: "/tmp/hub-capture.log", atomically: true, encoding: .utf8)
      return
    }
    view.cacheDisplay(in: view.bounds, to: rep)
    if let png = rep.representation(using: .png, properties: [:]) {
      try? png.write(to: URL(fileURLWithPath: "/tmp/hub-window-real.png"))
      try? "saved \(png.count) bytes".write(toFile: "/tmp/hub-capture.log", atomically: true, encoding: .utf8)
    }
  }
}
