// EnhancementHub.swift — Masterful macOS Command Center & Settings for Codex Enhancements.
// Native SwiftUI interface with macOS System Settings sidebar + detail pane architecture,
// vibrant NSVisualEffectView backdrop, live status monitoring, and granular controls.

import AppKit
import Foundation
import SwiftUI
import WebKit

// MARK: - Design Tokens & Aesthetics

enum CodexTheme {
  static let sparkGradient = LinearGradient(
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
  static let purpleAccent = Color(red: 0.68, green: 0.48, blue: 0.98) // #AD7BF9
  static let pinkAccent = Color(red: 1.00, green: 0.55, blue: 0.76)   // #FF8CC1

  static func dynamic(light: NSColor, dark: NSColor) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
      appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
    })
  }

  // Window & Pane Backgrounds
  static let sidebarBackground = dynamic(
    light: NSColor(red: 0.940, green: 0.940, blue: 0.945, alpha: 0.85),
    dark: NSColor(red: 0.135, green: 0.135, blue: 0.142, alpha: 0.85)
  )

  static let mainBackground = dynamic(
    light: NSColor(red: 0.965, green: 0.965, blue: 0.972, alpha: 1.0),
    dark: NSColor(red: 0.110, green: 0.110, blue: 0.118, alpha: 1.0)
  )

  static let cardBackground = dynamic(
    light: NSColor(white: 1.0, alpha: 0.96),
    dark: NSColor(red: 0.170, green: 0.170, blue: 0.180, alpha: 0.96)
  )

  static let cardHoverBackground = dynamic(
    light: NSColor(white: 0.98, alpha: 1.0),
    dark: NSColor(red: 0.205, green: 0.205, blue: 0.218, alpha: 1.0)
  )

  static let rowAltBackground = dynamic(
    light: NSColor(red: 0.950, green: 0.950, blue: 0.958, alpha: 0.6),
    dark: NSColor(red: 0.140, green: 0.140, blue: 0.150, alpha: 0.6)
  )

  // Borders & Dividers
  static let border = dynamic(
    light: NSColor(white: 0.0, alpha: 0.08),
    dark: NSColor(white: 1.0, alpha: 0.09)
  )

  static let activeBorder = dynamic(
    light: NSColor(red: 0.04, green: 0.52, blue: 1.00, alpha: 0.30),
    dark: NSColor(red: 0.04, green: 0.52, blue: 1.00, alpha: 0.40)
  )

  static let divider = dynamic(
    light: NSColor(white: 0.0, alpha: 0.06),
    dark: NSColor(white: 1.0, alpha: 0.07)
  )

  // Typography
  static let textPrimary = dynamic(
    light: NSColor(white: 0.08, alpha: 1.0),
    dark: NSColor(white: 0.96, alpha: 1.0)
  )

  static let textSecondary = dynamic(
    light: NSColor(white: 0.42, alpha: 1.0),
    dark: NSColor(white: 0.64, alpha: 1.0)
  )

  static let textTertiary = dynamic(
    light: NSColor(white: 0.62, alpha: 1.0),
    dark: NSColor(white: 0.45, alpha: 1.0)
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
  var openLabel: String { ui?.openLabel ?? (kind == "web" ? "Open Web Dashboard" : "Launch Tool") }

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
    case "opencodex": return CodexTheme.accentBlue
    case "ccusage": return CodexTheme.warningOrange
    case "codex-chatgpt-web": return CodexTheme.purpleAccent
    case "codexpp": return CodexTheme.pinkAccent
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
      default: return "CLI Tool"
      }
    }
  }

  var summaryText: String {
    description ?? "Bundled enhancement module."
  }
}

// MARK: - Navigation Tabs

enum NavigationSection: String, CaseIterable, Identifiable {
  case overview = "Overview"
  case services = "Services & Gateways"
  case analytics = "Usage & Analytics"
  case tools = "Power Tools"
  case system = "Sandbox & Environment"

  var id: String { rawValue }

  var iconSymbol: String {
    switch self {
    case .overview: return "square.grid.2x2.fill"
    case .services: return "server.rack"
    case .analytics: return "chart.bar.fill"
    case .tools: return "wrench.and.screwdriver.fill"
    case .system: return "gearshape.2.fill"
    }
  }
}

