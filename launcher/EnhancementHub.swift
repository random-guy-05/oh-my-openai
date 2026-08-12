// EnhancementHub.swift — SwiftUI command center for bundled enhancements.
// Compiled into the launcher (mixed ObjC+Swift) and exposed to ObjC via
// @_cdecl entry points. Shares the process, bundle, and UserDefaults domain
// with the launcher.
//
// Design: System-Settings-grade macOS panel — ultra-thin material, flat
// restrained icon tiles, disciplined row rhythm, trailing-aligned controls,
// subtle badges, intentional motion.

import AppKit
import Foundation
import SwiftUI
import WebKit

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
    case "opencodex": return .teal
    case "ccusage": return .orange
    case "codex-chatgpt-web": return .indigo
    case "codexpp": return .pink
    default: return .blue
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
    NSApp.activate(ignoringOtherApps: true)
  }

  func windowWillClose(_ notification: Notification) {}
}

// MARK: - Views

private let kRowInset = EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16)

struct HubView: View {
  let enhancements: [Enhancement]
  @StateObject private var state = HubState()

  private var services: [Enhancement] { enhancements.filter(\.isService) }
  private var tools: [Enhancement] { enhancements.filter { !$0.isService } }

  var body: some View {
    ZStack {
      Color.clear
        .background(.ultraThinMaterial)
        .ignoresSafeArea()
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
        footer
      }
    }
    .frame(minWidth: 560, minHeight: 460)
  }

  private var header: some View {
    HStack(spacing: 14) {
      ZStack {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(LinearGradient(colors: [Color.teal.opacity(0.86), Color.teal],
                               startPoint: .top, endPoint: .bottom))
          .frame(width: 44, height: 44)
          .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
        Image(systemName: "sparkles")
          .font(.system(size: 21, weight: .semibold))
          .foregroundStyle(.white)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text("Enhancements")
          .font(.title2.bold())
        Text("Bundled with Oh My OpenAI · Codex side-by-side")
          .font(.system(size: 11.5))
          .foregroundStyle(.secondary)
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
        .fill(.quaternary)
        .frame(height: 0.5)
      HStack {
        Text("Settings apply immediately · tools run with the app's isolated CodexHome")
          .font(.system(size: 10.5))
          .foregroundStyle(.secondary)
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
            typeBadge
          }
          Text(enhancement.detail)
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
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
    .padding(.vertical, 2)
    .listRowInsets(kRowInset)
    .listRowBackground(Color(nsColor: .controlBackgroundColor))
    .background(isHovered ? Color.accentColor.opacity(0.06) : Color.clear)
    .animation(.easeInOut(duration: 0.18), value: state.isEnabled(enhancement.id))
    .onHover { hovering in
      withAnimation(.easeInOut(duration: 0.12)) { isHovered = hovering }
    }
  }

  private var iconTile: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(LinearGradient(colors: [enhancement.tint.opacity(0.86), enhancement.tint],
                             startPoint: .top, endPoint: .bottom))
        .frame(width: iconSize, height: iconSize)
        .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
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
      .background(Capsule().fill(Color.secondary.opacity(0.12)))
      .foregroundStyle(.secondary)
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
          .foregroundStyle(.secondary)
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
      .tint(enhancement.tint)
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
  DispatchQueue.main.async {
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
