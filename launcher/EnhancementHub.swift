// EnhancementHub.swift — High-Contrast macOS Command Center for Codex Enhancements.
// Native SwiftUI interface with high-contrast palette, live ccusage analytics parser,
// direct terminal launchers, and zero visual clutter.

import AppKit
import Foundation
import SwiftUI
import WebKit

// MARK: - High-Contrast Design System

enum CodexTheme {
  static let accentBlue = Color(red: 0.15, green: 0.50, blue: 1.00)
  static let successGreen = Color(red: 0.13, green: 0.77, blue: 0.37)
  static let warningAmber = Color(red: 0.96, green: 0.62, blue: 0.04)
  static let purple = Color(red: 0.66, green: 0.33, blue: 0.97)

  static func dynamic(light: NSColor, dark: NSColor) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
      appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
    })
  }

  // Window & Surfaces
  static let windowBackground = dynamic(
    light: NSColor(red: 0.96, green: 0.96, blue: 0.98, alpha: 1.0),
    dark: NSColor(red: 0.09, green: 0.09, blue: 0.11, alpha: 1.0)
  )

  static let sidebarBackground = dynamic(
    light: NSColor(red: 0.92, green: 0.92, blue: 0.94, alpha: 0.95),
    dark: NSColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 0.95)
  )

  static let cardBackground = dynamic(
    light: NSColor(white: 1.0, alpha: 1.0),
    dark: NSColor(red: 0.15, green: 0.15, blue: 0.17, alpha: 1.0)
  )

  static let cardHoverBackground = dynamic(
    light: NSColor(white: 0.98, alpha: 1.0),
    dark: NSColor(red: 0.18, green: 0.18, blue: 0.21, alpha: 1.0)
  )

  static let rowBackground = dynamic(
    light: NSColor(red: 0.94, green: 0.94, blue: 0.96, alpha: 1.0),
    dark: NSColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1.0)
  )

  // Borders & Dividers
  static let border = dynamic(
    light: NSColor(white: 0.0, alpha: 0.12),
    dark: NSColor(white: 1.0, alpha: 0.14)
  )

  static let activeBorder = dynamic(
    light: NSColor(red: 0.15, green: 0.50, blue: 1.00, alpha: 0.5),
    dark: NSColor(red: 0.25, green: 0.60, blue: 1.00, alpha: 0.6)
  )

  static let divider = dynamic(
    light: NSColor(white: 0.0, alpha: 0.08),
    dark: NSColor(white: 1.0, alpha: 0.10)
  )

  // High-Contrast Typography
  static let textPrimary = dynamic(
    light: NSColor(white: 0.04, alpha: 1.0),
    dark: NSColor(white: 0.98, alpha: 1.0)
  )

  static let textSecondary = dynamic(
    light: NSColor(white: 0.32, alpha: 1.0),
    dark: NSColor(white: 0.72, alpha: 1.0)
  )

  static let textTertiary = dynamic(
    light: NSColor(white: 0.48, alpha: 1.0),
    dark: NSColor(white: 0.52, alpha: 1.0)
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

  var iconSymbol: String {
    switch id {
    case "opencodex": return "network"
    case "ccusage": return "chart.bar.xaxis"
    case "codex-chatgpt-web": return "bubble.left.and.exclamationmark.bubble.right.fill"
    default: return "sparkles"
    }
  }

  var accentColor: Color {
    switch id {
    case "opencodex": return CodexTheme.accentBlue
    case "ccusage": return CodexTheme.warningAmber
    case "codex-chatgpt-web": return CodexTheme.purple
    default: return CodexTheme.accentBlue
    }
  }

  var viewOptions: [String] {
    switch kind {
    case "web": return ["window", "browser"]
    default: return ["action"]
    }
  }

  var viewLabels: [String] {
    viewOptions.map { view in
      switch view {
      case "window": return "In-App Window"
      case "browser": return "Default Browser"
      default: return "Direct"
      }
    }
  }

  var summaryText: String {
    description ?? "Bundled enhancement module."
  }
}

// MARK: - Navigation

enum NavigationSection: String, CaseIterable, Identifiable {
  case extensions = "Extensions"
  case analytics = "Usage Analytics"
  case environment = "Sandbox & Paths"

  var id: String { rawValue }

