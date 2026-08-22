#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <errno.h>
#import <fcntl.h>
#import <spawn.h>
#import <signal.h>
#import <stdlib.h>
#import <string.h>
#import <sys/file.h>
#import <sys/stat.h>
#import <unistd.h>

extern char **environ;

static NSString *const kSupportDirectory =
  @"Library/Application Support/CodexDesktop-Rebuild";
static NSString *const kRuntimeName = @"Codex.app";
static NSString *const kLegacyRuntimeName = @"Codex Runtime.app";
static NSString *const kPayloadName = @"Codex.payload";
static NSString *const kCodexHomeName = @"CodexHome";
static NSString *const kRuntimeBundleIdentifier = @"io.haleclipse.codexdesktop.runtime";
static NSString *const kLauncherURLScheme = @"codex-rebuild";

// These are the Carbon kInternetEventClass, kAEGetURL, and keyDirectObject
// four-character codes. Keeping the values local avoids linking Carbon solely
// for constants while still using NSAppleEventManager's native GURL path.
static const AEEventClass kCodexInternetEventClass = (AEEventClass)0x4755524cU;
static const AEEventID kCodexGetURLEvent = (AEEventID)0x4755524cU;
static const AEKeyword kCodexDirectObject = (AEKeyword)0x2d2d2d2dU;

static void ClaimLauncherURLScheme(void) {
  [[NSWorkspace sharedWorkspace]
    setDefaultApplicationAtURL:NSBundle.mainBundle.bundleURL
          toOpenURLsWithScheme:kLauncherURLScheme
             completionHandler:nil];
}

