// EnhancementHub.swift — Professional macOS Command Center for Codex Enhancements.
// Compiled into the launcher (mixed ObjC+Swift) and exposed to ObjC via
// @_cdecl entry points. Shares the process, bundle, and UserDefaults domain
// with the launcher.

import AppKit
import Foundation
import SwiftUI
import WebKit

// MARK: - Design System & Theme

enum CodexTheme {
  static let brandSpark = LinearGradient(
    colors: [
      Color(red: 1.00, green: 0.38, blue: 0.35), // #FF6159
      Color(red: 1.00, green: 0.58, blue: 0.20), // #FF9433
      Color(red: 0.22, green: 0.82, blue: 0.48)  // #38D17A
    ],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
  )

  static let accentBlue = Color(red: 0.04, green: 0.52, blue: 1.00) // #0A84FF
  static let successGreen = Color(red: 0.20, green: 0.78, blue: 0.45) // #34C759
  static let warningOrange = Color(red: 1.00, green: 0.62, blue: 0.15) // #FF9F0A
  static let mutedGray = Color(red: 0.55, green: 0.55, blue: 0.58)

  static func dynamic(light: NSColor, dark: NSColor) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
      appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
    })
  }

  // Surfaces & Backgrounds
  static let windowBackground = dynamic(
    light: NSColor(red: 0.965, green: 0.965, blue: 0.970, alpha: 1.0),
    dark: NSColor(red: 0.110, green: 0.110, blue: 0.118, alpha: 1.0)
  )

  static let cardBackground = dynamic(
    light: NSColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.95),
    dark: NSColor(red: 0.165, green: 0.165, blue: 0.176, alpha: 0.95)
  )

  static let cardHoverBackground = dynamic(
    light: NSColor(red: 0.985, green: 0.985, blue: 0.990, alpha: 1.0),
    dark: NSColor(red: 0.195, green: 0.195, blue: 0.208, alpha: 1.0)
  )

  static let innerDeckBackground = dynamic(
    light: NSColor(red: 0.945, green: 0.945, blue: 0.952, alpha: 0.8),
    dark: NSColor(red: 0.130, green: 0.130, blue: 0.140, alpha: 0.8)
  )

  // Borders & Dividers
  static let cardBorder = dynamic(
    light: NSColor(white: 0.0, alpha: 0.08),
    dark: NSColor(white: 1.0, alpha: 0.10)
  )

  static let cardBorderActive = dynamic(
    light: NSColor(red: 0.04, green: 0.52, blue: 1.00, alpha: 0.35),
    dark: NSColor(red: 0.04, green: 0.52, blue: 1.00, alpha: 0.45)
  )

  static let divider = dynamic(
    light: NSColor(white: 0.0, alpha: 0.06),
    dark: NSColor(white: 1.0, alpha: 0.08)
  )

  // Typography Colors
  static let textPrimary = dynamic(
    light: NSColor(white: 0.10, alpha: 1.0),
    dark: NSColor(white: 0.96, alpha: 1.0)
  )

  static let textSecondary = dynamic(
    light: NSColor(white: 0.45, alpha: 1.0),
    dark: NSColor(white: 0.62, alpha: 1.0)
  )

  static let textTertiary = dynamic(
    light: NSColor(white: 0.65, alpha: 1.0),
    dark: NSColor(white: 0.42, alpha: 1.0)
  )
}

// MARK: - Models

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
  var openLabel: String { ui?.openLabel ?? (kind == "web" ? "Open Dashboard" : "Launch Tool") }

  var iconSymbol: String {
    switch id {
    case "opencodex": return "network"
    case "ccusage": return "chart.xyaxis.line"
    case "codex-chatgpt-web": return "bubble.left.and.exclamationmark.bubble.right.fill"
    case "codexpp": return "slider.horizontal.3"
    default: return "sparkles"
    }
  }

  var accentColor: Color {
    switch id {
    case "opencodex": return Color(red: 0.18, green: 0.58, blue: 0.98)
    case "ccusage": return Color(red: 1.00, green: 0.55, blue: 0.22)
    case "codex-chatgpt-web": return Color(red: 0.65, green: 0.45, blue: 0.98)
    case "codexpp": return Color(red: 0.98, green: 0.42, blue: 0.68)
    default: return CodexTheme.accentBlue
    }
  }

  var viewOptions: [String] {
    switch kind {
    case "web": return ["window", "browser"]
    default: return ["launch"]
    }
  }

  var viewLabels: [String] {
    viewOptions.map { view in
      switch view {
      case "window": return "In-App Window"
      case "browser": return "Default Browser"
      default: return "CLI Launcher"
      }
    }
  }

  var summaryText: String {
    description ?? "Bundled enhancement module."
  }
}

