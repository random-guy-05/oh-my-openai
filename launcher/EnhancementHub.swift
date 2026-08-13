// EnhancementHub.swift — SwiftUI Command Center for Oh My OpenAI enhancements.
// Features a macOS-native NavigationSplitView layout, live service monitors,
// tool runners, usage reports, streaming logs, and in-app web views.

import AppKit
import Foundation
import SwiftUI
import WebKit

// MARK: - Codex Theme Tokens

public enum CodexTheme {
  public static let blue = Color(red: 0.01, green: 0.52, blue: 1.00)       // #0285FF
  public static let softBlue = Color(red: 0.20, green: 0.61, blue: 1.00)   // #339CFF
  public static let green = Color(red: 0.25, green: 0.79, blue: 0.47)      // #40C977
  public static let orange = Color(red: 1.00, green: 0.52, blue: 0.29)     // #FF8549
  public static let purple = Color(red: 0.68, green: 0.48, blue: 0.98)     // #AD7BF9
  public static let pink = Color(red: 1.00, green: 0.55, blue: 0.76)       // #FF8CC1
  public static let red = Color(red: 1.00, green: 0.40, blue: 0.39)        // #FF6764

  public static let sparkGradient = LinearGradient(
    colors: [red, orange, green],
    startPoint: .topLeading, endPoint: .bottomTrailing)

  public static func dynamic(light: NSColor, dark: NSColor) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
      appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
    })
  }

  public static let background = dynamic(
    light: NSColor(red: 0.965, green: 0.960, blue: 0.945, alpha: 1),
    dark: NSColor(red: 0.125, green: 0.125, blue: 0.125, alpha: 1))

  public static let sidebar = dynamic(
    light: NSColor(red: 0.935, green: 0.925, blue: 0.895, alpha: 1),
    dark: NSColor(red: 0.160, green: 0.160, blue: 0.160, alpha: 1))

  public static let card = dynamic(
    light: NSColor(red: 0.990, green: 0.985, blue: 0.970, alpha: 1),
    dark: NSColor(red: 0.185, green: 0.185, blue: 0.185, alpha: 1))

  public static let cardHover = dynamic(
    light: NSColor(red: 0.940, green: 0.930, blue: 0.900, alpha: 1),
    dark: NSColor(red: 0.220, green: 0.220, blue: 0.220, alpha: 1))

  public static let textPrimary = dynamic(
    light: NSColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1),
    dark: NSColor(white: 0.95, alpha: 1))

  public static let textSecondary = dynamic(
    light: NSColor(red: 0.45, green: 0.45, blue: 0.45, alpha: 1),
    dark: NSColor(white: 0.65, alpha: 1))

  public static let border = dynamic(
    light: NSColor(red: 0.88, green: 0.86, blue: 0.83, alpha: 1),
    dark: NSColor(white: 1.0, alpha: 0.10))
}

// MARK: - Navigation Items

enum HubSection: String, CaseIterable, Identifiable {
  case overview = "Overview"
  case services = "Services"
  case tools = "Tools"
  case usage = "Usage Analytics"
  case logs = "Live Logs"

  var id: String { rawValue }

  var icon: String {
    switch self {
    case .overview: return "square.grid.2x2"
    case .services: return "network"
    case .tools: return "wrench.and.screwdriver"
    case .usage: return "chart.bar.xaxis"
    case .logs: return "terminal"
    }
  }
}

// MARK: - Main Command Center View

public struct HubView: View {
  @ObservedObject private var manager = EnhancementManager.shared
  @State private var selectedSection: HubSection? = .overview

  public init() {}

  public var body: some View {
    NavigationSplitView {
      sidebar
    } detail: {
      detailView
    }
    .frame(minWidth: 780, idealWidth: 860, minHeight: 520, idealHeight: 580)
    .background(CodexTheme.background)
  }

  private var sidebar: some View {
    List(HubSection.allCases, selection: $selectedSection) { section in
      NavigationLink(value: section) {
        Label {
          Text(section.rawValue)
            .font(.system(size: 13, weight: .medium))
        } icon: {
          Image(systemName: section.icon)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(selectedSection == section ? CodexTheme.blue : CodexTheme.textSecondary)
        }
      }
    }
    .listStyle(.sidebar)
    .navigationTitle("Command Center")
    .safeAreaInset(edge: .bottom) {
      sidebarFooter
    }
  }