// MARK: - State Management

private let kEnabledKey = "OMOEEnhancementsEnabled"
private let kViewKey = "OMOEEnhancementsView"

final class HubState: ObservableObject {
  @Published var enabled: [String: Bool] = HubState.loadEnabled()
  @Published var views: [String: String] = HubState.loadViews()
  @Published var selectedSection: NavigationSection = .overview
  @Published var searchFilter: String = ""

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

  static func revealPath(_ path: String) {
    NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: path)
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
      contentRect: NSRect(x: 0, y: 0, width: 1120, height: 760),
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

// MARK: - Visual Effect View Representable

struct VisualEffectBlur: NSViewRepresentable {
  var material: NSVisualEffectView.Material = .sidebar
  var blendingMode: NSVisualEffectView.BlendingMode = .behindWindow

  func makeNSView(context: Context) -> NSVisualEffectView {
    let view = NSVisualEffectView()
    view.material = material
    view.blendingMode = blendingMode
    view.state = .active
    return view
  }

  func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
    nsView.material = material
    nsView.blendingMode = blendingMode
  }
}

// MARK: - Hub Window Controller

final class HubWindow: NSObject, NSWindowDelegate {
  static let shared = HubWindow()
  private var window: NSWindow?

  var currentWindow: NSWindow? { window }

  func show(enhancements: [Enhancement]) {
    // Elevate app activation policy so window is focusable and brought to front
    NSApp.setActivationPolicy(.regular)

    if let window {
      window.makeKeyAndOrderFront(nil)
      window.orderFrontRegardless()
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    let hosting = NSHostingController(rootView: HubRootView(enhancements: enhancements))
    let window = NSWindow(contentViewController: hosting)
    window.title = "Codex Enhancements"
    window.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.isReleasedWhenClosed = false
    window.setContentSize(NSSize(width: 860, height: 620))
    window.minSize = NSSize(width: 780, height: 540)
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

// MARK: - Root Split View Layout

struct HubRootView: View {
  let enhancements: [Enhancement]
  @StateObject private var state = HubState()

  var body: some View {
    ZStack {
      VisualEffectBlur(material: .sidebar, blendingMode: .behindWindow)
        .ignoresSafeArea()

      HStack(spacing: 0) {
        // Left Navigation Sidebar
        SidebarView(enhancements: enhancements, state: state)
          .frame(width: 230)

        Rectangle()
          .fill(CodexTheme.divider)
          .frame(width: 1)
          .ignoresSafeArea()

        // Right Detail Content Area
        DetailContentView(enhancements: enhancements, state: state)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(CodexTheme.mainBackground)
      }
    }
    .frame(minWidth: 780, minHeight: 540)
  }
}

// MARK: - Sidebar View

struct SidebarView: View {
  let enhancements: [Enhancement]
  @ObservedObject var state: HubState

  private var activeCount: Int {
    enhancements.filter { state.isEnabled($0.id) }.count
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Header Brand
      HStack(spacing: 12) {
        ZStack {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(CodexTheme.sparkGradient)
            .frame(width: 34, height: 34)
            .shadow(color: Color.black.opacity(0.18), radius: 3, y: 1.5)
          Image(systemName: "sparkles")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
        }

        VStack(alignment: .leading, spacing: 1) {
          Text("Codex Suite")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(CodexTheme.textPrimary)
          Text("v26.8 · Side-by-Side")
            .font(.system(size: 10.5, weight: .medium))
            .foregroundStyle(CodexTheme.textTertiary)
        }
      }
      .padding(.horizontal, 18)
      .padding(.top, 28)
      .padding(.bottom, 18)

      // Search Bar
      HStack(spacing: 6) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(CodexTheme.textTertiary)
        TextField("Filter...", text: $state.searchFilter)
          .textFieldStyle(.plain)
          .font(.system(size: 11.5))
        if !state.searchFilter.isEmpty {
          Button {
            state.searchFilter = ""
          } label: {
            Image(systemName: "xmark.circle.fill")
              .font(.system(size: 10))
              .foregroundStyle(CodexTheme.textTertiary)
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 6)
      .background(
        RoundedRectangle(cornerRadius: 7, style: .continuous)
          .fill(CodexTheme.cardBackground)
          .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(CodexTheme.border, lineWidth: 0.5))
      )
      .padding(.horizontal, 14)
      .padding(.bottom, 14)

      // Navigation Items
      ScrollView(.vertical, showsIndicators: false) {
        VStack(spacing: 3) {
          ForEach(NavigationSection.allCases) { section in
            SidebarNavItem(
              section: section,
              isSelected: state.selectedSection == section,
              badgeText: badgeForSection(section)
            ) {
              withAnimation(.easeInOut(duration: 0.12)) {
                state.selectedSection = section
              }
            }
          }
        }
        .padding(.horizontal, 10)
      }

      Spacer()

      // Footer Live Status
      HStack(spacing: 8) {
        Circle()
          .fill(CodexTheme.successGreen)
          .frame(width: 7, height: 7)
        Text("\(activeCount) of \(enhancements.count) Enabled")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(CodexTheme.textSecondary)
        Spacer()
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .background(CodexTheme.rowAltBackground)
    }
  }

  private func badgeForSection(_ section: NavigationSection) -> String? {
    switch section {
    case .overview: return "\(enhancements.count)"
    case .services: return "\(enhancements.filter(\.isService).count)"
    case .analytics: return "1"
    case .tools: return "\(enhancements.filter { !$0.isService && $0.id != "ccusage" }.count)"
    case .system: return "OK"
    }
  }
}

struct SidebarNavItem: View {
  let section: NavigationSection
  let isSelected: Bool
  let badgeText: String?
  let action: () -> Void

  @State private var isHovered = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: section.iconSymbol)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(isSelected ? .white : CodexTheme.textSecondary)
          .frame(width: 20)

        Text(section.rawValue)
          .font(.system(size: 12.5, weight: isSelected ? .semibold : .medium))
          .foregroundStyle(isSelected ? .white : CodexTheme.textPrimary)

        Spacer()

        if let badgeText {
          Text(badgeText)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(isSelected ? .white.opacity(0.9) : CodexTheme.textTertiary)
            .padding(.horizontal, 6)
            .padding(.vertical, 1.5)
            .background(
              Capsule().fill(isSelected ? Color.white.opacity(0.22) : CodexTheme.border)
            )
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(isSelected ? CodexTheme.accentBlue : (isHovered ? CodexTheme.cardHoverBackground : Color.clear))
      )
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      isHovered = hovering
    }
  }
}

