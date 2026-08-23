// EnhancementHub.swift — High-Contrast macOS Command Center for Codex Enhancements.
// Native SwiftUI interface with high-contrast palette, live enhancement health,
// native dashboard launchers, and zero visual clutter.

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
  let healthPath: String?
  let readinessPath: String?
  let toolCommand: [String]?
  let startCommand: [String]?
  let connectCommand: [String]?
  let appPath: String?
  let ui: UI?

  struct Config: Decodable {
    let port: Int?
  }

  struct UI: Decodable {
    let label: String?
    let kind: String?
    let openLabel: String?
    let connectLabel: String?
    let url: String?
  }

  var label: String { ui?.label ?? id }
  var isService: Bool { type == "service" }
  var kind: String { ui?.kind ?? "tool" }

  var iconSymbol: String {
    if isService { return "network" }
    switch kind {
    case "app": return "chart.xyaxis.line"
    case "terminal": return "bubble.left.and.exclamationmark.bubble.right.fill"
    default: return "sparkles"
    }
  }

  var accentColor: Color {
    if isService { return CodexTheme.accentBlue }
    switch kind {
    case "app": return CodexTheme.warningAmber
    case "terminal": return CodexTheme.purple
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

enum EnhancementHealth: Equatable {
  case checking
  case installed
  case running
  case disabled
  case unavailable(String)

  var label: String {
    switch self {
    case .checking: return "Checking…"
    case .installed: return "Installed"
    case .running: return "Running"
    case .disabled: return "Disabled"
    case .unavailable(let reason): return reason
    }
  }

  var color: Color {
    switch self {
    case .checking: return CodexTheme.warningAmber
    case .installed: return CodexTheme.accentBlue
    case .running: return CodexTheme.successGreen
    case .disabled: return CodexTheme.textTertiary
    case .unavailable: return CodexTheme.warningAmber
    }
  }

  var icon: String {
    switch self {
    case .checking: return "clock"
    case .installed: return "shippingbox"
    case .running: return "checkmark.circle.fill"
    case .disabled: return "pause.circle"
    case .unavailable: return "exclamationmark.triangle.fill"
    }
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

// MARK: - State Management

private let kEnabledKey = "OMOEEnhancementsEnabled"
private let kViewKey = "OMOEEnhancementsView"

final class HubState: ObservableObject {
  @Published var enabled: [String: Bool] = HubState.loadEnabled()
  @Published var views: [String: String] = HubState.loadViews()
  @Published var selectedSection: NavigationSection = .extensions
  @Published var health: [String: EnhancementHealth] = [:]

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

  func health(for enhancement: Enhancement) -> EnhancementHealth {
    if !isEnabled(enhancement.id) { return .disabled }
    return health[enhancement.id] ?? .checking
  }

  func canOpen(_ enhancement: Enhancement) -> Bool {
    if enhancement.isService && isEnabled(enhancement.id) { return true }
    switch health(for: enhancement) {
    case .installed, .running: return true
    default: return false
    }
  }

  func refreshHealth(_ enhancements: [Enhancement]) {
    health = Dictionary(uniqueKeysWithValues: enhancements.map { ($0.id, EnhancementHealth.checking) })
    for enhancement in enhancements {
      if let appPath = enhancement.appPath {
        let appURL = Bundle.main.bundleURL
          .appendingPathComponent("Contents/Resources/enhancements")
          .appendingPathComponent(enhancement.id, isDirectory: true)
          .appendingPathComponent(appPath, isDirectory: true)
        let infoPath = appURL.appendingPathComponent("Contents/Info.plist")
        health[enhancement.id] = FileManager.default.fileExists(atPath: infoPath.path)
          ? .installed
          : .unavailable("App bundle missing")
        continue
      }
      let command = enhancement.isService ? enhancement.startCommand : enhancement.toolCommand
      guard let first = command?.first, !first.isEmpty else {
        health[enhancement.id] = .unavailable("No command")
        continue
      }

      let candidate: URL
      if first.hasPrefix("/") {
        candidate = URL(fileURLWithPath: first)
      } else {
        candidate = Bundle.main.bundleURL
          .appendingPathComponent("Contents/Resources/enhancements")
          .appendingPathComponent(enhancement.id, isDirectory: true)
          .appendingPathComponent(first)
      }
      guard FileManager.default.isExecutableFile(atPath: candidate.path) else {
        health[enhancement.id] = .unavailable("Missing executable")
        continue
      }

      if enhancement.isService,
         let urlString = enhancement.ui?.url,
         var components = URLComponents(string: urlString) {
        components.path = enhancement.readinessPath ?? enhancement.healthPath ?? "/"
        guard let url = components.url else {
          health[enhancement.id] = .unavailable("Invalid health URL")
          continue
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2.0
        URLSession.shared.dataTask(with: request) { data, response, error in
          let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
          var result: EnhancementHealth = .unavailable(error?.localizedDescription ?? "Service not responding")
          if (200..<300).contains(statusCode), let data,
             let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let ready = payload["ready"] as? Bool {
              if ready {
                result = .running
              } else if let account = payload["account"] as? [String: Any],
                        account["status"] as? String != "ok" {
                result = .unavailable("Codex account required")
              } else if let browser = payload["browser"] as? [String: Any],
                        browser["authenticated"] as? Bool != true {
                result = .unavailable("ChatGPT sign-in required")
              } else {
                result = .unavailable("Route not ready")
              }
            } else if payload["status"] as? String == "ok",
                      payload["service"] as? String != nil {
              result = .running
            } else {
              result = .unavailable("Service health check failed")
            }
          }
          DispatchQueue.main.async {
            self.health[enhancement.id] = result
          }
        }.resume()
      } else {
        health[enhancement.id] = .installed
      }
    }
  }

}

// MARK: - Action Dispatcher

enum HubActions {
  private static let supportDirectory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")

  private static func resolvedApp(_ enhancement: Enhancement) -> URL? {
    guard let appPath = enhancement.appPath else { return nil }
    return Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements")
      .appendingPathComponent(enhancement.id, isDirectory: true)
      .appendingPathComponent(appPath, isDirectory: true)
  }

  private static func resolvedTool(_ enhancement: Enhancement) -> (binary: URL, arguments: [String], directory: URL)? {
    guard let command = enhancement.toolCommand, let first = command.first else { return nil }
    let directory = Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements")
      .appendingPathComponent(enhancement.id, isDirectory: true)
    let binary: URL
    if first.hasPrefix("/") {
      binary = URL(fileURLWithPath: first)
    } else if first.contains("/") {
      binary = directory.appendingPathComponent(first)
    } else {
      let pathEntries = (ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin")
        .split(separator: ":")
        .map(String.init)
      guard let match = pathEntries
        .map({ URL(fileURLWithPath: $0).appendingPathComponent(first) })
        .first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) else { return nil }
      binary = match
    }

    guard FileManager.default.isExecutableFile(atPath: binary.path) else { return nil }
    return (binary, Array(command.dropFirst()), directory)
  }

  private static func shellQuote(_ value: String) -> String {
    "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
  }

  private static func appleScriptString(_ value: String) -> String {
    value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
  }

  private static func showLaunchError(_ title: String, _ detail: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = detail
    alert.alertStyle = .warning
    alert.addButton(withTitle: "OK")
    alert.runModal()
  }

  static func open(_ enhancement: Enhancement, view: String) {
    if enhancement.kind == "app" {
      guard let appURL = resolvedApp(enhancement),
            FileManager.default.fileExists(atPath: appURL.appendingPathComponent("Contents/Info.plist").path) else {
        showLaunchError("\(enhancement.label) is unavailable", "The bundled app could not be found or is incomplete.")
        return
      }
      let configuration = NSWorkspace.OpenConfiguration()
      configuration.activates = true
      configuration.environment = [
        "CODEX_HOME": supportDirectory.appendingPathComponent("CodexHome").path,
        "CODEX_ELECTRON_USER_DATA_PATH": supportDirectory.appendingPathComponent("Profile").path,
      ]
      NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { _, error in
        if let error {
          DispatchQueue.main.async {
            showLaunchError("Could not open \(enhancement.label)", error.localizedDescription)
          }
        }
      }
      return
    }

    if enhancement.kind == "web" {
      guard let urlString = enhancement.ui?.url,
            let url = URL(string: urlString) else {
        showLaunchError("\(enhancement.label) is not configured", "The bundled enhancement manifest does not contain a valid dashboard URL.")
        return
      }
      if view == "browser" {
        NSWorkspace.shared.open(url)
      } else {
        WebWindow.shared.show(title: enhancement.label, url: url)
      }
      return
    }

    if enhancement.kind == "terminal" {
      openTerminalForTool(enhancement)
      return
    }

    // Default launcher
    launchTool(enhancement)
  }

  static func connect(_ enhancement: Enhancement) {
    guard let urlString = enhancement.ui?.url,
          let dashboardURL = URL(string: urlString),
          let connectURL = URL(string: "/api/connect", relativeTo: dashboardURL)?.absoluteURL else {
      showLaunchError("\(enhancement.label) is not configured", "The dashboard connection URL is invalid.")
      return
    }
    var request = URLRequest(url: connectURL)
    request.httpMethod = "POST"
    request.timeoutInterval = 5.0
    URLSession.shared.dataTask(with: request) { _, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      if error != nil || !(200..<300).contains(status) {
        DispatchQueue.main.async {
          showLaunchError("Could not start \(enhancement.label) connection",
                          error?.localizedDescription ?? "The dashboard returned HTTP \(status).")
        }
      }
    }.resume()
    WebWindow.shared.show(title: enhancement.label, url: dashboardURL)
  }

  static func openTerminalForTool(_ enhancement: Enhancement, extraArguments: [String] = []) {
    guard let command = resolvedTool(enhancement) else {
      showLaunchError("\(enhancement.label) is unavailable", "The bundled executable could not be found or is not executable.")
      return
    }

    let arguments = command.arguments + extraArguments
    let terminalCommand = ([
      "cd \(shellQuote(command.directory.path))",
      "export CODEX_HOME=\(shellQuote(supportDirectory.appendingPathComponent("CodexHome").path))",
      "export CODEX_ELECTRON_USER_DATA_PATH=\(shellQuote(supportDirectory.appendingPathComponent("Profile").path))",
      shellQuote(command.binary.path),
    ] + arguments.map(shellQuote)).joined(separator: " && ")
    let script = """
    tell application "Terminal"
      activate
      do script "\(appleScriptString(terminalCommand))"
    end tell
    """
    if let appleScript = NSAppleScript(source: script) {
      var error: NSDictionary?
      _ = appleScript.executeAndReturnError(&error)
      if let error {
        showLaunchError("Could not open \(enhancement.label)", error[NSAppleScript.errorMessage] as? String ?? "Terminal rejected the launch request.")
      }
    }
  }

  static func launchTool(_ enhancement: Enhancement) {
    guard let command = resolvedTool(enhancement) else {
      showLaunchError("\(enhancement.label) is unavailable", "The bundled executable could not be found or is not executable.")
      return
    }

    let task = Process()
    task.executableURL = command.binary
    task.arguments = command.arguments
    task.currentDirectoryURL = command.directory
    var env = ProcessInfo.processInfo.environment
    env["CODEX_HOME"] = supportDirectory.appendingPathComponent("CodexHome").path
    env["CODEX_ELECTRON_USER_DATA_PATH"] = supportDirectory.appendingPathComponent("Profile").path
    task.environment = env
    do {
      try task.run()
    } catch {
      showLaunchError("Could not launch \(enhancement.label)", error.localizedDescription)
    }
  }

  static func revealPath(_ path: String) {
    NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: path)
  }
}

// MARK: - Web Window Controller

final class WebWindow: NSObject, NSWindowDelegate, WKNavigationDelegate {
  static let shared = WebWindow()
  private var windows: [String: NSWindow] = [:]

  func show(title: String, url: URL) {
    if let existing = windows[title] {
      if let webView = existing.contentView as? WKWebView {
        webView.load(URLRequest(url: url))
      }
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
    webView.navigationDelegate = self
    window.contentView = webView
    webView.load(URLRequest(url: url))
    windows[title] = window
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }

    let host = url.host?.lowercased()
    let isLocalHost = host == "127.0.0.1" || host == "localhost"
    let isWebURL = url.scheme?.lowercased() == "http" || url.scheme?.lowercased() == "https"

    if isWebURL && !isLocalHost {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
      return
    }

    decisionHandler(.allow)
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
  let initialSection: NavigationSection
  @StateObject private var state = HubState()

  init(enhancements: [Enhancement], initialSection: NavigationSection = .extensions) {
    self.enhancements = enhancements
    self.initialSection = initialSection
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
      state.selectedSection = initialSection
      state.refreshHealth(enhancements)
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
          .fill(CodexTheme.accentBlue)
          .frame(width: 6, height: 6)
        Text("\(enhancements.count) Extensions Configured")
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

        Button {
          state.refreshHealth(enhancements)
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
            .font(.system(size: 11, weight: .semibold))
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
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
            AnalyticsDashboardView(enhancements: enhancements, state: state)
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
    let health = state.health(for: enhancement)
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

          HStack(spacing: 5) {
            Image(systemName: health.icon)
              .font(.system(size: 10, weight: .semibold))
            Text(health.label)
              .font(.system(size: 10.5, weight: .semibold))
          }
          .foregroundStyle(health.color)
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

          if enhancement.connectCommand?.isEmpty == false {
            Button(enhancement.ui?.connectLabel ?? "Connect") {
              HubActions.connect(enhancement)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
          }

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
          .disabled(!state.canOpen(enhancement))
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
  let dashboard: Enhancement?
  @ObservedObject var state: HubState

  init(enhancements: [Enhancement], state: HubState) {
    dashboard = enhancements.first { $0.kind == "app" }
    self.state = state
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let dashboard {
        HStack(alignment: .top, spacing: 14) {
          ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .fill(dashboard.accentColor)
              .frame(width: 48, height: 48)
            Image(systemName: dashboard.iconSymbol)
              .font(.system(size: 22, weight: .semibold))
              .foregroundStyle(.white)
          }

          VStack(alignment: .leading, spacing: 6) {
            Text("NerfTrack Usage Dashboard")
              .font(.system(size: 15, weight: .bold))
              .foregroundStyle(CodexTheme.textPrimary)
            Text("Open a full native dashboard for Codex usage history, quota, diagnostics, and API-equivalent value estimates.")
              .font(.system(size: 12))
              .foregroundStyle(CodexTheme.textSecondary)
              .lineSpacing(2)
          }

          Spacer()

          Button {
            HubActions.open(dashboard, view: "launch")
          } label: {
            Label(dashboard.ui?.openLabel ?? "Open Dashboard", systemImage: "arrow.up.right")
              .font(.system(size: 11.5, weight: .semibold))
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          .tint(dashboard.accentColor)
          .disabled(!state.canOpen(dashboard))
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(CodexTheme.cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(CodexTheme.border, lineWidth: 1))
      } else {
        Text("No native usage dashboard is configured.")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(CodexTheme.textSecondary)
          .frame(maxWidth: .infinity, alignment: .center)
          .padding(.vertical, 40)
      }
    }
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

      PathRow(
        title: "Enhancement Logs",
        path: supportDir.appendingPathComponent("enhancements").path
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
    Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Codex.payload/Contents/Resources/enhancements/manifest.json")
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