  private var sidebarFooter: some View {
    VStack(alignment: .leading, spacing: 6) {
      Divider().overlay(CodexTheme.border)
      HStack(spacing: 8) {
        Circle()
          .fill(CodexTheme.green)
          .frame(width: 8, height: 8)
        Text("Codex Rebuild Active")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(CodexTheme.textSecondary)
      }
      .padding(.horizontal, 14)
      .padding(.bottom, 8)
    }
  }

  @ViewBuilder
  private var detailView: some View {
    switch selectedSection ?? .overview {
    case .overview:
      OverviewView()
    case .services:
      ServicesView()
    case .tools:
      ToolsView()
    case .usage:
      UsageReportView()
    case .logs:
      LogsConsoleView()
    }
  }
}

// MARK: - Overview Section

struct OverviewView: View {
  @ObservedObject private var manager = EnhancementManager.shared

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        header
        quickStatsGrid
        enhancementsSection
      }
      .padding(24)
    }
  }

  private var header: some View {
    HStack(spacing: 16) {
      ZStack {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(CodexTheme.sparkGradient)
          .frame(width: 52, height: 52)
          .shadow(color: Color.black.opacity(0.12), radius: 4, y: 2)
        Image(systemName: "sparkles")
          .font(.system(size: 24, weight: .bold))
          .foregroundColor(.white)
      }
      VStack(alignment: .leading, spacing: 4) {
        Text("Oh My OpenAI")
          .font(.title2.bold())
          .foregroundStyle(CodexTheme.textPrimary)
        Text("Stock Codex Runtime · Bundled Enhancement Layer")
          .font(.system(size: 12))
          .foregroundStyle(CodexTheme.textSecondary)
      }
      Spacer()
    }
  }

  private var quickStatsGrid: some View {
    HStack(spacing: 12) {
      StatCard(
        title: "Active Services",
        value: "\(manager.enhancements.filter { $0.isService && manager.isServiceRunning($0.id) }.count) / \(manager.enhancements.filter(\.isService).count)",
        icon: "network",
        color: CodexTheme.blue
      )
      StatCard(
        title: "Available Tools",
        value: "\(manager.enhancements.filter { !$0.isService }.count)",
        icon: "wrench.and.screwdriver",
        color: CodexTheme.purple
      )
      StatCard(
        title: "Environment",
        value: "Isolated",
        icon: "lock.shield",
        color: CodexTheme.green
      )
    }
  }

  private var enhancementsSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("ENHANCEMENT MODULES")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(CodexTheme.textSecondary)

      ForEach(manager.enhancements) { item in
        EnhancementCard(enhancement: item)
      }
    }
  }
}

// MARK: - Stat Card

struct StatCard: View {
  let title: String
  let value: String
  let icon: String
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Image(systemName: icon)
          .foregroundColor(color)
        Spacer()
      }
      Text(value)
        .font(.system(size: 18, weight: .bold))
        .foregroundStyle(CodexTheme.textPrimary)
      Text(title)
        .font(.system(size: 11))
        .foregroundStyle(CodexTheme.textSecondary)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(CodexTheme.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(CodexTheme.border, lineWidth: 1))
    )
  }
}

// MARK: - Enhancement Card

