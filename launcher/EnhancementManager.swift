// EnhancementManager.swift — Unified manager for Oh My OpenAI enhancements.
// Manages manifest loading, process lifecycles, healthchecks, settings persistence,
// and real-time streaming logs.

import AppKit
import Foundation
import SwiftUI

// MARK: - Data Models

public struct Enhancement: Identifiable, Decodable, Equatable {
  public let id: String
  public let type: String
  public let resolvedVersion: String?
  public let description: String?
  public let config: Config?
  public let toolCommand: [String]?
  public let startCommand: [String]?
  public let ui: UI?

  public struct Config: Decodable, Equatable {
    public let port: Int?
  }

  public struct UI: Decodable, Equatable {
    public let label: String?
    public let kind: String?
    public let openLabel: String?
    public let url: String?
  }

  public var label: String { ui?.label ?? id }
  public var isService: Bool { type == "service" }
  public var kind: String { ui?.kind ?? "tool" }
  public var openLabel: String { ui?.openLabel ?? (isService ? "Open Dashboard" : "Launch") }
  public var port: Int? { config?.port }

  public var symbolName: String {
    switch id {
    case "opencodex": return "network"
    case "ccusage": return "chart.xyaxis.line"
    case "codex-chatgpt-web": return "bubble.left.and.bubble.right.fill"
    case "codexpp": return "wand.and.stars"
    default: return "sparkles"
    }
  }

  public var tint: Color {
    switch id {
    case "opencodex": return Color(red: 0.20, green: 0.61, blue: 1.00) // Blue
    case "ccusage": return Color(red: 1.00, green: 0.52, blue: 0.29)   // Orange
    case "codex-chatgpt-web": return Color(red: 0.68, green: 0.48, blue: 0.98) // Purple
    case "codexpp": return Color(red: 1.00, green: 0.55, blue: 0.76)   // Pink
    default: return Color(red: 0.25, green: 0.79, blue: 0.47)         // Green
    }
  }

  public var viewOptions: [String] {
    switch kind {
    case "web": return ["window", "browser"]
    case "ccusage": return ["report", "terminal"]
    default: return ["launch"]
    }
  }

  public var viewLabels: [String] {
    viewOptions.map { view in
      switch view {
      case "window": return "In-App Window"
      case "browser": return "Default Browser"
      case "report": return "Live Report"
      case "terminal": return "Terminal"
      default: return "Launch"
      }
    }
  }
}

// MARK: - Process and State Manager

@MainActor
public final class EnhancementManager: ObservableObject {
  public static let shared = EnhancementManager()

  @Published public private(set) var enhancements: [Enhancement] = []
  @Published public private(set) var serviceProcesses: [String: Process] = [:]
  @Published public private(set) var serviceHealth: [String: Bool] = [:]
  @Published public private(set) var toolOutputs: [String: String] = [:]
  @Published public private(set) var isToolRunning: [String: Bool] = [:]
  @Published public var enabledMap: [String: Bool] = [:]
  @Published public var viewMap: [String: String] = [:]

  private var healthCheckTimer: Timer?
  private let kEnabledKey = "OMOEEnhancementsEnabled"
  private let kViewKey = "OMOEEnhancementsView"

  private init() {
    loadPreferences()
    loadManifest()
    startHealthChecks()
  }

  // MARK: - Manifest & Preferences

  public func loadManifest() {
    let manifestURL = Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements/manifest.json")
    guard let data = try? Data(contentsOf: manifestURL),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let items = json["enhancements"] as? [[String: Any]] else {
      return
    }
    let decoder = JSONDecoder()
    self.enhancements = items.compactMap { dict -> Enhancement? in
      guard let encoded = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
      return try? decoder.decode(Enhancement.self, from: encoded)
    }
  }

  private func loadPreferences() {
    self.enabledMap = UserDefaults.standard.dictionary(forKey: kEnabledKey) as? [String: Bool] ?? [:]
    self.viewMap = UserDefaults.standard.dictionary(forKey: kViewKey) as? [String: String] ?? [:]
  }

  public func isEnabled(_ id: String) -> Bool {
    enabledMap[id] ?? true
  }

  public func setEnabled(_ id: String, _ enabled: Bool) {
    enabledMap[id] = enabled
    UserDefaults.standard.set(enabledMap, forKey: kEnabledKey)
    if !enabled && isServiceRunning(id) {
      stopService(id: id)
    } else if enabled && !isServiceRunning(id) {
      if let enhancement = enhancements.first(where: { $0.id == id && $0.isService }) {
        startService(enhancement)
      }
    }
  }