// MARK: - State Management

private let kEnabledKey = "OMOEEnhancementsEnabled"
private let kViewKey = "OMOEEnhancementsView"

final class HubState: ObservableObject {
  @Published var enabled: [String: Bool] = HubState.loadEnabled()
  @Published var views: [String: String] = HubState.loadViews()
  @Published var searchQuery: String = ""
  @Published var selectedFilter: FilterTab = .all
  @Published var showingSystemInfo: Bool = false

  enum FilterTab: String, CaseIterable, Identifiable {
    case all = "All"
    case services = "Services"
    case tools = "Tools"
    var id: String { rawValue }
  }

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

// MARK: - Action Dispatcher

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

  static func revealProfileFolder() {
    let supportDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
    NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: supportDir.path)
  }
}

// MARK: - Web Window Controller

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
      contentRect: NSRect(x: 0, y: 0, width: 1120, height: 740),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.title = title
    window.titlebarAppearsTransparent = true
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

// MARK: - Hub Window Controller

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
    let hosting = NSHostingController(rootView: HubMainView(enhancements: enhancements))
    let window = NSWindow(contentViewController: hosting)
    window.title = "Codex Enhancements"
    window.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.isReleasedWhenClosed = false
    window.setContentSize(NSSize(width: 760, height: 620))
    window.minSize = NSSize(width: 660, height: 500)
    window.center()
    window.isMovableByWindowBackground = true
    self.window = window
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    NSApp.activate(ignoringOtherApps: true)
  }

  func windowWillClose(_ notification: Notification) {
    window = nil
  }
}

// MARK: - Main Command Center View

struct HubMainView: View {
  let enhancements: [Enhancement]
  @StateObject private var state = HubState()