static void ShowLaunchError(NSString *message) {
  [NSApplication sharedApplication];
  [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
  [NSApp activateIgnoringOtherApps:YES];

  NSAlert *alert = [[NSAlert alloc] init];
  alert.alertStyle = NSAlertStyleCritical;
  alert.messageText = @"Codex could not start";
  alert.informativeText = message;
  [alert addButtonWithTitle:@"OK"];
  [alert runModal];
}

static void SanitizeEnvironment(void) {
  NSDictionary<NSString *, NSString *> *environment = NSProcessInfo.processInfo.environment;
  for (NSString *key in environment) {
    if ([key hasPrefix:@"DYLD_"] ||
        [key isEqualToString:@"ELECTRON_RUN_AS_NODE"] ||
        [key isEqualToString:@"ELECTRON_NO_ASAR"] ||
        [key isEqualToString:@"ELECTRON_FORCE_IS_PACKAGED"] ||
        [key isEqualToString:@"NODE_OPTIONS"]) {
      unsetenv(key.UTF8String);
    }
  }
}

static NSString *ConciseToolOutput(NSData *data) {
  if (data.length == 0) return @"No diagnostic output was provided.";

  NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (!output) output = @"The diagnostic output was not valid UTF-8.";
  output = [output stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (output.length == 0) return @"No diagnostic output was provided.";
  if (output.length > 2000) {
    output = [@"…" stringByAppendingString:[output substringFromIndex:output.length - 1999]];
  }
  return output;
}

static BOOL RunTool(NSString *launchPath, NSArray<NSString *> *arguments,
                    NSString **diagnostic) {
  NSTask *task = [[NSTask alloc] init];
  task.launchPath = launchPath;
  task.arguments = arguments;

  NSPipe *pipe = [NSPipe pipe];
  task.standardOutput = pipe;
  task.standardError = pipe;

  @try {
    [task launch];
  } @catch (NSException *exception) {
    if (diagnostic) {
      *diagnostic = exception.reason ? exception.reason :
        @"The helper process could not be started.";
    }
    return NO;
  }

  NSData *output = [pipe.fileHandleForReading readDataToEndOfFile];
  [task waitUntilExit];
  if (task.terminationStatus == 0) return YES;

  if (diagnostic) *diagnostic = ConciseToolOutput(output);
  return NO;
}

// ─── Enhancement UI (menu bar + settings) ───────────────────────

@class CodexLauncherDelegate;

// SwiftUI command center (launcher/EnhancementHub.swift, linked via swiftc).
extern void ShowEnhancementHub(void);
extern void ShowEnhancementAnalytics(void);
extern void ShowWebWindow(const char *label, const char *url);
extern void CaptureHubWindow(void);

static CodexLauncherDelegate *gAppDelegate = nil;
static BOOL gShowSettingsOnLaunch = NO;
static BOOL gCaptureHubOnLaunch = NO;

static NSStatusItem *gEnhancementStatusItem = nil;
static NSArray<NSDictionary *> *gLoadedEnhancements = nil;

static NSString *const kEnabledDefaultsKey = @"OMOEEnhancementsEnabled";
static NSString *const kViewDefaultsKey = @"OMOEEnhancementsView";

static NSArray<NSDictionary *> *LoadEnhancementManifest(void) {
  if (gLoadedEnhancements) return gLoadedEnhancements;
  NSURL *manifestURL = [NSBundle.mainBundle.bundleURL
    URLByAppendingPathComponent:@"Contents/Resources/enhancements/manifest.json"];
  NSData *data = [NSData dataWithContentsOfURL:manifestURL];
  NSDictionary *manifest = data
    ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil]
    : nil;
  gLoadedEnhancements = [manifest[@"enhancements"] isKindOfClass:[NSArray class]]
    ? manifest[@"enhancements"]
    : @[];
  return gLoadedEnhancements;
}

static NSDictionary *EnhancementDefaults(void) {
  NSDictionary *stored = [[NSUserDefaults standardUserDefaults] dictionaryForKey:kEnabledDefaultsKey];
  return stored ? stored : @{};
}

static BOOL EnhancementEnabled(NSString *identifier) {
  NSNumber *value = EnhancementDefaults()[identifier];
  return value ? value.boolValue : YES;
}

static void SetEnhancementEnabled(NSString *identifier, BOOL enabled) {
  NSMutableDictionary *stored = [EnhancementDefaults() mutableCopy];
  if (!stored) stored = [NSMutableDictionary dictionary];
  stored[identifier] = @(enabled);
  [[NSUserDefaults standardUserDefaults] setObject:stored forKey:kEnabledDefaultsKey];
}

static NSString *EnhancementView(NSString *identifier) {
  return [[NSUserDefaults standardUserDefaults] dictionaryForKey:kViewDefaultsKey][identifier];
}

static void SetEnhancementView(NSString *identifier, NSString *view) {
  NSMutableDictionary *stored = [NSMutableDictionary dictionary];
  [stored addEntriesFromDictionary:
    [[NSUserDefaults standardUserDefaults] dictionaryForKey:kViewDefaultsKey]];
  stored[identifier] = view;
  [[NSUserDefaults standardUserDefaults] setObject:stored forKey:kViewDefaultsKey];
}

static NSArray<NSString *> *EnhancementViewOptions(NSDictionary *enhancement) {
  NSString *kind = enhancement[@"ui"][@"kind"];
  if ([kind isEqualToString:@"web"]) {
    NSArray<NSString *> *connectCommand = enhancement[@"connectCommand"];
    if ([connectCommand isKindOfClass:[NSArray class]] && connectCommand.count > 0) {
      return @[@"window", @"connect", @"browser"];
    }
    return @[@"window", @"browser"];
  }
  return @[@"launch"];
}

static NSString *EnhancementViewLabel(NSString *view) {
  if ([view isEqualToString:@"window"]) return @"In-app window";
  if ([view isEqualToString:@"connect"]) return @"Connect ChatGPT";
  if ([view isEqualToString:@"browser"]) return @"Browser";
  if ([view isEqualToString:@"report"]) return @"Native report";
  return @"Launch";
}

static NSString *ResolveEnhancementBinary(NSString *enhDir, NSString *command) {
  if ([command hasPrefix:@"/"]) return command;
  NSString *joined = [enhDir stringByAppendingPathComponent:command];
  if ([[NSFileManager defaultManager] isExecutableFileAtPath:joined]) return joined;
  NSString *path = [NSProcessInfo.processInfo.environment objectForKey:@"PATH"];
  if (!path) path = @"/usr/bin:/bin:/usr/local/bin";
  for (NSString *dir in [path componentsSeparatedByString:@":"]) {
    NSString *candidate = [dir stringByAppendingPathComponent:command];
    if ([[NSFileManager defaultManager] isExecutableFileAtPath:candidate]) return candidate;
  }
  return nil;
}

static NSString *EnhancementDirectory(NSDictionary *enhancement) {
  return [[NSBundle.mainBundle.bundleURL
    URLByAppendingPathComponent:
      [@"Contents/Resources/enhancements" stringByAppendingPathComponent:enhancement[@"id"]]]
    path];
}

static BOOL CreatePrivateDirectory(NSString *path, NSString **failure);

static NSString *EnhancementCodexHome(NSDictionary *enhancement, NSString *supportPath) {
  NSString *homeName = enhancement[@"codexHome"];
  if (![homeName isKindOfClass:[NSString class]] || homeName.length == 0 ||
      [homeName containsString:@"/"] || [homeName containsString:@".."] ) {
    homeName = kCodexHomeName;
  }
  NSString *homePath = [supportPath stringByAppendingPathComponent:homeName];
  CreatePrivateDirectory(homePath, nil);
  NSString *configPath = [homePath stringByAppendingPathComponent:@"config.toml"];
  if (![NSFileManager.defaultManager fileExistsAtPath:configPath]) {
    [@"model = \"gpt-5.6-sol\"\n" writeToFile:configPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
    chmod(configPath.fileSystemRepresentation, 0600);
  }
  return homePath;
}

static NSTask *LaunchToolEnhancement(NSDictionary *enhancement,
                                     void (^outputHandler)(NSString *text)) {
  NSArray<NSString *> *toolCommand = enhancement[@"toolCommand"];
  if (![toolCommand isKindOfClass:[NSArray class]] || toolCommand.count == 0) return nil;
  NSString *enhDir = EnhancementDirectory(enhancement);
  NSString *binary = ResolveEnhancementBinary(enhDir, toolCommand[0]);
  if (!binary) {
    NSLog(@"[CodexLauncher] tool %@ binary not found: %@", enhancement[@"id"], toolCommand[0]);
    return nil;
  }

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSTask *task = [[NSTask alloc] init];
  task.launchPath = binary;
  task.arguments = [toolCommand subarrayWithRange:NSMakeRange(1, toolCommand.count - 1)];
  task.currentDirectoryURL = [NSURL fileURLWithPath:enhDir isDirectory:YES];
  NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
  environment[@"CODEX_HOME"] = [supportPath stringByAppendingPathComponent:kCodexHomeName];
  environment[@"CODEX_ELECTRON_USER_DATA_PATH"] =
    [supportPath stringByAppendingPathComponent:@"Profile"];
  task.environment = environment;

  if (outputHandler) {
    NSPipe *pipe = [NSPipe pipe];
    task.standardOutput = pipe;
    task.standardError = pipe;
    NSFileHandle *handle = pipe.fileHandleForReading;
    [handle setReadabilityHandler:^(NSFileHandle *fileHandle) {
      NSData *data = [fileHandle availableData];
      if (data.length == 0) return;
      NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
      if (text.length > 0) outputHandler(text);
    }];
    [task setTerminationHandler:^(NSTask *terminatedTask) {
      (void)terminatedTask;
      [handle setReadabilityHandler:nil];
    }];
  } else {
    task.standardOutput = [NSFileHandle fileHandleWithNullDevice];
    task.standardError = [NSFileHandle fileHandleWithNullDevice];
  }

  @try {
    [task launch];
  } @catch (NSException *exception) {
    NSLog(@"[CodexLauncher] failed to launch tool %@: %@", enhancement[@"id"], exception.reason);
    return nil;
  }
  NSLog(@"[CodexLauncher] tool %@ launched (pid %d)", enhancement[@"id"], task.processIdentifier);
  return task;
}

static void ShowWebEnhancement(NSDictionary *enhancement) {
  NSString *urlString = enhancement[@"ui"][@"url"];
  NSString *label = enhancement[@"ui"][@"label"];
  if (!urlString || !label) return;
  ShowWebWindow(label.UTF8String, urlString.UTF8String);
}

static void OpenBundledEnhancementApp(NSDictionary *enhancement) {
  NSString *appPath = enhancement[@"appPath"];
  if (![appPath isKindOfClass:[NSString class]]) return;
  NSString *fullPath = [EnhancementDirectory(enhancement) stringByAppendingPathComponent:appPath];
  NSURL *appURL = [NSURL fileURLWithPath:fullPath isDirectory:YES];
  if (![[NSFileManager defaultManager] fileExistsAtPath:fullPath]) {
    NSLog(@"[CodexLauncher] failed to open bundled app %@ at %@", enhancement[@"id"], fullPath);
    return;
  }
  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
  configuration.activates = YES;
  configuration.environment = @{
    @"CODEX_HOME": [supportPath stringByAppendingPathComponent:kCodexHomeName],
    @"CODEX_ELECTRON_USER_DATA_PATH": [supportPath stringByAppendingPathComponent:@"Profile"],
  };
  [[NSWorkspace sharedWorkspace] openApplicationAtURL:appURL
                                         configuration:configuration
                                     completionHandler:^(NSRunningApplication *application, NSError *error) {
    (void)application;
    if (error) NSLog(@"[CodexLauncher] failed to launch bundled app %@: %@", enhancement[@"id"], error);
  }];
}

static NSString *ShellQuote(NSString *value) {
  return [NSString stringWithFormat:@"'%@'", [value stringByReplacingOccurrencesOfString:@"'"
                                                                        withString:@"'\\''"]];
}

static NSString *AppleScriptString(NSString *value) {
  return [[value stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"]
    stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
}

static NSTask *LaunchConnectionEnhancement(NSDictionary *enhancement);

static void ActivateChromeLoginWindow(NSUInteger attempt) {
  NSRunningApplication *chrome =
    [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.google.Chrome"].firstObject;
  if (chrome) {
    [chrome activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    NSLog(@"[CodexLauncher] activated Google Chrome for ChatGPT login (attempt %lu)",
          (unsigned long)attempt);
  }
  if (attempt < 10) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      ActivateChromeLoginWindow(attempt + 1);
    });
  }
}

static void OpenTerminalEnhancement(NSDictionary *enhancement) {
  NSArray<NSString *> *toolCommand = enhancement[@"toolCommand"];
  if (![toolCommand isKindOfClass:[NSArray class]] || toolCommand.count == 0) return;
  NSString *enhDir = EnhancementDirectory(enhancement);
  NSString *binary = ResolveEnhancementBinary(enhDir, toolCommand[0]);
  if (!binary) {
    NSLog(@"[CodexLauncher] terminal tool %@ binary not found: %@", enhancement[@"id"], toolCommand[0]);
    return;
  }

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSMutableArray<NSString *> *parts = [NSMutableArray arrayWithObjects:
    [NSString stringWithFormat:@"cd %@", ShellQuote(enhDir)],
    [NSString stringWithFormat:@"export CODEX_HOME=%@", ShellQuote([supportPath stringByAppendingPathComponent:kCodexHomeName])],
    [NSString stringWithFormat:@"export CODEX_ELECTRON_USER_DATA_PATH=%@", ShellQuote([supportPath stringByAppendingPathComponent:@"Profile"])],
    ShellQuote(binary), nil];
  for (NSString *argument in [toolCommand subarrayWithRange:NSMakeRange(1, toolCommand.count - 1)]) {
    [parts addObject:ShellQuote(argument)];
  }

  NSString *terminalCommand = [parts componentsJoinedByString:@" && "];
  NSString *script = [NSString stringWithFormat:
    @"tell application \"Terminal\"\n  activate\n  do script \"%@\"\nend tell",
    AppleScriptString(terminalCommand)];
  NSAppleScript *appleScript = [[NSAppleScript alloc] initWithSource:script];
  NSDictionary *error = nil;
  [appleScript executeAndReturnError:&error];
  if (error) {
    NSLog(@"[CodexLauncher] failed to open terminal tool %@: %@", enhancement[@"id"], error);
  }
}

static void OpenEnhancement(NSString *identifier, NSString *view) {
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    if (![enhancement[@"id"] isEqualToString:identifier]) continue;
    NSString *kind = enhancement[@"ui"][@"kind"];
    if ([kind isEqualToString:@"web"]) {
      if ([view isEqualToString:@"browser"]) {
        NSURL *url = [NSURL URLWithString:enhancement[@"ui"][@"url"]];
        if (url) [[NSWorkspace sharedWorkspace] openURL:url];
      } else if ([view isEqualToString:@"connect"]) {
        LaunchConnectionEnhancement(enhancement);
        ShowWebEnhancement(enhancement);
      } else {
        ShowWebEnhancement(enhancement);
      }
    } else if ([kind isEqualToString:@"app"]) {
      OpenBundledEnhancementApp(enhancement);
    } else if ([kind isEqualToString:@"terminal"]) {
      OpenTerminalEnhancement(enhancement);
    } else {
      LaunchToolEnhancement(enhancement, nil);
    }
    return;
  }
}

static NSString *EnhancementSymbol(NSDictionary *enhancement) {
  NSString *kind = enhancement[@"ui"][@"kind"];
  if ([enhancement[@"type"] isEqualToString:@"service"]) return @"globe";
  if ([kind isEqualToString:@"app"]) return @"chart.xyaxis.line";
  if ([kind isEqualToString:@"terminal"]) return @"bubble.left.and.bubble.right.fill";
  return @"sparkles";
}

static NSMenuItem *MenuItemWithSymbol(NSString *title, SEL action, NSString *symbol) {
  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title
                                                action:action
                                         keyEquivalent:@""];
  item.target = gAppDelegate;
  if (symbol) {
    item.image = [NSImage imageWithSystemSymbolName:symbol
                           accessibilityDescription:title];
  }
  return item;
}

static void RebuildEnhancementMenu(void) {
  NSMenu *menu = [[NSMenu alloc] init];
  menu.autoenablesItems = NO;

  NSMenuItem *openCodex = MenuItemWithSymbol(@"Open Codex",
                                             @selector(openCodexAppAction:),
                                             @"arrow.up.forward.app");
  [menu addItem:openCodex];

  NSMenuItem *newChat = MenuItemWithSymbol(@"New Chat",
                                           @selector(newChatAction:),
                                           @"square.and.pencil");
  newChat.keyEquivalent = @"n";
  [menu addItem:newChat];

  [menu addItem:[NSMenuItem separatorItem]];

  NSMenuItem *enhParent = [[NSMenuItem alloc] initWithTitle:@"✦ Enhancements"
                                                     action:nil
                                              keyEquivalent:@""];
  enhParent.image = [NSImage imageWithSystemSymbolName:@"sparkles"
                              accessibilityDescription:@"Enhancements"];
  NSMenu *enhSubmenu = [[NSMenu alloc] init];

  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    NSDictionary *ui = enhancement[@"ui"];
    if (!ui) continue;
    if (!EnhancementEnabled(enhancement[@"id"])) continue;
    NSString *identifier = enhancement[@"id"];
    NSString *kind = ui[@"kind"];
    NSImage *symbol = [NSImage imageWithSystemSymbolName:EnhancementSymbol(enhancement)
                                accessibilityDescription:ui[@"label"]];
    if ([kind isEqualToString:@"web"]) {
      NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:ui[@"label"]
                                                    action:nil
                                             keyEquivalent:@""];
      item.image = symbol;
      NSMenu *submenu = [[NSMenu alloc] init];
      for (NSString *view in EnhancementViewOptions(enhancement)) {
        NSMenuItem *option = MenuItemWithSymbol(EnhancementViewLabel(view),
                                                @selector(openEnhancementAction:),
                                                @"chevron.right");
        option.representedObject = @[identifier, view];
        [submenu addItem:option];
      }
      item.submenu = submenu;
      [enhSubmenu addItem:item];
    } else {
      NSString *title = ui[@"openLabel"];
      if (!title) title = ui[@"label"];
      NSMenuItem *item = MenuItemWithSymbol(title,
                                            @selector(openEnhancementAction:),
                                             EnhancementSymbol(enhancement));
      NSString *view = EnhancementViewOptions(enhancement).firstObject;
      item.representedObject = @[identifier, view];
      [enhSubmenu addItem:item];
    }
  }

  [enhSubmenu addItem:[NSMenuItem separatorItem]];
  NSMenuItem *enhSettings = MenuItemWithSymbol(@"Enhancements Settings…",
                                               @selector(showSettingsAction:),
                                               @"gearshape");
  [enhSubmenu addItem:enhSettings];

  enhParent.submenu = enhSubmenu;
  [menu addItem:enhParent];

  [menu addItem:[NSMenuItem separatorItem]];
  NSMenuItem *settings = MenuItemWithSymbol(@"Settings…",
                                            @selector(showSettingsAction:),
                                            @"gearshape");
  settings.keyEquivalent = @",";
  [menu addItem:settings];

  [menu addItem:[NSMenuItem separatorItem]];
  NSMenuItem *quit = MenuItemWithSymbol(@"Quit Codex",
                                        @selector(terminate:),
                                        @"power");
  quit.keyEquivalent = @"q";
  [menu addItem:quit];
  gEnhancementStatusItem.menu = menu;
}