  var iconSymbol: String {
    switch self {
    case .extensions: return "square.grid.2x2.fill"
    case .analytics: return "chart.xyaxis.line"
    case .environment: return "folder.badge.gearshape"
    }
  }
}

// MARK: - Usage Analytics JSON Models

struct UsageData: Decodable {
  let daily: [DailyUsage]?
  let totals: UsageTotals?

  struct DailyUsage: Decodable, Identifiable {
    var id: String { period ?? UUID().uuidString }
    let period: String?
    let totalCost: Double?
    let totalTokens: Int?
    let inputTokens: Int?
    let outputTokens: Int?
    let modelsUsed: [String]?
  }

  struct UsageTotals: Decodable {
    let totalCost: Double?
    let totalTokens: Int?
    let inputTokens: Int?
    let outputTokens: Int?
    let cacheReadTokens: Int?
  }
}

// MARK: - State Management

private let kEnabledKey = "OMOEEnhancementsEnabled"
private let kViewKey = "OMOEEnhancementsView"

final class HubState: ObservableObject {
  @Published var enabled: [String: Bool] = HubState.loadEnabled()
  @Published var views: [String: String] = HubState.loadViews()
  @Published var selectedSection: NavigationSection = .extensions
  @Published var usageData: UsageData?
  @Published var isLoadingUsage = false

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
    return options.first ?? "window"
  }

  func setView(_ id: String, _ view: String) {
    views[id] = view
    UserDefaults.standard.set(views, forKey: kViewKey)
  }

  func loadAnalytics() {
    isLoadingUsage = true
    DispatchQueue.global(qos: .userInitiated).async {
      let data = HubActions.fetchUsageReport()
      DispatchQueue.main.async {
        self.usageData = data
        self.isLoadingUsage = false
      }
    }
  }
}

// MARK: - Action Dispatcher

enum HubActions {
  static func open(_ enhancement: Enhancement, view: String) {
    if enhancement.id == "opencodex" {
      let url = URL(string: enhancement.ui?.url ?? "http://127.0.0.1:10100")!
      if view == "browser" {
        NSWorkspace.shared.open(url)
      } else {
        WebWindow.shared.show(title: "OpenCodex Gateway", url: url)
      }
      return
    }

    if enhancement.id == "ccusage" {
      openTerminalForCcusage()
      return
    }

    if enhancement.id == "codex-chatgpt-web" {
      openTerminalForChatGPTWeb()
      return
    }

    // Default launcher
    launchTool(enhancement)
  }

  static func openTerminalForCcusage() {
    let supportDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
    let ccusageBin = Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements/ccusage/node_modules/@ccusage/ccusage-darwin-x64/bin/ccusage").path

    let script = """
    tell application "Terminal"
      activate
      do script "export CODEX_HOME='\(supportDir.appendingPathComponent("CodexHome").path)' && export CODEX_ELECTRON_USER_DATA_PATH='\(supportDir.appendingPathComponent("Profile").path)' && '\(ccusageBin)' daily"
    end tell
    """
    if let appleScript = NSAppleScript(source: script) {
      var error: NSDictionary?
      appleScript.executeAndReturnError(&error)
    }
  }

  static func openTerminalForChatGPTWeb() {
    let supportDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
    let bridgeDir = Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements/codex-chatgpt-web").path
    let bunBin = (bridgeDir as NSString).appendingPathComponent("node_modules/bun/bin/bun.exe")

    let script = """
    tell application "Terminal"
      activate
      do script "cd '\(bridgeDir)' && export CODEX_HOME='\(supportDir.appendingPathComponent("CodexHome").path)' && export CODEX_ELECTRON_USER_DATA_PATH='\(supportDir.appendingPathComponent("Profile").path)' && '\(bunBin)' run --cwd source src/cli.ts doctor"
    end tell
    """
    if let appleScript = NSAppleScript(source: script) {
      var error: NSDictionary?
      appleScript.executeAndReturnError(&error)
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
      binary = FileManager.default.isExecutableFile(atPath: joined) ? joined : first
    }

    let task = Process()
    task.executableURL = URL(fileURLWithPath: binary)
    task.arguments = Array(toolCommand.dropFirst())
    task.currentDirectoryURL = URL(fileURLWithPath: enhDir, isDirectory: true)
    var env = ProcessInfo.processInfo.environment
    env["CODEX_HOME"] = supportDir.appendingPathComponent("CodexHome").path
    env["CODEX_ELECTRON_USER_DATA_PATH"] = supportDir.appendingPathComponent("Profile").path
    task.environment = env
    try? task.run()
  }