  private var filteredEnhancements: [Enhancement] {
    enhancements.filter { item in
      let matchesFilter: Bool
      switch state.selectedFilter {
      case .all: matchesFilter = true
      case .services: matchesFilter = item.isService
      case .tools: matchesFilter = !item.isService
      }
      guard matchesFilter else { return false }
      if state.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return true
      }
      let q = state.searchQuery.lowercased()
      return item.label.lowercased().contains(q) ||
             item.summaryText.lowercased().contains(q) ||
             (item.config?.port != nil && "\(item.config!.port!)".contains(q))
    }
  }

  private var activeCount: Int {
    enhancements.filter { state.isEnabled($0.id) }.count
  }

  var body: some View {
    ZStack {
      CodexTheme.windowBackground.ignoresSafeArea()

      VStack(spacing: 0) {
        topNavigationHeader
        filterBar

        ScrollView(.vertical, showsIndicators: true) {
          VStack(spacing: 16) {
            if filteredEnhancements.isEmpty {
              emptyStateView
            } else {
              ForEach(filteredEnhancements) { item in
                EnhancementCard(enhancement: item, state: state)
              }
            }
          }
          .padding(.horizontal, 24)
          .padding(.vertical, 16)
        }

        bottomStatusBar
      }
    }
    .frame(minWidth: 660, minHeight: 500)
  }

  // MARK: - Header Components

  private var topNavigationHeader: some View {
    HStack(alignment: .center, spacing: 14) {
      // Brand Mark
      ZStack {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(CodexTheme.brandSpark)
          .frame(width: 42, height: 42)
          .shadow(color: Color.black.opacity(0.14), radius: 4, y: 2)
        Image(systemName: "sparkles")
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(.white)
      }

      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 8) {
          Text("Codex Enhancements")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(CodexTheme.textPrimary)
          
          HStack(spacing: 4) {
            Circle()
              .fill(CodexTheme.successGreen)
              .frame(width: 6, height: 6)
            Text("\(activeCount) of \(enhancements.count) Active")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(CodexTheme.textSecondary)
          }
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(
            Capsule()
              .fill(CodexTheme.innerDeckBackground)
              .overlay(Capsule().stroke(CodexTheme.cardBorder, lineWidth: 0.5))
          )
        }

        Text("Command center for local gateways, analyzers, and runtime bridges")
          .font(.system(size: 12))
          .foregroundStyle(CodexTheme.textSecondary)
      }

      Spacer()

      Button {
        HubActions.revealProfileFolder()
      } label: {
        Label("Profile Folder", systemImage: "folder.fill")
          .font(.system(size: 11.5, weight: .medium))
      }
      .buttonStyle(.bordered)
      .controlSize(.small)
    }
    .padding(.horizontal, 24)
    .padding(.top, 24)
    .padding(.bottom, 12)
  }

  private var filterBar: some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        // Search Input
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(CodexTheme.textTertiary)
          TextField("Search enhancements, ports, or tools...", text: $state.searchQuery)
            .textFieldStyle(.plain)
            .font(.system(size: 12))
          if !state.searchQuery.isEmpty {
            Button {
              state.searchQuery = ""
            } label: {
              Image(systemName: "xmark.circle.fill")
                .font(.system(size: 11))
                .foregroundStyle(CodexTheme.textTertiary)
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(CodexTheme.innerDeckBackground)
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(CodexTheme.cardBorder, lineWidth: 0.5))
        )

        // Category Filter
        Picker("Category", selection: $state.selectedFilter) {
          ForEach(HubState.FilterTab.allCases) { tab in
            Text(tab.rawValue).tag(tab)
          }
        }
        .pickerStyle(.segmented)
        .controlSize(.small)
        .frame(width: 210)
      }
      .padding(.horizontal, 24)
      .padding(.bottom, 12)

      Divider()
        .background(CodexTheme.divider)
    }
  }

  private var emptyStateView: some View {
    VStack(spacing: 10) {
      Image(systemName: "tray")
        .font(.system(size: 32))
        .foregroundStyle(CodexTheme.textTertiary)
        .padding(.top, 40)
      Text("No Enhancements Found")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(CodexTheme.textPrimary)
      Text("Try searching for a different keyword or switch categories.")
        .font(.system(size: 12))
        .foregroundStyle(CodexTheme.textSecondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 40)
  }

  private var bottomStatusBar: some View {
    VStack(spacing: 0) {
      Divider()
        .background(CodexTheme.divider)

      HStack(spacing: 12) {
        HStack(spacing: 6) {
          Image(systemName: "shield.lefthalf.filled")
            .font(.system(size: 11))
            .foregroundStyle(CodexTheme.accentBlue)
          Text("Side-by-side isolated sandbox")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(CodexTheme.textSecondary)
        }

        Spacer()

        Text("Changes persist to UserDefaults · Ready")
          .font(.system(size: 11))
          .foregroundStyle(CodexTheme.textTertiary)
      }
      .padding(.horizontal, 24)
      .padding(.vertical, 10)
    }
  }
}

// MARK: - Enhancement Card Component

struct EnhancementCard: View {
  let enhancement: Enhancement
  @ObservedObject var state: HubState
  @State private var isHovered = false

  private var isEnabled: Binding<Bool> {
    Binding(
      get: { state.isEnabled(enhancement.id) },
      set: { state.setEnabled(enhancement.id, $0) }
    )
  }

  private var activeView: Binding<String> {
    Binding(
      get: { state.view(for: enhancement.id, options: enhancement.viewOptions) },
      set: { state.setView(enhancement.id, $0) }
    )
  }