static NSImage *SparkTemplateImage(void) {
  const CGFloat size = 18.0;
  const CGFloat center = size / 2.0;
  const CGFloat length = 7.2;
  const CGFloat halfWidth = 2.4;
  NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(size, size)];
  [image lockFocus];
  NSBezierPath *spark = [[NSBezierPath alloc] init];
  for (NSInteger index = 0; index < 4; index++) {
    CGFloat angle = index * 90.0 * M_PI / 180.0;
    CGFloat cosA = cos(angle), sinA = sin(angle);
    CGFloat perpX = -sinA, perpY = cosA;
    NSPoint tip = NSMakePoint(center + cosA * length, center + sinA * length);
    NSPoint base1 = NSMakePoint(center + perpX * halfWidth * 0.9,
                                center + perpY * halfWidth * 0.9);
    NSPoint base2 = NSMakePoint(center - perpX * halfWidth * 0.9,
                                center - perpY * halfWidth * 0.9);
    NSPoint control1 = NSMakePoint(center + cosA * length * 0.45 + perpX * halfWidth,
                                   center + sinA * length * 0.45 + perpY * halfWidth);
    NSPoint control2 = NSMakePoint(center + cosA * length * 0.45 - perpX * halfWidth,
                                   center + sinA * length * 0.45 - perpY * halfWidth);
    NSPoint nearTip1 = NSMakePoint(tip.x - cosA * 1.6, tip.y - sinA * 1.6);
    [spark moveToPoint:base1];
    [spark curveToPoint:tip controlPoint1:control1 controlPoint2:nearTip1];
    [spark curveToPoint:base2 controlPoint1:nearTip1 controlPoint2:control2];
    [spark closePath];
  }
  [spark fill];
  [image unlockFocus];
  image.template = YES;
  return image;
}

static NSImage *ChatGPTTemplateImage(void) {
  NSString *resourcePath = [[NSBundle mainBundle] pathForResource:@"chatgptTemplate" ofType:@"png"];
  if (resourcePath) {
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:resourcePath];
    if (image) {
      image.template = YES;
      return image;
    }
  }
  return SparkTemplateImage();
}