  public func selectedView(for enhancement: Enhancement) -> String {
    if let saved = viewMap[enhancement.id], enhancement.viewOptions.contains(saved) {
      return saved
    }
    return enhancement.viewOptions.first ?? "launch"
  }

  public func setSelectedView(for id: String, view: String) {
    viewMap[id] = view
    UserDefaults.standard.set(viewMap, forKey: kViewKey)
  }

  // MARK: - Paths & Environment

  public var supportDirectoryURL: URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CodexDesktop-Rebuild")
  }

  public var codexHomeURL: URL {
    supportDirectoryURL.appendingPathComponent("CodexHome")
  }

  public var profileURL: URL {
    supportDirectoryURL.appendingPathComponent("Profile")
  }

  public var logsDirectoryURL: URL {
    supportDirectoryURL.appendingPathComponent("enhancements")
  }

  public func enhancementDirectory(for id: String) -> URL {
    Bundle.main.bundleURL
      .appendingPathComponent("Contents/Resources/enhancements/\(id)")
  }

  private func resolveBinary(enhDir: URL, command: String) -> String? {
    if command.hasPrefix("/") { return command }
    let local = enhDir.appendingPathComponent(command).path
    if FileManager.default.isExecutableFile(atPath: local) { return local }

    let envPath = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
    for dir in envPath.split(separator: ":").map(String.init) {
      let candidate = (dir as NSString).appendingPathComponent(command)
      if FileManager.default.isExecutableFile(atPath: candidate) { return candidate }
    }
    return nil
  }

  private func makeEnvironment() -> [String: String] {
    var env = ProcessInfo.processInfo.environment
    env["CODEX_HOME"] = codexHomeURL.path
    env["CODEX_ELECTRON_USER_DATA_PATH"] = profileURL.path
    return env
  }

  // MARK: - Service Lifecycle

  public func startAllServices() {
    try? FileManager.default.createDirectory(at: logsDirectoryURL, withIntermediateDirectories: true)
    for enhancement in enhancements where enhancement.isService && isEnabled(enhancement.id) {
      startService(enhancement)
    }
  }

  public func stopAllServices() {
    for (_, process) in serviceProcesses {
      if process.isRunning {
        process.terminate()
      }
    }
    serviceProcesses.removeAll()
    serviceHealth.removeAll()
  }

  public func isServiceRunning(_ id: String) -> Bool {
    if let process = serviceProcesses[id], process.isRunning {
      return true
    }
    return serviceHealth[id] ?? false
  }

  public func startService(_ enhancement: Enhancement) {
    guard enhancement.isService,
          let startCommand = enhancement.startCommand,
          let first = startCommand.first else { return }

    if let existing = serviceProcesses[enhancement.id], existing.isRunning {
      return
    }

    let enhDir = enhancementDirectory(for: enhancement.id)
    guard let binary = resolveBinary(enhDir: enhDir, command: first) else {
      NSLog("[EnhancementManager] Binary not found for service %@", enhancement.id)
      return
    }

    let logFile = logsDirectoryURL.appendingPathComponent("\(enhancement.id).log")
    if !FileManager.default.fileExists(atPath: logFile.path) {
      FileManager.default.createFile(atPath: logFile.path, contents: nil)
    }
    let fileHandle = try? FileHandle(forWritingTo: logFile)
    fileHandle?.seekToEndOfFile()

    let task = Process()
    task.executableURL = URL(fileURLWithPath: binary)
    task.arguments = Array(startCommand.dropFirst())
    task.currentDirectoryURL = enhDir
    task.environment = makeEnvironment()
    if let handle = fileHandle {
      task.standardOutput = handle
      task.standardError = handle
    }

    task.terminationHandler = { [weak self] _ in
      DispatchQueue.main.async {
        self?.serviceProcesses.removeValue(forKey: enhancement.id)
        self?.serviceHealth[enhancement.id] = false
      }
    }

    do {
      try task.run()
      serviceProcesses[enhancement.id] = task
      serviceHealth[enhancement.id] = true
    } catch {
      NSLog("[EnhancementManager] Failed to start service %@: %@", enhancement.id, error.localizedDescription)
    }
  }

  public func stopService(id: String) {
    if let process = serviceProcesses[id], process.isRunning {
      process.terminate()
    }
    serviceProcesses.removeValue(forKey: id)
    serviceHealth[id] = false
  }

  public func restartService(id: String) {
    stopService(id: id)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      if let enhancement = self.enhancements.first(where: { $0.id == id }) {
        self.startService(enhancement)
      }
    }
  }

  // MARK: - Health Checks

  private func startHealthChecks() {
    healthCheckTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      Task { @MainActor in
        await self.checkHealth()
      }
    }
  }

  public func checkHealth() async {
    for enhancement in enhancements where enhancement.isService {
      if let port = enhancement.port {
        let url = URL(string: "http://127.0.0.1:\(port)")!
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.0
        do {
          let (_, response) = try await URLSession.shared.data(for: req)
          if let http = response as? HTTPURLResponse, http.statusCode < 500 {
            self.serviceHealth[enhancement.id] = true
            continue
          }
        } catch {}
      }
      let procRunning = self.serviceProcesses[enhancement.id]?.isRunning ?? false
      self.serviceHealth[enhancement.id] = procRunning
    }
  }

  // MARK: - Tool Execution

  public func executeTool(_ enhancement: Enhancement) {
    guard let toolCommand = enhancement.toolCommand, let first = toolCommand.first else { return }
    let enhDir = enhancementDirectory(for: enhancement.id)
    guard let binary = resolveBinary(enhDir: enhDir, command: first) else { return }

    let view = selectedView(for: enhancement)
    if view == "terminal" {
      let script = "tell application \"Terminal\" to do script \"cd \(enhDir.path.replacingOccurrences(of: "\"", with: "\\\"")) && \(binary) \(toolCommand.dropFirst().joined(separator: " "))\""
      if let appleScript = NSAppleScript(source: script) {
        var error: NSDictionary?
        appleScript.executeAndReturnError(&error)
      }
      return
    }

    isToolRunning[enhancement.id] = true
    toolOutputs[enhancement.id] = "Running \(enhancement.label)…\n"

    let task = Process()
    task.executableURL = URL(fileURLWithPath: binary)
    task.arguments = Array(toolCommand.dropFirst())
    task.currentDirectoryURL = enhDir
    task.environment = makeEnvironment()

    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = pipe

    pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      if data.isEmpty { return }
      if let text = String(data: data, encoding: .utf8) {
        DispatchQueue.main.async {
          let current = self?.toolOutputs[enhancement.id] ?? ""
          self?.toolOutputs[enhancement.id] = current + text
        }
      }
    }

    task.terminationHandler = { [weak self] _ in
      DispatchQueue.main.async {
        pipe.fileHandleForReading.readabilityHandler = nil
        self?.isToolRunning[enhancement.id] = false
      }
    }

    try? task.run()
  }

  public func openAction(for enhancement: Enhancement) {
    let view = selectedView(for: enhancement)
    if let urlString = enhancement.ui?.url, let url = URL(string: urlString) {
      if view == "browser" {
        NSWorkspace.shared.open(url)
      } else {
        EnhancementWebSheet.shared.show(title: enhancement.label, url: url)
      }
    } else {
      executeTool(enhancement)
      ShowEnhancementHub()
    }
  }
}