// MARK: - Detail Content View

struct DetailContentView: View {
  let enhancements: [Enhancement]
  @ObservedObject var state: HubState

  private var filteredItems: [Enhancement] {
    let base: [Enhancement]
    switch state.selectedSection {
    case .overview:
      base = enhancements
    case .services:
      base = enhancements.filter(\.isService)
    case .analytics:
      base = enhancements.filter { $0.id == "ccusage" }
    case .tools:
      base = enhancements.filter { !$0.isService && $0.id != "ccusage" }
    case .system:
      base = []
    }

    if state.searchFilter.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return base
    }
    let q = state.searchFilter.lowercased()
    return base.filter { item in
      item.label.lowercased().contains(q) ||
      item.summaryText.lowercased().contains(q) ||
      (item.config?.port != nil && "\(item.config!.port!)".contains(q))
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      // Detail Top Bar
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(state.selectedSection.rawValue)
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(CodexTheme.textPrimary)
          Text(subtitleForSection(state.selectedSection))
            .font(.system(size: 11.5))
            .foregroundStyle(CodexTheme.textSecondary)
        }

        Spacer()

        if state.selectedSection == .system {
          Button {
            let supportDir = FileManager.default.homeDirectoryForCurrentUser
              .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
            HubActions.revealPath(supportDir.path)
          } label: {
            Label("Reveal Profile", systemImage: "folder.fill")
              .font(.system(size: 11.5, weight: .medium))
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
        }
      }
      .padding(.horizontal, 28)
      .padding(.top, 28)
      .padding(.bottom, 16)

      Divider()
        .background(CodexTheme.divider)