static void InstallEnhancementStatusItem(void) {
  gEnhancementStatusItem = [[NSStatusBar systemStatusBar]
    statusItemWithLength:NSVariableStatusItemLength];
  NSImage *icon = ChatGPTTemplateImage();
  if (icon) {
    gEnhancementStatusItem.button.image = icon;
  } else {
    gEnhancementStatusItem.button.title = @"✦";
  }
  gEnhancementStatusItem.button.toolTip = @"Codex Enhancements";
  gEnhancementStatusItem.visible = YES;
  RebuildEnhancementMenu();
  // Re-assert the menu after the status bar has registered the item, so the
  // item can never end up attached but empty.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    gEnhancementStatusItem.button.toolTip = @"Codex Enhancements";
    RebuildEnhancementMenu();
  });
}

static void ShowEnhancementSettings(void) {
  // The SwiftUI command center (launcher/EnhancementHub.swift) owns the
  // settings window; it shares this process, bundle, and defaults domain.
  ShowEnhancementHub();
}

// ─── Enhancement lifecycle ──────────────────────────────────────

static BOOL gEnhancementsStarted = NO;
static NSMutableArray<NSTask *> *gEnhancementTasks = nil;
static NSMutableArray<NSTask *> *gConnectionTasks = nil;

// Async-signal-safe PID tracking so a raw SIGTERM/SIGINT/SIGHUP (AppKit only
// delivers applicationWillTerminate: on ordinary quit paths) still stops every
// enhancement instead of orphaning it.
static pid_t gEnhancementPids[32];
static int gEnhancementPidCount = 0;

static void HandleTerminationSignal(int signalNumber) {
  for (int index = 0; index < gEnhancementPidCount; index++) {
    kill(gEnhancementPids[index], SIGTERM);
  }
  _exit(128 + signalNumber);
}

// Forward declaration (defined later in this file)
static BOOL CreatePrivateDirectory(NSString *path, NSString **failure);

static BOOL StartEnhancements(void) {
  if (gEnhancementsStarted) return YES;
  gEnhancementsStarted = YES;

  NSURL *manifestURL = [NSBundle.mainBundle.bundleURL
    URLByAppendingPathComponent:@"Contents/Resources/enhancements/manifest.json"];
  if (![[NSFileManager defaultManager] fileExistsAtPath:manifestURL.path]) {
    NSLog(@"[CodexLauncher] no enhancements manifest; skipping");
    return YES;
  }

  NSData *manifestData = [NSData dataWithContentsOfURL:manifestURL];
  NSDictionary *manifest;
  @try {
    manifest = [NSJSONSerialization JSONObjectWithData:manifestData options:0 error:nil];
  } @catch (NSException *e) {
    NSLog(@"[CodexLauncher] failed to parse enhancements manifest: %@", e.reason);
    return YES;
  }
  if (!manifest) {
    NSLog(@"[CodexLauncher] enhancements manifest is empty or invalid");
    return YES;
  }

  NSNumber *version = manifest[@"version"];
  if (!version || [version integerValue] != 1) {
    NSLog(@"[CodexLauncher] unsupported manifest version %@; expected 1", version);
    return YES;
  }

  NSArray<NSDictionary *> *enhancements = manifest[@"enhancements"];
  if (![enhancements isKindOfClass:[NSArray class]]) {
    NSLog(@"[CodexLauncher] enhancements is not an array");
    return YES;
  }

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *enhancementsLogDir = [supportPath stringByAppendingPathComponent:@"enhancements"];
  CreatePrivateDirectory(enhancementsLogDir, nil);

  for (NSDictionary *enhancement in enhancements) {
    NSString *id = enhancement[@"id"];
    NSArray<NSString *> *startCommand = enhancement[@"startCommand"];
    if (!id || ![id isKindOfClass:[NSString class]] || !startCommand ||
        ![startCommand isKindOfClass:[NSArray class]] || startCommand.count == 0) {
      NSLog(@"[CodexLauncher] skipping malformed enhancement entry");
      continue;
    }
    if (!EnhancementEnabled(id)) {
      NSLog(@"[CodexLauncher] enhancement %@ disabled in settings; skipping", id);
      continue;
    }

    NSString *enhDir = [[[NSBundle.mainBundle.bundleURL
      URLByAppendingPathComponent:@"Contents/Resources/enhancements"]
      URLByAppendingPathComponent:id] path];
    NSString *command = startCommand[0];
    NSString *binaryPath = ResolveEnhancementBinary(enhDir, command);
    if (![[NSFileManager defaultManager] isExecutableFileAtPath:binaryPath]) {
      NSLog(@"[CodexLauncher] enhancement %@ binary not executable at %@", id, startCommand[0]);
      continue;
    }

    NSString *logPath = [enhancementsLogDir stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.log", id]];
    if (![[NSFileManager defaultManager] fileExistsAtPath:logPath] &&
        ![[NSFileManager defaultManager] createFileAtPath:logPath contents:nil attributes:nil]) {
      NSLog(@"[CodexLauncher] cannot create log file for enhancement %@", id);
      continue;
    }
    NSFileHandle *logHandle = [NSFileHandle fileHandleForWritingAtPath:logPath];
    if (!logHandle) {
      NSLog(@"[CodexLauncher] cannot open log file for enhancement %@", id);
      continue;
    }
    [logHandle seekToEndOfFile];

    NSTask *task = [[NSTask alloc] init];
    task.launchPath = binaryPath;
    task.arguments = [startCommand subarrayWithRange:NSMakeRange(1, startCommand.count - 1)];
    task.currentDirectoryURL = [NSURL fileURLWithPath:enhDir isDirectory:YES];
    NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
   environment[@"CODEX_HOME"] = EnhancementCodexHome(enhancement, supportPath);
    environment[@"CODEX_ELECTRON_USER_DATA_PATH"] =
      [supportPath stringByAppendingPathComponent:@"Profile"];
    task.environment = environment;
    task.standardOutput = logHandle;
    task.standardError = logHandle;

    @try {
      [task launch];
      if (!gEnhancementTasks) gEnhancementTasks = [[NSMutableArray alloc] init];
      [gEnhancementTasks addObject:task];
      if (gEnhancementPidCount < 32) {
        gEnhancementPids[gEnhancementPidCount++] = task.processIdentifier;
      }
      NSLog(@"[CodexLauncher] enhancement %@ started (pid %d)", id, task.processIdentifier);
    } @catch (NSException *e) {
      NSLog(@"[CodexLauncher] failed to start enhancement %@: %@", id, e.reason);
    }
  }
  return YES;
}

static NSTask *LaunchConnectionEnhancement(NSDictionary *enhancement) {
  NSArray<NSString *> *connectCommand = enhancement[@"connectCommand"];
  if (![connectCommand isKindOfClass:[NSArray class]] || connectCommand.count == 0) return nil;

  if (gConnectionTasks) {
    for (NSTask *existing in gConnectionTasks) {
      if (existing.isRunning) return existing;
    }
  }

  NSString *id = enhancement[@"id"];
  NSString *enhDir = EnhancementDirectory(enhancement);
  NSString *binary = ResolveEnhancementBinary(enhDir, connectCommand[0]);
  if (!binary) {
    NSLog(@"[CodexLauncher] connection binary not found for %@: %@", id, connectCommand[0]);
    return nil;
  }

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *logDirectory = [supportPath stringByAppendingPathComponent:@"enhancements"];
  CreatePrivateDirectory(logDirectory, nil);
  NSString *logPath = [logDirectory stringByAppendingPathComponent:
    [NSString stringWithFormat:@"%@-connect.log", id]];
  if (![[NSFileManager defaultManager] fileExistsAtPath:logPath]) {
    [[NSFileManager defaultManager] createFileAtPath:logPath contents:nil attributes:nil];
  }
  NSFileHandle *logHandle = [NSFileHandle fileHandleForWritingAtPath:logPath];
  if (!logHandle) {
    NSLog(@"[CodexLauncher] cannot open connection log for %@", id);
    return nil;
  }
  [logHandle seekToEndOfFile];

  NSTask *task = [[NSTask alloc] init];
  task.launchPath = binary;
  task.arguments = [connectCommand subarrayWithRange:NSMakeRange(1, connectCommand.count - 1)];
  task.currentDirectoryURL = [NSURL fileURLWithPath:enhDir isDirectory:YES];
  NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
   environment[@"CODEX_HOME"] = EnhancementCodexHome(enhancement, supportPath);
  environment[@"CODEX_ELECTRON_USER_DATA_PATH"] =
    [supportPath stringByAppendingPathComponent:@"Profile"];
  task.environment = environment;
  task.standardOutput = logHandle;
  task.standardError = logHandle;

  @try {
    [task launch];
  } @catch (NSException *exception) {
    NSLog(@"[CodexLauncher] failed to start connection for %@: %@", id, exception.reason);
    return nil;
  }

  if (!gConnectionTasks) gConnectionTasks = [[NSMutableArray alloc] init];
  [gConnectionTasks addObject:task];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    ActivateChromeLoginWindow(1);
  });
  [task setTerminationHandler:^(NSTask *finishedTask) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [gConnectionTasks removeObject:finishedTask];
    });
  }];
  NSLog(@"[CodexLauncher] connection flow started for %@ (pid %d)", id, task.processIdentifier);
  return task;
}