// MARK: - Objective-C Bridge Interface

@_cdecl("EnhancementManagerStartAll")
public func EnhancementManagerStartAll() {
  DispatchQueue.main.async {
    EnhancementManager.shared.startAllServices()
  }
}

@_cdecl("EnhancementManagerStopAll")
public func EnhancementManagerStopAll() {
  DispatchQueue.main.async {
    EnhancementManager.shared.stopAllServices()
  }
}

@_cdecl("EnhancementManagerOpen")
public func EnhancementManagerOpen(cId: UnsafePointer<CChar>?, cView: UnsafePointer<CChar>?) {
  guard let cId = cId else { return }
  let id = String(cString: cId)
  DispatchQueue.main.async {
    if let enh = EnhancementManager.shared.enhancements.first(where: { $0.id == id }) {
      if let cView = cView {
        EnhancementManager.shared.setSelectedView(for: id, view: String(cString: cView))
      }
      EnhancementManager.shared.openAction(for: enh)
    }
  }
}

@_cdecl("EnhancementManagerRestartService")
public func EnhancementManagerRestartService(cId: UnsafePointer<CChar>?) {
  guard let cId = cId else { return }
  let id = String(cString: cId)
  DispatchQueue.main.async {
    EnhancementManager.shared.restartService(id: id)
  }
}