struct EnhancementCard: View {
  let enhancement: Enhancement
  @ObservedObject private var manager = EnhancementManager.shared
  @State private var isHovered = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        ZStack {
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(enhancement.tint.opacity(0.15))
            .frame(width: 34, height: 34)
          Image(systemName: enhancement.symbolName)
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(enhancement.tint)
        }

        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 8) {
            Text(enhancement.label)
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(CodexTheme.textPrimary)

            if enhancement.isService {
              let isRunning = manager.isServiceRunning(enhancement.id)
              HStack(spacing: 4) {
                Circle()
                  .fill(isRunning ? CodexTheme.green : Color.gray)
                  .frame(width: 6, height: 6)
                Text(isRunning ? "ACTIVE" : "STOPPED")
                  .font(.system(size: 9, weight: .bold))
                  .foregroundColor(isRunning ? CodexTheme.green : Color.gray)
              }
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(Capsule().fill(isRunning ? CodexTheme.green.opacity(0.12) : Color.gray.opacity(0.12)))
            } else {
              Text("TOOL")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(CodexTheme.textSecondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(CodexTheme.sidebar))
            }
          }

          if let desc = enhancement.description {
            Text(desc)
              .font(.system(size: 11))
              .foregroundStyle(CodexTheme.textSecondary)
              .lineLimit(1)
          }
        }

        Spacer()

        Toggle("", isOn: Binding(
          get: { manager.isEnabled(enhancement.id) },
          set: { manager.setEnabled(enhancement.id, $0) }
        ))
        .toggleStyle(.switch)
        .labelsHidden()
        .controlSize(.small)
      }

      if manager.isEnabled(enhancement.id) {
        Divider().overlay(CodexTheme.border)
        HStack {
          if enhancement.viewOptions.count > 1 {
            Picker("View", selection: Binding(
              get: { manager.selectedView(for: enhancement) },
              set: { manager.setSelectedView(for: enhancement.id, view: $0) }
            )) {
              ForEach(enhancement.viewOptions, id: \.self) { opt in
                Text(enhancement.viewLabels[enhancement.viewOptions.firstIndex(of: opt) ?? 0]).tag(opt)
              }
            }
            .pickerStyle(.segmented)
            .controlSize(.small)
            .frame(maxWidth: 220)
          }

          Spacer()

          if enhancement.isService {
            Button("Restart") {
              manager.restartService(id: enhancement.id)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
          }

          Button {
            manager.openAction(for: enhancement)
          } label: {
            Label(enhancement.openLabel, systemImage: "arrow.up.right")
              .font(.system(size: 11.5, weight: .medium))
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.small)
          .tint(enhancement.tint)
        }
      }
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(isHovered ? CodexTheme.cardHover : CodexTheme.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(CodexTheme.border, lineWidth: 1))
    )
    .onHover { hovering in
      withAnimation(.easeInOut(duration: 0.12)) { isHovered = hovering }
    }
  }
}

// MARK: - Services Section

struct ServicesView: View {
  @ObservedObject private var manager = EnhancementManager.shared

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Managed Services")
          .font(.title3.bold())
          .foregroundStyle(CodexTheme.textPrimary)

        Text("Persistent background services initialized before Codex and scoped cleanly to the rebuild profile.")
          .font(.system(size: 12))
          .foregroundStyle(CodexTheme.textSecondary)

        ForEach(manager.enhancements.filter(\.isService)) { service in
          VStack(alignment: .leading, spacing: 14) {
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(service.label)
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundStyle(CodexTheme.textPrimary)
                if let port = service.port {
                  Text("Listening on 127.0.0.1:\(port)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(CodexTheme.textSecondary)
                }
              }
              Spacer()
              let running = manager.isServiceRunning(service.id)
              Text(running ? "HEALTHY" : "OFFLINE")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(running ? CodexTheme.green : Color.red)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(running ? CodexTheme.green.opacity(0.12) : Color.red.opacity(0.12)))
            }

            HStack(spacing: 10) {
              Button(manager.isServiceRunning(service.id) ? "Stop Service" : "Start Service") {
                if manager.isServiceRunning(service.id) {
                  manager.stopService(id: service.id)
                } else {
                  manager.startService(service)
                }
              }
              .buttonStyle(.bordered)
              .controlSize(.small)

              Button("Restart") {
                manager.restartService(id: service.id)
              }
              .buttonStyle(.bordered)
              .controlSize(.small)

              Spacer()

              Button(service.openLabel) {
                manager.openAction(for: service)
              }
              .buttonStyle(.borderedProminent)
              .controlSize(.small)
              .tint(CodexTheme.blue)
            }
          }
          .padding(16)
          .background(
            RoundedRectangle(cornerRadius: 10)
              .fill(CodexTheme.card)
              .overlay(RoundedRectangle(cornerRadius: 10).stroke(CodexTheme.border, lineWidth: 1))
          )
        }
      }
      .padding(24)
    }
  }
}

// MARK: - Tools Section

struct ToolsView: View {
  @ObservedObject private var manager = EnhancementManager.shared

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("On-Demand Tools")
          .font(.title3.bold())
          .foregroundStyle(CodexTheme.textPrimary)

        Text("Executables and CLI analyzers invoked on demand with the isolated CodexHome environment.")
          .font(.system(size: 12))
          .foregroundStyle(CodexTheme.textSecondary)

        ForEach(manager.enhancements.filter { !$0.isService }) { tool in
          EnhancementCard(enhancement: tool)
        }
      }
      .padding(24)
    }
  }
}

// MARK: - Usage Report Section