static void StopEnhancements(void) {
  if (!gEnhancementTasks) return;
  for (NSTask *task in gEnhancementTasks) {
    if (!task.isRunning) continue;
    [task terminate];
    NSTimeInterval deadline = [NSDate timeIntervalSinceReferenceDate] + 3.0;
    while (task.isRunning && [NSDate timeIntervalSinceReferenceDate] < deadline) {
      usleep(50000); // 50ms
    }
    if (task.isRunning) {
      kill(task.processIdentifier, SIGKILL);
      NSLog(@"[CodexLauncher] force-killed enhancement pid %d", task.processIdentifier);
    }
  }
  NSLog(@"[CodexLauncher] stopped %lu enhancements", (unsigned long)gEnhancementTasks.count);
  [gEnhancementTasks removeAllObjects];
  for (NSTask *task in gConnectionTasks) {
    if (task.isRunning) [task terminate];
  }
  [gConnectionTasks removeAllObjects];
}

static NSDictionary *RuntimeInfo(NSURL *runtimeURL) {
  NSURL *infoURL = [runtimeURL URLByAppendingPathComponent:@"Contents/Info.plist"];
  return [NSDictionary dictionaryWithContentsOfURL:infoURL];
}

static NSURL *RuntimeExecutableURL(NSURL *runtimeURL) {
  NSString *executableName = RuntimeInfo(runtimeURL)[@"CFBundleExecutable"];
  if (executableName.length == 0) executableName = @"ChatGPT";
  return [runtimeURL URLByAppendingPathComponent:
    [@"Contents/MacOS" stringByAppendingPathComponent:executableName]];
}

static BOOL RuntimeExists(NSURL *runtimeURL) {
  BOOL isDirectory = NO;
  NSString *runtimePath = runtimeURL.path;
  if (![NSFileManager.defaultManager fileExistsAtPath:runtimePath isDirectory:&isDirectory] ||
      !isDirectory) {
    return NO;
  }

  NSString *executablePath = RuntimeExecutableURL(runtimeURL).path;
  return [NSFileManager.defaultManager isExecutableFileAtPath:executablePath];
}

static BOOL RuntimeIsRunning(void) {
  NSArray<NSRunningApplication *> *applications =
    [NSRunningApplication runningApplicationsWithBundleIdentifier:kRuntimeBundleIdentifier];
  for (NSRunningApplication *application in applications) {
    if (![application isTerminated]) return YES;
  }
  return NO;
}

static BOOL RuntimeMatchesPayload(NSURL *runtimeURL, NSURL *payloadURL) {
  NSDictionary *runtimeInfo = RuntimeInfo(runtimeURL);
  NSDictionary *payloadInfo = RuntimeInfo(payloadURL);
  if (!runtimeInfo || !payloadInfo) return NO;

  // Bundle version is the update boundary. The identity and display version checks
  // also prevent an old colliding ChatGPT runtime from being treated as current.
  NSArray<NSString *> *keys = @[
    @"CFBundleIdentifier",
    @"CFBundleVersion",
    @"CFBundleShortVersionString",
    @"CodexRebuildContentSHA256",
  ];
  for (NSString *key in keys) {
    id payloadValue = payloadInfo[key];
    id runtimeValue = runtimeInfo[key];
    if (payloadValue && ![payloadValue isEqual:runtimeValue]) return NO;
  }
  return payloadInfo[@"CFBundleVersion"] != nil;
}

static BOOL ReplaceRuntime(NSURL *payloadURL, NSURL *runtimeURL,
                           NSURL *supportURL, NSString **failure) {
  NSFileManager *fileManager = NSFileManager.defaultManager;
  NSString *token = NSUUID.UUID.UUIDString;
  NSURL *stagingURL = [supportURL URLByAppendingPathComponent:
    [NSString stringWithFormat:@".Codex.installing-%@", token]];
  NSURL *backupURL = [supportURL URLByAppendingPathComponent:
    [NSString stringWithFormat:@".Codex.backup-%@", token]];

  [fileManager removeItemAtURL:stagingURL error:nil];
  [fileManager removeItemAtURL:backupURL error:nil];

  NSString *diagnostic = nil;
  BOOL copied = RunTool(@"/usr/bin/ditto",
                        @[@"--rsrc", @"--extattr", @"--acl", @"--noqtn",
                          payloadURL.path, stagingURL.path],
                        &diagnostic);
  if (!copied) {
    if (failure) *failure = [NSString stringWithFormat:
      @"The Codex runtime could not be installed.\n\n%@", diagnostic];
    [fileManager removeItemAtURL:stagingURL error:nil];
    return NO;
  }

  if (!RuntimeExists(stagingURL)) {
    if (failure) *failure = @"The copied Codex runtime is incomplete.";
    [fileManager removeItemAtURL:stagingURL error:nil];
    return NO;
  }

  BOOL valid = RunTool(@"/usr/bin/codesign",
                       @[@"--verify", @"--deep", @"--strict", @"--verbose=2",
                         stagingURL.path],
                       &diagnostic);
  if (!valid) {
    if (failure) *failure = [NSString stringWithFormat:
      @"The Codex runtime failed its integrity check.\n\n%@", diagnostic];
    [fileManager removeItemAtURL:stagingURL error:nil];
    return NO;
  }

  BOOL hadRuntime = [fileManager fileExistsAtPath:runtimeURL.path];
  if (hadRuntime && rename(runtimeURL.fileSystemRepresentation,
                           backupURL.fileSystemRepresentation) != 0) {
    int savedError = errno;
    if (failure) *failure = [NSString stringWithFormat:
      @"The existing Codex runtime could not be prepared for an update.\n\n%s",
      strerror(savedError)];
    [fileManager removeItemAtURL:stagingURL error:nil];
    return NO;
  }

  if (rename(stagingURL.fileSystemRepresentation,
             runtimeURL.fileSystemRepresentation) != 0) {
    int installError = errno;
    int rollbackError = 0;
    if (hadRuntime && rename(backupURL.fileSystemRepresentation,
                             runtimeURL.fileSystemRepresentation) != 0) {
      rollbackError = errno;
    }

    if (failure) {
      if (rollbackError != 0) {
        *failure = [NSString stringWithFormat:
          @"The Codex runtime update failed and the previous runtime could not be restored.\n\nInstall: %s\nRestore: %s",
          strerror(installError), strerror(rollbackError)];
      } else {
        *failure = [NSString stringWithFormat:
          @"The Codex runtime update failed. The previous runtime was restored.\n\n%s",
          strerror(installError)];
      }
    }
    [fileManager removeItemAtURL:stagingURL error:nil];
    return NO;
  }

  if (hadRuntime) [fileManager removeItemAtURL:backupURL error:nil];
  return YES;
}