      // Main Scroll Area
      ScrollView(.vertical, showsIndicators: true) {
        VStack(alignment: .leading, spacing: 18) {
          if state.selectedSection == .system {
            SystemEnvironmentPane()
          } else if filteredItems.isEmpty {
            VStack(spacing: 12) {
              Image(systemName: "tray.fill")
                .font(.system(size: 32))
                .foregroundStyle(CodexTheme.textTertiary)
                .padding(.top, 40)
              Text("No Items Match Current Filter")
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(CodexTheme.textPrimary)
              Text("Clear the filter or switch tabs to view more extensions.")
                .font(.system(size: 11.5))
                .foregroundStyle(CodexTheme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
          } else {
            ForEach(filteredItems) { item in
              MasterEnhancementCard(enhancement: item, state: state)
            }
          }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 20)
      }
    }
  }

  private func subtitleForSection(_ section: NavigationSection) -> String {
    switch section {
    case .overview: return "Manage all local proxies, analytical engines, and workflow bridges."
    case .services: return "High-performance daemon proxies operating on isolated local ports."
    case .analytics: return "Token usage monitoring, daily rollouts, and session analytics."
    case .tools: return "Model prompt enhancers, specialized subagent tools, and utilities."
    case .system: return "Configuration files, isolated CodexHome storage, and runtime diagnostics."
    }
  }
}

// MARK: - Master Enhancement Card

struct MasterEnhancementCard: View {
  let enhancement: Enhancement
  @ObservedObject var state: HubState
  @State private var isHovered = false

  private var isEnabledBinding: Binding<Bool> {
    Binding(
      get: { state.isEnabled(enhancement.id) },
      set: { state.setEnabled(enhancement.id, $0) }
    )
  }