  static func fetchUsageReport() -> UsageData? {
    let supportDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
    let ccusageBin = Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements/ccusage/node_modules/@ccusage/ccusage-darwin-x64/bin/ccusage").path

    let task = Process()
    task.executableURL = URL(fileURLWithPath: ccusageBin)
    task.arguments = ["daily", "-j"]
    var env = ProcessInfo.processInfo.environment
    env["CODEX_HOME"] = supportDir.appendingPathComponent("CodexHome").path
    env["CODEX_ELECTRON_USER_DATA_PATH"] = supportDir.appendingPathComponent("Profile").path
    task.environment = env

    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = Pipe()

    do {
      try task.run()
      task.waitUntilExit()
      let data = pipe.fileHandleForReading.readDataToEndOfFile()
      return try? JSONDecoder().decode(UsageData.self, from: data)
    } catch {
      return nil
    }
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
      contentRect: NSRect(x: 0, y: 0, width: 1100, height: 750),
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

  func show(enhancements: [Enhancement], initialSection: NavigationSection = .extensions) {
    NSApp.setActivationPolicy(.regular)

    if let window {
      window.makeKeyAndOrderFront(nil)
      window.orderFrontRegardless()
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    let hosting = NSHostingController(rootView: HubRootView(enhancements: enhancements, initialSection: initialSection))
    let window = NSWindow(contentViewController: hosting)
    window.title = "Codex Enhancements"
    window.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.isReleasedWhenClosed = false
    window.setContentSize(NSSize(width: 820, height: 560))
    window.minSize = NSSize(width: 740, height: 480)
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

// MARK: - Root View

struct HubRootView: View {
  let enhancements: [Enhancement]
  @StateObject private var state = HubState()

  init(enhancements: [Enhancement], initialSection: NavigationSection = .extensions) {
    self.enhancements = enhancements
  }

  var body: some View {
    HStack(spacing: 0) {
      // High-contrast clean sidebar
      SidebarView(enhancements: enhancements, state: state)
        .frame(width: 210)
        .background(CodexTheme.sidebarBackground)

      Rectangle()
        .fill(CodexTheme.divider)
        .frame(width: 1)
        .ignoresSafeArea()

      // High-contrast clean detail view
      DetailContentView(enhancements: enhancements, state: state)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CodexTheme.windowBackground)
    }
    .frame(minWidth: 740, minHeight: 480)
    .onAppear {
      state.loadAnalytics()
    }
  }
}

// MARK: - Sidebar

struct SidebarView: View {
  let enhancements: [Enhancement]
  @ObservedObject var state: HubState

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Header
      HStack(spacing: 10) {
        ZStack {
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(CodexTheme.accentBlue)
            .frame(width: 28, height: 28)
          Image(systemName: "sparkles")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(.white)
        }

        VStack(alignment: .leading, spacing: 1) {
          Text("Codex Suite")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(CodexTheme.textPrimary)
          Text("Side-by-Side Edition")
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(CodexTheme.textTertiary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 24)
      .padding(.bottom, 20)

      // Nav items
      VStack(spacing: 4) {
        ForEach(NavigationSection.allCases) { section in
          Button {
            state.selectedSection = section
          } label: {
            HStack(spacing: 10) {
              Image(systemName: section.iconSymbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(state.selectedSection == section ? .white : CodexTheme.textSecondary)
                .frame(width: 18)

              Text(section.rawValue)
                .font(.system(size: 12.5, weight: state.selectedSection == section ? .semibold : .medium))
                .foregroundStyle(state.selectedSection == section ? .white : CodexTheme.textPrimary)

              Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
              RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(state.selectedSection == section ? CodexTheme.accentBlue : Color.clear)
            )
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 10)

      Spacer()

      // Footer
      HStack(spacing: 6) {
        Circle()
          .fill(CodexTheme.successGreen)
          .frame(width: 6, height: 6)
        Text("\(enhancements.count) Extensions Active")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(CodexTheme.textSecondary)
      }
      .padding(14)
    }
  }
}

// MARK: - Detail Content View

struct DetailContentView: View {
  let enhancements: [Enhancement]
  @ObservedObject var state: HubState

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Header
      HStack {
        Text(state.selectedSection.rawValue)
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(CodexTheme.textPrimary)
        Spacer()
      }
      .padding(.horizontal, 24)
      .padding(.top, 24)
      .padding(.bottom, 16)

      Divider()
        .background(CodexTheme.divider)

      // Content
      ScrollView(.vertical, showsIndicators: true) {
        VStack(alignment: .leading, spacing: 14) {
          switch state.selectedSection {
          case .extensions:
            ForEach(enhancements) { item in
              ExtensionCard(enhancement: item, state: state)
            }
          case .analytics:
            AnalyticsDashboardView(state: state)
          case .environment:
            EnvironmentView()
          }
        }
        .padding(24)
      }
    }
  }
}

// MARK: - Extension Card

struct ExtensionCard: View {
  let enhancement: Enhancement
  @ObservedObject var state: HubState

  private var viewBinding: Binding<String> {
    Binding(
      get: { state.view(for: enhancement.id, options: enhancement.viewOptions) },
      set: { state.setView(enhancement.id, $0) }
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        // Icon
        ZStack {
          RoundedRectangle(cornerRadius: 9, style: .continuous)
            .fill(enhancement.accentColor)
            .frame(width: 36, height: 36)
          Image(systemName: enhancement.iconSymbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
        }

        // Info
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 8) {
            Text(enhancement.label)
              .font(.system(size: 14, weight: .bold))
              .foregroundStyle(CodexTheme.textPrimary)

            if let port = enhancement.config?.port {
              Text(":\(port)")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(CodexTheme.accentBlue)
                .padding(.horizontal, 5)
                .padding(.vertical, 1.5)
                .background(Capsule().fill(CodexTheme.accentBlue.opacity(0.12)))
            }
          }

          Text(enhancement.summaryText)
            .font(.system(size: 11.5))
            .foregroundStyle(CodexTheme.textSecondary)
            .lineSpacing(1.5)
        }

        Spacer()

        // Toggle
        Toggle("", isOn: Binding(
          get: { state.isEnabled(enhancement.id) },
          set: { state.setEnabled(enhancement.id, $0) }
        ))
        .toggleStyle(.switch)
        .labelsHidden()
        .controlSize(.small)
      }

      // Actions Strip
      if state.isEnabled(enhancement.id) {
        HStack {
          if enhancement.viewOptions.count > 1 {
            Picker("", selection: viewBinding) {
              ForEach(enhancement.viewOptions, id: \.self) { opt in
                Text(enhancement.viewLabels[enhancement.viewOptions.firstIndex(of: opt) ?? 0])
                  .tag(opt)
              }
            }
            .pickerStyle(.segmented)
            .controlSize(.small)
            .frame(width: 220)
          }

          Spacer()

          Button {
            HubActions.open(enhancement, view: state.view(for: enhancement.id, options: enhancement.viewOptions))
          } label: {
            HStack(spacing: 4) {
              Text(enhancement.ui?.openLabel ?? "Launch")
                .font(.system(size: 11.5, weight: .semibold))
              Image(systemName: "arrow.up.right")
                .font(.system(size: 10, weight: .bold))
            }
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          .tint(enhancement.accentColor)
        }
        .padding(.top, 4)
      }
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

// MARK: - Usage Analytics Dashboard

struct AnalyticsDashboardView: View {
  @ObservedObject var state: HubState

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if state.isLoadingUsage {
        HStack(spacing: 8) {
          ProgressView()
            .controlSize(.small)
          Text("Querying Codex Usage Engine...")
            .font(.system(size: 12))
            .foregroundStyle(CodexTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.vertical, 40)
      } else if let totals = state.usageData?.totals {
        // Metric Cards
        HStack(spacing: 12) {
          MetricCard(
            title: "Total Cost",
            value: String(format: "$%.2f", totals.totalCost ?? 0.0),
            color: CodexTheme.successGreen
          )
          MetricCard(
            title: "Total Tokens",
            value: formatNumber(totals.totalTokens ?? 0),
            color: CodexTheme.accentBlue
          )
          MetricCard(
            title: "Cache Hits",
            value: formatNumber(totals.cacheReadTokens ?? 0),
            color: CodexTheme.warningAmber
          )
        }

        // Action
        HStack {
          Text("Recent Activity")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(CodexTheme.textPrimary)

          Spacer()

          Button {
            HubActions.openTerminalForCcusage()
          } label: {
            Label("Open in Terminal", systemImage: "terminal")
              .font(.system(size: 11, weight: .semibold))
          }
          .buttonStyle(.bordered)
          .controlSize(.small)

          Button {
            state.loadAnalytics()
          } label: {
            Image(systemName: "arrow.clockwise")
              .font(.system(size: 11, weight: .semibold))
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
        }
        .padding(.top, 8)

        // Daily Table
        if let daily = state.usageData?.daily, !daily.isEmpty {
          VStack(spacing: 6) {
            ForEach(daily.prefix(7)) { day in
              HStack {
                Text(day.period ?? "—")
                  .font(.system(size: 12, weight: .semibold, design: .monospaced))
                  .foregroundStyle(CodexTheme.textPrimary)
                  .frame(width: 95, alignment: .leading)

                if let models = day.modelsUsed {
                  Text(models.joined(separator: ", "))
                    .font(.system(size: 11))
                    .foregroundStyle(CodexTheme.textSecondary)
                    .lineLimit(1)
                }

                Spacer()

                Text(formatNumber(day.totalTokens ?? 0))
                  .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                  .foregroundStyle(CodexTheme.textSecondary)
                  .frame(width: 75, alignment: .trailing)

                Text(String(format: "$%.2f", day.totalCost ?? 0.0))
                  .font(.system(size: 12, weight: .bold, design: .monospaced))
                  .foregroundStyle(CodexTheme.textPrimary)
                  .frame(width: 65, alignment: .trailing)
              }
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                  .fill(CodexTheme.rowBackground)
              )
            }
          }
        }
      } else {
        VStack(spacing: 8) {
          Text("No Token Usage Logged Yet")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(CodexTheme.textPrimary)
          Text("Run Codex sessions to automatically populate usage and cost metrics.")
            .font(.system(size: 11.5))
            .foregroundStyle(CodexTheme.textSecondary)
          Button("Open Terminal CLI") {
            HubActions.openTerminalForCcusage()
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
      }
    }
  }

  private func formatNumber(_ num: Int) -> String {
    if num >= 1_000_000_000 {
      return String(format: "%.2fB", Double(num) / 1_000_000_000.0)
    } else if num >= 1_000_000 {
      return String(format: "%.1fM", Double(num) / 1_000_000.0)
    } else if num >= 1_000 {
      return String(format: "%.0fK", Double(num) / 1_000.0)
    }
    return "\(num)"
  }
}

struct MetricCard: View {
  let title: String
  let value: String
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(CodexTheme.textSecondary)
      Text(value)
        .font(.system(size: 18, weight: .bold, design: .rounded))
        .foregroundStyle(color)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(CodexTheme.cardBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .stroke(CodexTheme.border, lineWidth: 1)
    )
  }
}

// MARK: - Environment View

struct EnvironmentView: View {
  private let supportDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      PathRow(
        title: "Isolated Profile Directory",
        path: supportDir.appendingPathComponent("Profile").path
      )

      PathRow(
        title: "CodexHome Workspace Storage",
        path: supportDir.appendingPathComponent("CodexHome").path
      )

      PathRow(
        title: "Bundled Enhancements",
        path: Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/enhancements").path
      )
    }
  }
}

struct PathRow: View {
  let title: String
  let path: String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
          .font(.system(size: 12.5, weight: .bold))
          .foregroundStyle(CodexTheme.textPrimary)
        Spacer()
        Button {
          HubActions.revealPath(path)
        } label: {
          Text("Reveal in Finder")
            .font(.system(size: 11, weight: .semibold))
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
            .fill(CodexTheme.rowBackground)
        )
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(CodexTheme.cardBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
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

// MARK: - Objective-C Interop

@_cdecl("ShowEnhancementHub")
public func ShowEnhancementHub() {
  DispatchQueue.main.async {
    HubWindow.shared.show(enhancements: loadEnhancements(), initialSection: .extensions)
  }
}

@_cdecl("ShowEnhancementAnalytics")
public func ShowEnhancementAnalytics() {
  DispatchQueue.main.async {
    HubWindow.shared.show(enhancements: loadEnhancements(), initialSection: .analytics)
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