static NSURL *EnsureRuntime(NSURL *runtimeURL, NSURL *legacyRuntimeURL,
                            NSURL *payloadURL, NSURL *supportURL,
                            NSString **failure) {
  NSString *lockPath = [[supportURL path] stringByAppendingPathComponent:
    @".runtime-install.lock"];
  int lockFD = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR, 0600);
  if (lockFD < 0) {
    if (failure) *failure = [NSString stringWithFormat:
      @"The Codex runtime install lock could not be opened.\n\n%s", strerror(errno)];
    return nil;
  }
  if (flock(lockFD, LOCK_EX) != 0) {
    int savedError = errno;
    close(lockFD);
    if (failure) *failure = [NSString stringWithFormat:
      @"The Codex runtime install lock could not be acquired.\n\n%s", strerror(savedError)];
    return nil;
  }

  NSFileManager *fileManager = NSFileManager.defaultManager;
  BOOL runtimePathExists = [fileManager fileExistsAtPath:runtimeURL.path];
  BOOL legacyPathExists = [fileManager fileExistsAtPath:legacyRuntimeURL.path];
  if (!runtimePathExists && legacyPathExists) {
    if (RuntimeIsRunning()) {
      // A live process must keep its original bundle path until it exits. The
      // next cold launch performs the atomic rename before updating resources.
      runtimeURL = legacyRuntimeURL;
    } else if (rename(legacyRuntimeURL.fileSystemRepresentation,
                      runtimeURL.fileSystemRepresentation) != 0) {
      int savedError = errno;
      flock(lockFD, LOCK_UN);
      close(lockFD);
      if (failure) *failure = [NSString stringWithFormat:
        @"The installed Codex app could not be renamed from Codex Runtime.app to Codex.app.\n\n%s",
        strerror(savedError)];
      return nil;
    }
  } else if (runtimePathExists && legacyPathExists && !RuntimeIsRunning()) {
    // A completed migration can leave an obsolete copy after an interrupted
    // update. It contains no profile data, so remove it once no runtime is live.
    [fileManager removeItemAtURL:legacyRuntimeURL error:nil];
  }

  BOOL payloadIsDirectory = NO;
  BOOL hasPayload = [fileManager fileExistsAtPath:payloadURL.path
                                      isDirectory:&payloadIsDirectory] && payloadIsDirectory;
  BOOL hasRuntime = RuntimeExists(runtimeURL);
  BOOL matchesPayload = hasRuntime && hasPayload && RuntimeMatchesPayload(runtimeURL, payloadURL);
  BOOL passesIntegrityCheck = !matchesPayload || RunTool(@"/usr/bin/codesign",
    @[@"--verify", @"--strict", runtimeURL.path], NULL);
  BOOL needsInstall = !hasRuntime || (hasPayload && (!matchesPayload || !passesIntegrityCheck));
  BOOL result = YES;

  if (needsInstall) {
    if (hasRuntime && RuntimeIsRunning()) {
      // Never replace resources under a live Electron process. The embedded
      // payload remains available and is installed after Codex has quit.
      result = YES;
    } else if (!hasPayload) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The Codex runtime is missing and this launcher has no bundled runtime.\n\nExpected: %@",
        runtimeURL.path];
      result = NO;
    } else if (!RuntimeInfo(payloadURL)[@"CFBundleVersion"]) {
      if (failure) *failure = @"The bundled Codex runtime has invalid version metadata.";
      result = NO;
    } else {
      result = ReplaceRuntime(payloadURL, runtimeURL, supportURL, failure);
    }
  }

  flock(lockFD, LOCK_UN);
  close(lockFD);
  return result ? runtimeURL : nil;
}

static BOOL CreatePrivateDirectory(NSString *path, NSString **failure) {
  NSError *error = nil;
  if (![NSFileManager.defaultManager createDirectoryAtPath:path
                                withIntermediateDirectories:YES
                                                 attributes:@{NSFilePosixPermissions: @0700}
                                                      error:&error]) {
    if (failure) *failure = error.localizedDescription;
    return NO;
  }
  if (chmod(path.fileSystemRepresentation, 0700) != 0) {
    if (failure) *failure = [NSString stringWithUTF8String:strerror(errno)];
    return NO;
  }
  return YES;
}

static BOOL LinkSharedCodexPath(NSString *sourcePath,
                                NSString *destinationPath,
                                BOOL expectDirectory,
                                NSString **failure) {
  NSFileManager *fileManager = NSFileManager.defaultManager;
  BOOL sourceIsDirectory = NO;
  BOOL sourceExists = [fileManager fileExistsAtPath:sourcePath
                                        isDirectory:&sourceIsDirectory];
  if (!sourceExists) {
    if (expectDirectory) {
      NSError *createError = nil;
      if (![fileManager createDirectoryAtPath:sourcePath
                  withIntermediateDirectories:YES
                                   attributes:@{NSFilePosixPermissions: @0700}
                                        error:&createError]) {
        if (failure) *failure = [NSString stringWithFormat:
          @"The shared Codex path %@ could not be created.\n\n%@",
          sourcePath, createError.localizedDescription];
        return NO;
      }
      sourceIsDirectory = YES;
    } else {
      return YES;
    }
  }
  if (sourceIsDirectory != expectDirectory) {
    if (failure) *failure = [NSString stringWithFormat:
      @"The shared Codex path %@ has the wrong type.", sourcePath];
    return NO;
  }

  NSError *destError = nil;
  NSDictionary<NSURLResourceKey, id> *destValues =
    [[NSURL fileURLWithPath:destinationPath]
      resourceValuesForKeys:@[NSURLIsSymbolicLinkKey, NSURLIsDirectoryKey]
                      error:&destError];
  NSNumber *isSymlink = destValues[NSURLIsSymbolicLinkKey];
  if (isSymlink.boolValue) {
    NSString *resolved = destinationPath.stringByResolvingSymlinksInPath;
    if ([resolved isEqualToString:sourcePath.stringByResolvingSymlinksInPath]) {
      return YES;
    }
    NSError *removeError = nil;
    if (![fileManager removeItemAtPath:destinationPath error:&removeError]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The stale Codex symlink %@ could not be replaced.\n\n%@",
        destinationPath, removeError.localizedDescription];
      return NO;
    }
  } else if ([fileManager fileExistsAtPath:destinationPath]) {
    // Merge any desktop-only session files into the shared CLI home once,
    // then replace the private copy with a symlink so both stay in sync.
    if (expectDirectory) {
      NSDirectoryEnumerator *enumerator =
        [fileManager enumeratorAtPath:destinationPath];
      for (NSString *relative in enumerator) {
        NSString *fromPath = [destinationPath stringByAppendingPathComponent:relative];
        NSString *toPath = [sourcePath stringByAppendingPathComponent:relative];
        BOOL fromIsDirectory = NO;
        if (![fileManager fileExistsAtPath:fromPath isDirectory:&fromIsDirectory] ||
            fromIsDirectory) {
          continue;
        }
        if ([fileManager fileExistsAtPath:toPath]) continue;
        NSString *toParent = toPath.stringByDeletingLastPathComponent;
        NSError *parentError = nil;
        if (![fileManager createDirectoryAtPath:toParent
                    withIntermediateDirectories:YES
                                     attributes:nil
                                          error:&parentError]) {
          if (failure) *failure = [NSString stringWithFormat:
            @"Could not prepare shared Codex session path.\n\n%@",
            parentError.localizedDescription];
          return NO;
        }
        NSError *copyError = nil;
        if (![fileManager copyItemAtPath:fromPath toPath:toPath error:&copyError]) {
          if (failure) *failure = [NSString stringWithFormat:
            @"Could not merge desktop session into ~/.codex.\n\n%@",
            copyError.localizedDescription];
          return NO;
        }
      }
    }
    NSString *backupPath = [destinationPath stringByAppendingString:@".pre-cli-sync"];
    if ([fileManager fileExistsAtPath:backupPath]) {
      NSError *removeBackupError = nil;
      if (![fileManager removeItemAtPath:backupPath error:&removeBackupError]) {
        if (failure) *failure = [NSString stringWithFormat:
          @"Could not clear the previous Codex sync backup.\n\n%@",
          removeBackupError.localizedDescription];
        return NO;
      }
    }
    NSError *moveError = nil;
    if (![fileManager moveItemAtPath:destinationPath
                              toPath:backupPath
                               error:&moveError]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"Could not back up the private Codex path before CLI sync.\n\n%@",
        moveError.localizedDescription];
      return NO;
    }
  }

  NSError *linkError = nil;
  if (![fileManager createSymbolicLinkAtPath:destinationPath
                         withDestinationPath:sourcePath
                                       error:&linkError]) {
    if (failure) *failure = [NSString stringWithFormat:
      @"Could not link %@ to the Codex CLI home.\n\n%@",
      destinationPath.lastPathComponent, linkError.localizedDescription];
    return NO;
  }
  return YES;
}