  var body: some View {
    VStack(spacing: 0) {
      // Main Card Header & Summary
      HStack(alignment: .top, spacing: 14) {
        // Icon Box
        ZStack {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(
              LinearGradient(
                colors: [enhancement.accentColor.opacity(0.9), enhancement.accentColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .frame(width: 38, height: 38)
            .shadow(color: enhancement.accentColor.opacity(0.25), radius: 3, y: 1.5)

          Image(systemName: enhancement.iconSymbol)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white)
        }

        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 8) {
            Text(enhancement.label)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(CodexTheme.textPrimary)

            // Category Badge
            Text(enhancement.isService ? "SERVICE" : "TOOL")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(enhancement.isService ? CodexTheme.accentBlue : CodexTheme.warningOrange)
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(
                Capsule()
                  .fill((enhancement.isService ? CodexTheme.accentBlue : CodexTheme.warningOrange).opacity(0.12))
              )

            // Port or Version Badge
            if let port = enhancement.config?.port {
              HStack(spacing: 3) {
                Circle()
                  .fill(state.isEnabled(enhancement.id) ? CodexTheme.successGreen : CodexTheme.mutedGray)
                  .frame(width: 5, height: 5)
                Text(":\(port)")
                  .font(.system(size: 10, weight: .medium, design: .monospaced))
              }
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(
                Capsule()
                  .fill(CodexTheme.innerDeckBackground)
                  .overlay(Capsule().stroke(CodexTheme.cardBorder, lineWidth: 0.5))
              )
              .foregroundStyle(CodexTheme.textSecondary)
            } else if let version = enhancement.resolvedVersion {
              Text("v\(version)")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(
                  Capsule()
                    .fill(CodexTheme.innerDeckBackground)
                )
                .foregroundStyle(CodexTheme.textTertiary)
            }
          }

          Text(enhancement.summaryText)
            .font(.system(size: 12))
            .foregroundStyle(CodexTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .lineSpacing(2)
        }

        Spacer(minLength: 12)

        // Master Switch
        Toggle("", isOn: isEnabled)
          .toggleStyle(.switch)
          .labelsHidden()
          .controlSize(.mini)
          .scaleEffect(0.9)
      }
      .padding(16)

      // Interactive Action Deck (when enabled)
      if state.isEnabled(enhancement.id) {
        VStack(spacing: 0) {
          Divider()
            .background(CodexTheme.divider)

          HStack(spacing: 12) {
            if enhancement.viewOptions.count > 1 {
              Picker("Presentation", selection: activeView) {
                ForEach(enhancement.viewOptions, id: \.self) { opt in
                  Text(enhancement.viewLabels[enhancement.viewOptions.firstIndex(of: opt) ?? 0])
                    .tag(opt)
                }
              }
              .pickerStyle(.segmented)
              .controlSize(.small)
              .frame(minWidth: 200, maxWidth: 240)
            } else {
              HStack(spacing: 4) {
                Image(systemName: "terminal.fill")
                  .font(.system(size: 10))
                  .foregroundStyle(CodexTheme.textTertiary)
                Text("Direct Background Tool")
                  .font(.system(size: 11, weight: .medium))
                  .foregroundStyle(CodexTheme.textTertiary)
              }
            }

            Spacer()

            Button {
              HubActions.open(enhancement, view: state.view(for: enhancement.id, options: enhancement.viewOptions))
            } label: {
              HStack(spacing: 5) {
                Text(enhancement.openLabel)
                  .font(.system(size: 11.5, weight: .semibold))
                Image(systemName: "arrow.up.right")
                  .font(.system(size: 10, weight: .bold))
              }
              .padding(.horizontal, 4)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .tint(enhancement.accentColor)
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
          .background(CodexTheme.innerDeckBackground)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(isHovered ? CodexTheme.cardHoverBackground : CodexTheme.cardBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(
          state.isEnabled(enhancement.id) ? CodexTheme.cardBorderActive : CodexTheme.cardBorder,
          lineWidth: 1
        )
    )
    .shadow(color: Color.black.opacity(isHovered ? 0.08 : 0.03), radius: isHovered ? 6 : 2, y: isHovered ? 3 : 1)
    .onHover { hovering in
      withAnimation(.easeInOut(duration: 0.15)) {
        isHovered = hovering
      }
    }
    .animation(.spring(response: 0.25, dampingFraction: 0.8), value: state.isEnabled(enhancement.id))
  }
}

// MARK: - Manifest Loader

func loadEnhancements() -> [Enhancement] {
  let manifestPaths = [
    Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/enhancements/manifest.json"),
    Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Codex.payload/Contents/Resources/enhancements/manifest.json"),
    URL(fileURLWithPath: "/Users/admin/oh-my-openai/enhancements/manifest.json")
  ]

  for manifestURL in manifestPaths {
    if let data = try? Data(contentsOf: manifestURL),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let items = json["enhancements"] as? [[String: Any]] {
      let decoder = JSONDecoder()
      let loaded = items.compactMap { dict -> Enhancement? in
        guard let encoded = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
        return try? decoder.decode(Enhancement.self, from: encoded)
      }
      if !loaded.isEmpty { return loaded }
    }
  }
  return []
}

// MARK: - Objective-C Interop Entry Points

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

@_cdecl("CaptureHubWindow")
public func CaptureHubWindow() {
  DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
    guard let window = HubWindow.shared.currentWindow,
          let view = window.contentView,
          let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
    view.cacheDisplay(in: view.bounds, to: rep)
    if let png = rep.representation(using: .png, properties: [:]) {
      try? png.write(to: URL(fileURLWithPath: "/tmp/hub-window-real.png"))
    }
  }
}