struct UsageReportView: View {
  @ObservedObject private var manager = EnhancementManager.shared

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text("Codex Usage & Cost Analysis")
            .font(.title3.bold())
            .foregroundStyle(CodexTheme.textPrimary)
          Text("Powered by native ccusage scoped to isolated CodexHome")
            .font(.system(size: 11))
            .foregroundStyle(CodexTheme.textSecondary)
        }
        Spacer()

        Button {
          if let tool = manager.enhancements.first(where: { $0.id == "ccusage" }) {
            manager.executeTool(tool)
          }
        } label: {
          Label(manager.isToolRunning["ccusage"] == true ? "Analyzing…" : "Run Analysis", systemImage: "arrow.clockwise")
            .font(.system(size: 11.5, weight: .medium))
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .disabled(manager.isToolRunning["ccusage"] == true)
      }

      ZStack {
        RoundedRectangle(cornerRadius: 8)
          .fill(CodexTheme.card)
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(CodexTheme.border, lineWidth: 1))

        ScrollView {
          Text(manager.toolOutputs["ccusage"] ?? "Click 'Run Analysis' to fetch current token usage and session breakdown.")
            .font(.system(size: 11.5, design: .monospaced))
            .foregroundStyle(CodexTheme.textPrimary)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .padding(24)
    .onAppear {
      if manager.toolOutputs["ccusage"] == nil,
         let tool = manager.enhancements.first(where: { $0.id == "ccusage" }) {
        manager.executeTool(tool)
      }
    }
  }
}

// MARK: - Logs Console Section

struct LogsConsoleView: View {
  @ObservedObject private var manager = EnhancementManager.shared
  @State private var selectedLog = "opencodex.log"
  @State private var logContent = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Live Service Logs")
          .font(.title3.bold())
          .foregroundStyle(CodexTheme.textPrimary)

        Spacer()

        Button("Reveal Logs in Finder") {
          NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: manager.logsDirectoryURL.path)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)

        Button("Refresh") {
          loadLogContent()
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
      }

      ZStack {
        RoundedRectangle(cornerRadius: 8)
          .fill(CodexTheme.card)
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(CodexTheme.border, lineWidth: 1))

        ScrollView {
          Text(logContent.isEmpty ? "No log output recorded yet." : logContent)
            .font(.system(size: 11, design: .monospaced))
            .foregroundStyle(CodexTheme.textPrimary)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .padding(24)
    .onAppear {
      loadLogContent()
    }
  }

  private func loadLogContent() {
    let path = manager.logsDirectoryURL.appendingPathComponent(selectedLog).path
    if let str = try? String(contentsOfFile: path, encoding: .utf8) {
      self.logContent = str
    } else {
      self.logContent = "Log file not found at \(path)"
    }
  }
}

// MARK: - In-App Web Viewer Window

public final class EnhancementWebSheet: NSObject, NSWindowDelegate {
  public static let shared = EnhancementWebSheet()
  private var windows: [String: NSWindow] = [:]

  public func show(title: String, url: URL) {
    if let existing = windows[title] {
      existing.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = title
    window.center()
    window.isReleasedWhenClosed = false

    let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    window.contentView = webView
    webView.load(URLRequest(url: url))

    windows[title] = window
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  public func windowWillClose(_ notification: Notification) {
    guard let window = notification.object as? NSWindow else { return }
    if let key = windows.first(where: { $0.value == window })?.key {
      windows.removeValue(forKey: key)
    }
  }
}

// MARK: - Hub Window Manager

public final class HubWindow: NSObject, NSWindowDelegate {
  public static let shared = HubWindow()
  private var window: NSWindow?

  public func show() {
    if let window = window {
      window.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    let hosting = NSHostingController(rootView: HubView())
    let window = NSWindow(contentViewController: hosting)
    window.title = "Oh My OpenAI · Enhancements Command Center"
    window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
    window.titlebarAppearsTransparent = true
    window.isReleasedWhenClosed = false
    window.setContentSize(NSSize(width: 860, height: 580))
    window.minSize = NSSize(width: 720, height: 480)
    window.center()
    window.isMovableByWindowBackground = true

    self.window = window
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  public func windowWillClose(_ notification: Notification) {
    self.window = nil
  }
}

// MARK: - C Entry Points

@_cdecl("ShowEnhancementHub")
public func ShowEnhancementHub() {
  DispatchQueue.main.async {
    HubWindow.shared.show()
  }
}

@_cdecl("ShowWebWindow")
public func ShowWebWindow(label: UnsafePointer<CChar>?, url: UnsafePointer<CChar>?) {
  guard let label = label, let url = url else { return }
  let title = String(cString: label)
  guard let targetURL = URL(string: String(cString: url)) else { return }
  DispatchQueue.main.async {
    EnhancementWebSheet.shared.show(title: title, url: targetURL)
  }
}