static BOOL SeedPrivateCodexHome(NSString *codexHomePath, NSString **failure) {
  NSFileManager *fileManager = NSFileManager.defaultManager;
  NSString *sourceHome = [NSHomeDirectory() stringByAppendingPathComponent:@".codex"];

  // Carry the existing account and user configuration into the isolated home
  // once. Runtime databases stay private so the desktop app and CLI can keep
  // independent SQLite writers, while conversation rollouts are shared below.
  for (NSString *name in @[@"auth.json", @"config.toml"]) {
    NSString *sourcePath = [sourceHome stringByAppendingPathComponent:name];
    NSString *destinationPath = [codexHomePath stringByAppendingPathComponent:name];
    if ([fileManager fileExistsAtPath:destinationPath]) continue;

    BOOL isDirectory = NO;
    if (![fileManager fileExistsAtPath:sourcePath isDirectory:&isDirectory] || isDirectory) {
      continue;
    }

    NSError *readError = nil;
    NSData *contents = [NSData dataWithContentsOfFile:sourcePath
                                              options:0
                                                error:&readError];
    if (!contents) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The existing Codex %@ could not be read.\n\n%@",
        name, readError.localizedDescription];
      return NO;
    }

    NSError *writeError = nil;
    if (![contents writeToFile:destinationPath
                       options:NSDataWritingAtomic
                         error:&writeError]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The private Codex %@ could not be created.\n\n%@",
        name, writeError.localizedDescription];
      return NO;
    }
    if (chmod(destinationPath.fileSystemRepresentation, 0600) != 0) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The private Codex %@ permissions could not be secured.\n\n%s",
        name, strerror(errno)];
      return NO;
    }
  }

  // Keep desktop Codex threads and `codex` CLI sessions on the same rollout
  // files under ~/.codex without sharing mutable SQLite databases.
  if (!LinkSharedCodexPath([sourceHome stringByAppendingPathComponent:@"sessions"],
                           [codexHomePath stringByAppendingPathComponent:@"sessions"],
                           YES,
                           failure)) {
    return NO;
  }
  if (!LinkSharedCodexPath([sourceHome stringByAppendingPathComponent:@"archived_sessions"],
                           [codexHomePath stringByAppendingPathComponent:@"archived_sessions"],
                           YES,
                           failure)) {
    return NO;
  }
  if (!LinkSharedCodexPath([sourceHome stringByAppendingPathComponent:@"session_index.jsonl"],
                           [codexHomePath stringByAppendingPathComponent:@"session_index.jsonl"],
                           NO,
                           failure)) {
    return NO;
  }
  return YES;
}

static BOOL LaunchRuntime(NSArray<NSString *> *forwardedArguments, NSString **failure) {
  @autoreleasepool {
    NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
    NSString *profilePath = [supportPath stringByAppendingPathComponent:@"Profile"];
    NSString *codexHomePath = [supportPath stringByAppendingPathComponent:kCodexHomeName];
    NSURL *supportURL = [NSURL fileURLWithPath:supportPath isDirectory:YES];
    NSURL *runtimeURL = [supportURL URLByAppendingPathComponent:kRuntimeName isDirectory:YES];
    NSURL *legacyRuntimeURL = [supportURL URLByAppendingPathComponent:kLegacyRuntimeName
                                                           isDirectory:YES];
    NSURL *payloadURL = [NSBundle.mainBundle.bundleURL
      URLByAppendingPathComponent:[@"Contents/Resources" stringByAppendingPathComponent:kPayloadName]
      isDirectory:YES];

    NSString *detail = nil;
    if (!CreatePrivateDirectory(supportPath, &detail)) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The private Codex data directory could not be created.\n\n%@", detail];
      return NO;
    }
    if (!CreatePrivateDirectory(profilePath, &detail)) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The isolated Codex profile could not be created.\n\n%@", detail];
      return NO;
    }
    if (!CreatePrivateDirectory(codexHomePath, &detail)) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The isolated Codex home could not be created.\n\n%@", detail];
      return NO;
    }
    if (!SeedPrivateCodexHome(codexHomePath, &detail)) {
      if (failure) *failure = detail;
      return NO;
    }
    runtimeURL = EnsureRuntime(runtimeURL, legacyRuntimeURL, payloadURL, supportURL, &detail);
    if (!runtimeURL) {
      if (failure) *failure = detail;
      return NO;
    }

    NSURL *runtimeExecutableURL = RuntimeExecutableURL(runtimeURL);
    NSString *runtimePath = runtimeExecutableURL.path;
    if (![NSFileManager.defaultManager isExecutableFileAtPath:runtimePath]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The installed Codex runtime is not executable.\n\n%@", runtimePath];
      return NO;
    }

    setenv("CODEX_ELECTRON_USER_DATA_PATH", profilePath.fileSystemRepresentation, 1);
    setenv("CODEX_HOME", codexHomePath.fileSystemRepresentation, 1);

    NSMutableArray<NSString *> *arguments = [NSMutableArray arrayWithObjects:
      runtimePath,
      [@"--user-data-dir=" stringByAppendingString:profilePath],
      nil];
    [arguments addObjectsFromArray:forwardedArguments];

    char **childArgv = calloc(arguments.count + 1, sizeof(char *));
    if (!childArgv) {
      if (failure) *failure = @"Codex ran out of memory while preparing to launch.";
      return NO;
    }

    BOOL allocationFailed = NO;
    for (NSUInteger index = 0; index < arguments.count; index++) {
      childArgv[index] = strdup(arguments[index].UTF8String);
      if (!childArgv[index]) {
        allocationFailed = YES;
        for (NSUInteger cleanup = 0; cleanup < index; cleanup++) free(childArgv[cleanup]);
        free(childArgv);
        break;
      }
    }
    if (allocationFailed) {
      if (failure) *failure = @"Codex ran out of memory while preparing to launch.";
      return NO;
    }

    pid_t childPid = 0;
    int spawnResult = posix_spawn(&childPid, runtimePath.fileSystemRepresentation,
                                  NULL, NULL, childArgv, environ);
    for (NSUInteger index = 0; index < arguments.count; index++) free(childArgv[index]);
    free(childArgv);

    if (spawnResult != 0) {
      NSString *detail = [NSString stringWithUTF8String:strerror(spawnResult)];
      if (failure) *failure = [NSString stringWithFormat:
        @"The Codex runtime failed to launch.\n\n%@", detail];
      return NO;
    }
    return YES;
  }
}