  private var viewSelectionBinding: Binding<String> {
    Binding(
      get: { state.view(for: enhancement.id, options: enhancement.viewOptions) },
      set: { state.setView(enhancement.id, $0) }
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Header Strip
      HStack(alignment: .top, spacing: 14) {
        // Icon Container
        ZStack {
          RoundedRectangle(cornerRadius: 11, style: .continuous)
            .fill(
              LinearGradient(
                colors: [enhancement.accentColor.opacity(0.92), enhancement.accentColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .frame(width: 40, height: 40)
            .shadow(color: enhancement.accentColor.opacity(0.28), radius: 3.5, y: 1.5)

          Image(systemName: enhancement.iconSymbol)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.white)
        }

        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 8) {
            Text(enhancement.label)
              .font(.system(size: 14.5, weight: .semibold))
              .foregroundStyle(CodexTheme.textPrimary)

            // Category Badge
            Text(enhancement.isService ? "SERVICE" : "TOOL")
              .font(.system(size: 8.5, weight: .bold))
              .foregroundStyle(enhancement.isService ? CodexTheme.accentBlue : CodexTheme.warningOrange)
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(
                Capsule()
                  .fill((enhancement.isService ? CodexTheme.accentBlue : CodexTheme.warningOrange).opacity(0.12))
              )

            // Port or Version Indicator
            if let port = enhancement.config?.port {
              HStack(spacing: 4) {
                Circle()
                  .fill(state.isEnabled(enhancement.id) ? CodexTheme.successGreen : CodexTheme.textTertiary)
                  .frame(width: 5.5, height: 5.5)
                Text("localhost:\(port)")
                  .font(.system(size: 10.5, weight: .medium, design: .monospaced))
              }
              .padding(.horizontal, 7)
              .padding(.vertical, 2)
              .background(
                Capsule()
                  .fill(CodexTheme.rowAltBackground)
                  .overlay(Capsule().stroke(CodexTheme.border, lineWidth: 0.5))
              )
              .foregroundStyle(CodexTheme.textSecondary)
            } else if let version = enhancement.resolvedVersion {
              Text("v\(version)")
                .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(CodexTheme.rowAltBackground))
                .foregroundStyle(CodexTheme.textTertiary)
            }
          }

          Text(enhancement.summaryText)
            .font(.system(size: 12))
            .foregroundStyle(CodexTheme.textSecondary)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 16)

        // Native Switch
        Toggle("", isOn: isEnabledBinding)
          .toggleStyle(.switch)
          .labelsHidden()
          .controlSize(.small)
      }
      .padding(16)

      // Interactive Action Deck
      if state.isEnabled(enhancement.id) {
        VStack(spacing: 0) {
          Divider()
            .background(CodexTheme.divider)

          HStack(spacing: 12) {
            if enhancement.viewOptions.count > 1 {
              Picker("Presentation", selection: viewSelectionBinding) {
                ForEach(enhancement.viewOptions, id: \.self) { opt in
                  Text(enhancement.viewLabels[enhancement.viewOptions.firstIndex(of: opt) ?? 0])
                    .tag(opt)
                }
              }
              .pickerStyle(.segmented)
              .controlSize(.small)
              .frame(minWidth: 210, maxWidth: 240)
            } else {
              HStack(spacing: 5) {
                Image(systemName: "terminal.fill")
                  .font(.system(size: 10))
                  .foregroundStyle(CodexTheme.textTertiary)
                Text("Command Line Process")
                  .font(.system(size: 11, weight: .medium))
                  .foregroundStyle(CodexTheme.textTertiary)
              }
            }

            Spacer()

            Button {
              HubActions.open(enhancement, view: state.view(for: enhancement.id, options: enhancement.viewOptions))
            } label: {
              HStack(spacing: 6) {
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
          .background(CodexTheme.rowAltBackground)
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
          state.isEnabled(enhancement.id) ? CodexTheme.activeBorder : CodexTheme.border,
          lineWidth: 1
        )
    )
    .shadow(color: Color.black.opacity(isHovered ? 0.07 : 0.025), radius: isHovered ? 5 : 2, y: isHovered ? 2.5 : 1)
    .onHover { hovering in
      withAnimation(.easeInOut(duration: 0.12)) {
        isHovered = hovering
      }
    }
    .animation(.spring(response: 0.22, dampingFraction: 0.8), value: state.isEnabled(enhancement.id))
  }
}

// MARK: - System & Environment Pane

struct SystemEnvironmentPane: View {
  private let supportDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      // Path 1: Profile
      EnvironmentRow(
        title: "Isolated Profile Directory",
        subtitle: "Private cookies, local storage, Electron caches, and GPU caches",
        path: supportDir.appendingPathComponent("Profile").path
      )

      // Path 2: CodexHome
      EnvironmentRow(
        title: "Codex Home & Rollout Storage",
        subtitle: "CLI authentication tokens, session index JSONL, and configuration",
        path: supportDir.appendingPathComponent("CodexHome").path
      )

      // Path 3: Extensions Directory
      EnvironmentRow(
        title: "Installed Enhancements Bundle",
        subtitle: "Compiled Node packages, Bun runtimes, and local web dashboards",
        path: Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/enhancements").path
      )

      // Diagnostic Card
      VStack(alignment: .leading, spacing: 10) {
        Text("Security & Sandboxing")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(CodexTheme.textPrimary)

        Text("All extensions execute with isolated environment variables under CODEX_HOME and CODEX_ELECTRON_USER_DATA_PATH. Upstream ChatGPT credentials and official app sessions remain isolated.")
          .font(.system(size: 11.5))
          .foregroundStyle(CodexTheme.textSecondary)
          .lineSpacing(2)
      }
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(CodexTheme.cardBackground)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(CodexTheme.border, lineWidth: 1)
      )
    }
  }
}

struct EnvironmentRow: View {
  let title: String
  let subtitle: String
  let path: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(CodexTheme.textPrimary)
          Text(subtitle)
            .font(.system(size: 11))
            .foregroundStyle(CodexTheme.textSecondary)
        }

        Spacer()

        Button {
          HubActions.revealPath(path)
        } label: {
          Label("Reveal", systemImage: "arrow.up.forward.app")
            .font(.system(size: 11, weight: .medium))
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
      }

      Text(path)
        .font(.system(size: 11, design: .monospaced))
        .foregroundStyle(CodexTheme.textTertiary)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(CodexTheme.rowAltBackground)
        )
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(CodexTheme.cardBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(CodexTheme.border, lineWidth: 1)
    )
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