static void ActivateRuntimeApplication(NSUInteger attempt) {
  NSArray<NSRunningApplication *> *applications =
    [NSRunningApplication runningApplicationsWithBundleIdentifier:kRuntimeBundleIdentifier];
  for (NSRunningApplication *application in applications) {
    if (application.terminated) continue;
    [application activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    return;
  }

  // Electron needs a short interval to register its application bundle after
  // posix_spawn returns; keep the wrapper from leaving another app's menu bar
  // active during that handoff.
  if (attempt < 20) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      ActivateRuntimeApplication(attempt + 1);
    });
  }
}

@interface CodexLauncherDelegate : NSObject <NSApplicationDelegate>

- (instancetype)initWithCommandLineArguments:(NSArray<NSString *> *)arguments;
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event
           withReplyEvent:(NSAppleEventDescriptor *)replyEvent;

@end

@implementation CodexLauncherDelegate {
  NSArray<NSString *> *_commandLineArguments;
  NSMutableOrderedSet<NSString *> *_pendingURLs;
  BOOL _didPerformInitialLaunch;
}

- (instancetype)initWithCommandLineArguments:(NSArray<NSString *> *)arguments {
  self = [super init];
  if (self) {
    _commandLineArguments = [arguments copy];
    _pendingURLs = [[NSMutableOrderedSet alloc] init];
  }
  return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  (void)notification;

  // Migrate machines that ran an older build where the private runtime briefly
  // owned this scheme. The launcher is the only safe entry point because it
  // establishes the isolated profile before Electron's singleton lock.
  ClaimLauncherURLScheme();

  // The Electron runtime now hosts the integrated ✦ Enhancements submenu directly
  // inside the native ChatGPT/Codex menu bar status item.
  // InstallEnhancementStatusItem();

  if (gShowSettingsOnLaunch) [self showSettingsAction:nil];
  if (gCaptureHubOnLaunch) CaptureHubWindow();

  // GURL is normally delivered before didFinishLaunching. One short run-loop
  // grace period also covers LaunchServices versions that enqueue it immediately
  // afterward, without adding noticeable latency to an ordinary app launch.
  [self performSelector:@selector(performInitialLaunch)
             withObject:nil
             afterDelay:0.10];
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  (void)notification;
  StopEnhancements();
  [[NSAppleEventManager sharedAppleEventManager]
    removeEventHandlerForEventClass:kCodexInternetEventClass
                          andEventID:kCodexGetURLEvent];
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)application
                     hasVisibleWindows:(BOOL)hasVisibleWindows {
  (void)application;
  (void)hasVisibleWindows;

  if (_didPerformInitialLaunch) [self launchWithArguments:@[]];
  return NO;
}

- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event
           withReplyEvent:(NSAppleEventDescriptor *)replyEvent {
  (void)replyEvent;

  NSString *urlString = [[event paramDescriptorForKeyword:kCodexDirectObject] stringValue];
  if (urlString.length == 0) return;

  NSURLComponents *components = [NSURLComponents componentsWithString:urlString];
  NSString *scheme = components.scheme;
  if (scheme.length == 0 ||
      [scheme caseInsensitiveCompare:kLauncherURLScheme] != NSOrderedSame) return;

  if ([urlString containsString:@"analytics"] || [urlString containsString:@"usage"]) {
    ShowEnhancementAnalytics();
    return;
  }

  if ([components.host caseInsensitiveCompare:@"enhancement"] == NSOrderedSame) {
    NSString *identifier = nil;
    NSString *view = nil;
    for (NSURLQueryItem *item in components.queryItems) {
      if ([item.name isEqualToString:@"id"]) identifier = item.value;
      if ([item.name isEqualToString:@"view"]) view = item.value;
    }
    if (identifier.length > 0) {
      if (view.length == 0) {
        for (NSDictionary *enhancement in LoadEnhancementManifest()) {
          if ([enhancement[@"id"] isEqualToString:identifier]) {
            view = EnhancementViewOptions(enhancement).firstObject;
            break;
          }
        }
      }
      OpenEnhancement(identifier, view ?: @"launch");
      return;
    }
  }

  if ([urlString containsString:@"settings"] || [urlString containsString:@"hub"] || [urlString containsString:@"enhancements"]) {
    [self showSettingsAction:nil];
    return;
  }

  if (!_didPerformInitialLaunch) {
    [_pendingURLs addObject:urlString];
    return;
  }

  // The launcher deliberately stays alive as a hidden LSUIElement. A warm GURL
  // therefore creates another runtime process with the same isolated profile;
  // Electron forwards its argv to the already-running Codex instance.
  [self launchWithArguments:@[urlString]];
}

- (void)performInitialLaunch {
  if (_didPerformInitialLaunch) return;
  _didPerformInitialLaunch = YES;

  NSMutableArray<NSString *> *arguments = [_commandLineArguments mutableCopy];
  [arguments addObjectsFromArray:_pendingURLs.array];
  [_pendingURLs removeAllObjects];
  [self launchWithArguments:arguments];
}

- (void)launchWithArguments:(NSArray<NSString *> *)arguments {
  StartEnhancements();
  NSString *failure = nil;
  if (!LaunchRuntime(arguments, &failure)) {
    ShowLaunchError(failure ? failure : @"The Codex runtime could not be launched.");
    return;
  }
  ActivateRuntimeApplication(0);
}

// ─── Enhancement menu/settings actions ─────────────────────────

- (void)openCodexAppAction:(id)sender {
  (void)sender;
  [self launchWithArguments:@[]];
  NSRunningApplication *app = [NSRunningApplication runningApplicationsWithBundleIdentifier:kRuntimeBundleIdentifier].firstObject;
  if (app) {
    [app activateWithOptions:NSApplicationActivateIgnoringOtherApps];
  }
}

- (void)newChatAction:(id)sender {
  (void)sender;
  [self launchWithArguments:@[@"codex-rebuild://chat/new"]];
  NSRunningApplication *app = [NSRunningApplication runningApplicationsWithBundleIdentifier:kRuntimeBundleIdentifier].firstObject;
  if (app) {
    [app activateWithOptions:NSApplicationActivateIgnoringOtherApps];
  }
}

- (void)openEnhancementAction:(NSMenuItem *)sender {
  NSArray<NSString *> *payload = sender.representedObject;
  if (payload.count == 2) OpenEnhancement(payload[0], payload[1]);
}

- (void)showSettingsAction:(id)sender {
  (void)sender;
  ShowEnhancementSettings();
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    SanitizeEnvironment();

    signal(SIGTERM, HandleTerminationSignal);
    signal(SIGINT, HandleTerminationSignal);
    signal(SIGHUP, HandleTerminationSignal);

    NSMutableArray<NSString *> *arguments = [NSMutableArray array];
    for (int index = 1; index < argc; index++) {
      NSString *argument = [NSString stringWithUTF8String:argv[index]];
      if (!argument) continue;
      if ([argument isEqualToString:@"--show-settings"]) {
        gShowSettingsOnLaunch = YES;
        continue;
      }
      if ([argument isEqualToString:@"--capture-hub"]) {
        gShowSettingsOnLaunch = YES;
        gCaptureHubOnLaunch = YES;
        continue;
      }
      if ([argument hasPrefix:@"-psn_"]) continue;
      [arguments addObject:argument];
    }

    NSApplication *application = [NSApplication sharedApplication];
    [application setActivationPolicy:NSApplicationActivationPolicyAccessory];

    static CodexLauncherDelegate *launcherDelegate = nil;
    launcherDelegate = [[CodexLauncherDelegate alloc]
      initWithCommandLineArguments:arguments];
    gAppDelegate = launcherDelegate;
    application.delegate = launcherDelegate;

    // Register before entering NSApplication's run loop so a cold-launch GURL
    // cannot be consumed by AppKit before the launcher has installed a handler.
    [[NSAppleEventManager sharedAppleEventManager]
      setEventHandler:launcherDelegate
           andSelector:@selector(handleGetURLEvent:withReplyEvent:)
         forEventClass:kCodexInternetEventClass
            andEventID:kCodexGetURLEvent];

    [application run];
    return 0;
  }
}
