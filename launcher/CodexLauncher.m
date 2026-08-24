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
#import <sys/wait.h>
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
// A freshly installed, re-signed OpenCodex bundle can spend close to a minute
// in macOS first-run verification. Keep startup fail-closed, but allow enough
// time for that legitimate cold path before declaring the route broken.
static const NSUInteger kRequiredServiceStartupAttempts = 480;

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
  if (diagnostic) *diagnostic = ConciseToolOutput(output);
  return task.terminationStatus == 0;
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
static int gLauncherLockFD = -1;
static pid_t gPrimaryRuntimePID = 0;
static dispatch_source_t gPrimaryRuntimeExitSource = nil;

static __strong NSStatusItem *gEnhancementStatusItem = nil;
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
  // Keep this valid for the launcher lifetime even if a future build loses
  // ARC flags: the manifest is read once, then used from later run-loop turns.
  NSArray<NSDictionary *> *enhancements = [manifest[@"enhancements"] isKindOfClass:[NSArray class]]
    ? manifest[@"enhancements"]
    : @[];
  gLoadedEnhancements = [enhancements copy];
  return gLoadedEnhancements;
}

static NSDictionary *EnhancementDefaults(void) {
  NSDictionary *stored = [[NSUserDefaults standardUserDefaults] dictionaryForKey:kEnabledDefaultsKey];
  return stored ? stored : @{};
}

static BOOL EnhancementEnabled(NSString *identifier) {
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    if ([enhancement[@"id"] isEqualToString:identifier] &&
        [enhancement[@"required"] boolValue]) return YES;
  }
  NSNumber *value = EnhancementDefaults()[identifier];
  return value ? value.boolValue : YES;
}

static void SetEnhancementEnabled(NSString *identifier, BOOL enabled) {
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    if ([enhancement[@"id"] isEqualToString:identifier] &&
        [enhancement[@"required"] boolValue]) return;
  }
  NSMutableDictionary *stored = [EnhancementDefaults() mutableCopy];
  if (!stored) stored = [NSMutableDictionary dictionary];
  stored[identifier] = @(enabled);
  [[NSUserDefaults standardUserDefaults] setObject:stored forKey:kEnabledDefaultsKey];
}

static __attribute__((unused)) NSString *EnhancementView(NSString *identifier) {
  return [[NSUserDefaults standardUserDefaults] dictionaryForKey:kViewDefaultsKey][identifier];
}

static __attribute__((unused)) void SetEnhancementView(NSString *identifier, NSString *view) {
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

static __attribute__((unused)) NSString *EnhancementViewLabel(NSString *view) {
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
static BOOL AcquireLauncherLock(void);

static BOOL IsWrapperManagedRoutingLine(NSString *line, NSString *supportPath) {
  NSString *trimmed = [line stringByTrimmingCharactersInSet:
    NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if ([trimmed hasPrefix:@"#"] || trimmed.length == 0) return NO;
  if ([trimmed hasPrefix:@"openai_base_url"] &&
      ([trimmed containsString:@"127.0.0.1:10100"] ||
       [trimmed containsString:@"localhost:10100"])) {
    return YES;
  }
  return [trimmed hasPrefix:@"model_catalog_json"] &&
    [trimmed containsString:supportPath];
}

// The wrapper may have been run by an older build that injected OpenCodex
// routing into the private desktop config. Remove only values owned by this
// product, preserving the user's other TOML settings and never touching
// ~/.codex/config.toml.
static BOOL NormalizePrivateCodexConfig(NSString *configPath, NSString *supportPath) {
  NSData *data = [NSData dataWithContentsOfFile:configPath];
  if (!data) return YES;
  NSString *contents = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (!contents) return NO;
  NSMutableArray<NSString *> *kept = [NSMutableArray array];
  __block BOOL changed = NO;
  [contents enumerateLinesUsingBlock:^(NSString *line, BOOL *stop) {
    (void)stop;
    if (IsWrapperManagedRoutingLine(line, supportPath)) {
      changed = YES;
      return;
    }
    [kept addObject:line];
  }];
  if (!changed) return YES;
  NSString *normalized = [[kept componentsJoinedByString:@"\n"] stringByAppendingString:@"\n"];
  if (![normalized writeToFile:configPath atomically:YES encoding:NSUTF8StringEncoding error:nil]) {
    return NO;
  }
  chmod(configPath.fileSystemRepresentation, 0600);
  return YES;
}

static NSString *EscapeTOMLBasicString(NSString *value) {
  NSString *escaped = [value stringByReplacingOccurrencesOfString:@"\\"
                                                           withString:@"\\\\"];
  return [escaped stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
}

// The embedded Codex runtime reads this private config, while the native
// ChatGPT app continues to use ~/.codex/config.toml. Keeping the route here
// makes the model selector consume the same catalog that OpenCodex serves.
static BOOL ConfigurePrivateRuntimeRouting(NSString *configPath, NSString *supportPath) {
  NSData *data = [NSData dataWithContentsOfFile:configPath];
  NSString *contents = data.length > 0
    ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]
    : @"model = \"gpt-5.6-sol\"\n";
  if (!contents) return NO;

  NSMutableArray<NSString *> *kept = [NSMutableArray array];
  [contents enumerateLinesUsingBlock:^(NSString *line, BOOL *stop) {
    (void)stop;
    if (!IsWrapperManagedRoutingLine(line, supportPath)) [kept addObject:line];
  }];

  NSString *catalogPath = [supportPath stringByAppendingPathComponent:
    @"OpenCodexHome/opencodex-catalog.json"];

  NSArray<NSString *> *routingLines = @[
    @"openai_base_url = \"http://127.0.0.1:10100/v1\"",
    [NSString stringWithFormat:
      @"model_catalog_json = \"%@\"", EscapeTOMLBasicString(catalogPath)]
  ];
  NSUInteger firstTableIndex = NSNotFound;
  for (NSUInteger index = 0; index < kept.count; index++) {
    NSString *trimmed = [kept[index] stringByTrimmingCharactersInSet:
      NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if ([trimmed hasPrefix:@"["]) {
      firstTableIndex = index;
      break;
    }
  }
  if (firstTableIndex == NSNotFound) {
    [kept addObjectsFromArray:routingLines];
  } else {
    [kept insertObjects:routingLines
              atIndexes:[NSIndexSet indexSetWithIndexesInRange:
                NSMakeRange(firstTableIndex, routingLines.count)]];
  }

  NSString *configured = [[kept componentsJoinedByString:@"\n"]
    stringByAppendingString:@"\n"];
  if (![configured writeToFile:configPath atomically:YES
                       encoding:NSUTF8StringEncoding error:nil]) return NO;
  chmod(configPath.fileSystemRepresentation, 0600);
  return YES;
}

// The Codex model picker reads CODEX_HOME/models_cache.json directly. The
// OpenCodex service owns the fresh catalog, so copy that cache into the
// isolated runtime home on every launch. Routing config alone is not enough:
// it can make requests reach OpenCodex while leaving the picker with the
// seven-model native cache.
static BOOL PrivateRuntimeModelCacheReady(NSString *supportPath) {
  NSString *sourcePath = [supportPath stringByAppendingPathComponent:
    @"OpenCodexHome/models_cache.json"];
  NSData *sourceData = [NSData dataWithContentsOfFile:sourcePath];
  if (sourceData.length == 0) return NO;
  id parsed = [NSJSONSerialization JSONObjectWithData:sourceData options:0 error:nil];
  return [parsed isKindOfClass:[NSDictionary class]] &&
    [parsed[@"models"] isKindOfClass:[NSArray class]] &&
    [parsed[@"models"] count] > 0;
}

static BOOL SynchronizePrivateRuntimeModelCache(NSString *supportPath,
                                                NSString *codexHomePath) {
  NSString *sourcePath = [supportPath stringByAppendingPathComponent:
    @"OpenCodexHome/models_cache.json"];
  NSData *sourceData = [NSData dataWithContentsOfFile:sourcePath];
  if (sourceData.length == 0) {
    // OpenCodex may still be warming its first catalog. Keep the existing
    // private cache intact and let the next app launch retry the sync.
    NSLog(@"[CodexLauncher] OpenCodex model cache is not ready at %@", sourcePath);
    return NO;
  }

  NSError *parseError = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:sourceData
                                               options:0
                                                 error:&parseError];
  if (![parsed isKindOfClass:[NSDictionary class]] ||
      ![parsed[@"models"] isKindOfClass:[NSArray class]] ||
      [parsed[@"models"] count] == 0) {
    NSLog(@"[CodexLauncher] Ignoring invalid OpenCodex model cache %@: %@",
          sourcePath, parseError.localizedDescription ?: @"missing models array");
    return NO;
  }

  NSString *destinationPath = [codexHomePath stringByAppendingPathComponent:
    @"models_cache.json"];
  if (![sourceData writeToFile:destinationPath atomically:YES]) {
    NSLog(@"[CodexLauncher] Could not synchronize private model cache to %@",
          destinationPath);
    return NO;
  }
  chmod(destinationPath.fileSystemRepresentation, 0600);
  NSLog(@"[CodexLauncher] Synchronized %lu models into %@",
        (unsigned long)[parsed[@"models"] count], destinationPath);
  return YES;
}

static void RemoveChatGPTWebModelsFromCatalog(NSString *path) {
  NSData *data = [NSData dataWithContentsOfFile:path];
  if (data.length == 0) return;
  id parsed = [NSJSONSerialization JSONObjectWithData:data
                                               options:NSJSONReadingMutableContainers
                                                 error:nil];
  if (![parsed isKindOfClass:[NSDictionary class]]) return;
  NSMutableDictionary *document = [parsed mutableCopy];
  NSArray *models = document[@"models"];
  if (![models isKindOfClass:[NSArray class]]) return;
  NSMutableArray *kept = [NSMutableArray array];
  for (NSDictionary *model in models) {
    NSString *slug = [model[@"slug"] isKindOfClass:[NSString class]] ? model[@"slug"] : nil;
    if (![slug hasPrefix:@"codex-chatgpt-web/"]) [kept addObject:model];
  }
  if (kept.count == models.count) return;
  document[@"models"] = kept;
  NSData *output = [NSJSONSerialization dataWithJSONObject:document
                                                   options:NSJSONWritingPrettyPrinted
                                                     error:nil];
  if (output.length > 0 && [output writeToFile:path atomically:YES]) {
    chmod(path.fileSystemRepresentation, 0600);
  }
}

static void RemoveChatGPTWebModels(NSString *supportPath) {
  for (NSString *relativePath in @[
    @"OpenCodexHome/opencodex-catalog.json",
    @"OpenCodexHome/models_cache.json",
    @"CodexHome/models_cache.json"
  ]) {
    RemoveChatGPTWebModelsFromCatalog(
      [supportPath stringByAppendingPathComponent:relativePath]);
  }
}

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
  if ([homeName isEqualToString:kCodexHomeName]) {
    NormalizePrivateCodexConfig(configPath, supportPath);
  }
  return homePath;
}

// OpenCodex normally reads ~/.opencodex/config.json. The side-by-side app must
// keep its routing state isolated from the user's native Codex and from the
// launchd-owned ChatGPT Web bridge, so give it an app-private copy. This
// provider is intentionally configured only in OpenCodexHome; the native
// ChatGPT app never sees these provider-prefixed model ids.
static NSString *PrepareOpenCodexHome(NSString *supportPath) {
  NSString *homePath = [supportPath stringByAppendingPathComponent:@"OpenCodexHome"];
  CreatePrivateDirectory(homePath, nil);
  NSString *destinationPath = [homePath stringByAppendingPathComponent:@"config.json"];
  NSString *sourcePath = [NSHomeDirectory() stringByAppendingPathComponent:@".opencodex/config.json"];
  NSData *sourceData = [NSData dataWithContentsOfFile:sourcePath];
  NSData *destinationData = [NSData dataWithContentsOfFile:destinationPath];
  NSMutableDictionary *config = nil;
  NSData *candidateData = destinationData.length > 0 ? destinationData : sourceData;
  if (candidateData.length > 0) {
    id parsed = [NSJSONSerialization JSONObjectWithData:candidateData options:NSJSONReadingMutableContainers error:nil];
    if ([parsed isKindOfClass:[NSDictionary class]]) config = [parsed mutableCopy];
  }
  if (!config) config = [NSMutableDictionary dictionary];

  NSMutableDictionary *providers = [config[@"providers"] isKindOfClass:[NSDictionary class]]
    ? [config[@"providers"] mutableCopy] : [NSMutableDictionary dictionary];
  providers[@"codex-chatgpt-web"] = @{
    // codex-chatgpt-web implements the Responses API only. The chat adapter
    // appends /chat/completions and guarantees a 404 from this bridge.
    @"adapter": @"openai-responses",
    @"baseUrl": @"http://127.0.0.1:17841/v1",
    @"authMode": @"forward",
    @"allowPrivateNetwork": @YES,
    @"models": @[
      @"chatgpt-web/light",
      @"chatgpt-web/medium",
      @"chatgpt-web/high"
    ],
    @"liveModels": @NO
  };
  config[@"providers"] = providers;
  if (![config[@"defaultProvider"] isKindOfClass:[NSString class]] ||
      [config[@"defaultProvider"] isEqualToString:@"openai"]) {
    config[@"defaultProvider"] = @"codex-chatgpt-web";
  }
  if (![config[@"port"] isKindOfClass:[NSNumber class]]) config[@"port"] = @10100;

  NSData *output = [NSJSONSerialization dataWithJSONObject:config options:NSJSONWritingPrettyPrinted error:nil];
  if (output.length > 0) {
    [output writeToFile:destinationPath atomically:YES];
    chmod(destinationPath.fileSystemRepresentation, 0600);
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

  // Keep one visible section label while leaving the actual services at the
  // first menu level. This avoids the old stack of nested enhancement menus
  // without making the feature set look like unrelated menu items.
  NSMenuItem *section = [[NSMenuItem alloc] initWithTitle:@"✦ Enhancements"
                                                    action:nil
                                             keyEquivalent:@""];
  section.enabled = NO;
  [menu addItem:section];
  NSUInteger visibleEnhancementCount = 0;
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    NSDictionary *ui = enhancement[@"ui"];
    if (!ui) continue;
    if (!EnhancementEnabled(enhancement[@"id"])) continue;
    NSString *identifier = enhancement[@"id"];
    NSString *kind = ui[@"kind"];
    visibleEnhancementCount++;
    if ([kind isEqualToString:@"web"]) {
      NSString *title = ui[@"openLabel"];
      if ([identifier isEqualToString:@"opencodex"]) {
        title = @"Open OpenCodex Dashboard";
      } else if ([identifier isEqualToString:@"codex-chatgpt-web"]) {
        title = @"Open ChatGPT Web Dashboard";
      }
      NSMenuItem *item = MenuItemWithSymbol(title,
                                            @selector(openEnhancementAction:),
                                            EnhancementSymbol(enhancement));
      item.representedObject = @[identifier, @"window"];
      [menu addItem:item];
    } else {
      NSString *title = ui[@"openLabel"];
      if (!title) title = ui[@"label"];
      NSMenuItem *item = MenuItemWithSymbol(title,
                                            @selector(openEnhancementAction:),
                                             EnhancementSymbol(enhancement));
      NSString *view = EnhancementViewOptions(enhancement).firstObject;
      item.representedObject = @[identifier, view];
      [menu addItem:item];
    }
  }
  if (visibleEnhancementCount == 0) {
    NSMenuItem *empty = [[NSMenuItem alloc] initWithTitle:@"No enhancements available"
                                                    action:nil
                                             keyEquivalent:@""];
    empty.enabled = NO;
    [menu addItem:empty];
  }

  // Keep the sign-in action beside the dashboard action. Users should never
  // have to open a second submenu to connect the ChatGPT Web bridge.
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    if (![enhancement[@"id"] isEqualToString:@"codex-chatgpt-web"] ||
        !EnhancementEnabled(enhancement[@"id"]) ||
        ![enhancement[@"connectCommand"] isKindOfClass:[NSArray class]]) continue;
    NSMenuItem *connect = MenuItemWithSymbol(@"Connect ChatGPT Web",
                                              @selector(openEnhancementAction:),
                                              @"person.crop.circle.badge.checkmark");
    connect.representedObject = @[ @"codex-chatgpt-web", @"connect" ];
    [menu addItem:connect];
    break;
  }

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

static __attribute__((unused)) void InstallEnhancementStatusItem(void) {
  if (gEnhancementStatusItem) return;
  gEnhancementStatusItem = [[NSStatusBar systemStatusBar]
    statusItemWithLength:NSVariableStatusItemLength];
  if (!gEnhancementStatusItem) return;
  // Match the ChatGPT mark used by the surrounding app. The tooltip
  // distinguishes this service menu from the official app's own quit menu.
  NSImage *icon = ChatGPTTemplateImage();
  if (icon) {
    gEnhancementStatusItem.button.image = icon;
    gEnhancementStatusItem.button.imageScaling = NSImageScaleProportionallyDown;
    // The official ChatGPT app can be running beside this wrapper and owns a
    // nearly identical status icon. Keep the familiar mark, but label this
    // item so users cannot accidentally open ChatGPT's "Quit ChatGPT" menu.
    gEnhancementStatusItem.button.title = @" Codex";
    gEnhancementStatusItem.button.imagePosition = NSImageLeft;
  } else {
    gEnhancementStatusItem.button.title = @"Codex";
  }
  gEnhancementStatusItem.button.toolTip = @"Codex — OpenCodex + ChatGPT Web";
  gEnhancementStatusItem.visible = YES;
  RebuildEnhancementMenu();
}

static void ShowEnhancementSettings(void) {
  // The SwiftUI command center (launcher/EnhancementHub.swift) owns the
  // settings window; it shares this process, bundle, and defaults domain.
  ShowEnhancementHub();
}

// ─── Enhancement lifecycle ──────────────────────────────────────

static BOOL gEnhancementsStarted = NO;
static BOOL gEnhancementsStopping = NO;
static NSMutableArray<NSTask *> *gEnhancementTasks = nil;
static NSMutableArray<NSTask *> *gEnhancementOneShotTasks = nil;
static NSMutableDictionary<NSString *, NSTask *> *gEnhancementTasksByID = nil;
static NSMutableDictionary<NSString *, NSNumber *> *gEnhancementRestartAttempts = nil;
static NSMutableDictionary<NSString *, NSNumber *> *gAdoptedEnhancementPIDs = nil;
static NSMutableArray<NSTask *> *gConnectionTasks = nil;
static BOOL gEnhancementPreflightRequired = NO;
static BOOL gEnhancementPreflightComplete = YES;

// Async-signal-safe PID tracking so a raw SIGTERM/SIGINT/SIGHUP (AppKit only
// delivers applicationWillTerminate: on ordinary quit paths) still stops every
// enhancement instead of orphaning it.
static pid_t gEnhancementPids[32];
static int gEnhancementPidCount = 0;

static void TrackEnhancementPid(pid_t pid) {
  if (pid <= 0 || gEnhancementPidCount >= 32) return;
  gEnhancementPids[gEnhancementPidCount++] = pid;
}

static void UntrackEnhancementPid(pid_t pid) {
  if (pid <= 0) return;
  for (int index = 0; index < gEnhancementPidCount; index++) {
    if (gEnhancementPids[index] != pid) continue;
    for (int move = index + 1; move < gEnhancementPidCount; move++) {
      gEnhancementPids[move - 1] = gEnhancementPids[move];
    }
    gEnhancementPidCount--;
    return;
  }
}

static void HandleTerminationSignal(int signalNumber) {
  for (int index = 0; index < gEnhancementPidCount; index++) {
    kill(gEnhancementPids[index], SIGTERM);
  }
  _exit(128 + signalNumber);
}

static void CompleteEnhancementPreflight(BOOL success) {
  gEnhancementPreflightComplete = YES;
  if (!success) {
    NSLog(@"[CodexLauncher] OpenCodex preflight failed; launching with the isolated baseline config");
  }
  if (!gEnhancementsStopping && gAppDelegate) {
    [(id)gAppDelegate performSelector:@selector(performInitialLaunch)];
  }
}

static NSString *EnhancementPIDPath(NSString *identifier) {
  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  return [[supportPath stringByAppendingPathComponent:@"enhancements"]
    stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.pid", identifier]];
}

static void RemoveEnhancementPID(NSString *identifier) {
  if (identifier.length == 0) return;
  [[NSFileManager defaultManager] removeItemAtPath:EnhancementPIDPath(identifier) error:nil];
}

// Forward declaration (defined later in this file).
static BOOL CreatePrivateDirectory(NSString *path, NSString **failure);
static void TerminateProcessTreeByPID(pid_t rootPID);
static NSArray<NSNumber *> *DescendantProcessIDs(pid_t rootPID);
static BOOL ProcessTreeContainsPID(pid_t rootPID, pid_t candidatePID);

static void RotateEnhancementLog(NSString *identifier, NSString *suffix) {
  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *directory = [supportPath stringByAppendingPathComponent:@"enhancements"];
  CreatePrivateDirectory(directory, nil);
  NSString *name = suffix.length > 0
    ? [NSString stringWithFormat:@"%@-%@.log", identifier, suffix]
    : [NSString stringWithFormat:@"%@.log", identifier];
  NSString *path = [directory stringByAppendingPathComponent:name];
  NSString *previous = [path stringByAppendingString:@".previous"];
  NSFileManager *manager = NSFileManager.defaultManager;
  [manager removeItemAtPath:previous error:nil];
  if ([manager fileExistsAtPath:path]) {
    [manager moveItemAtPath:path toPath:previous error:nil];
  }
  [manager createFileAtPath:path contents:nil attributes:@{NSFilePosixPermissions: @0600}];
}

static BOOL EnhancementAlreadyHealthy(NSDictionary *enhancement) {
  NSString *identifier = enhancement[@"id"];
  NSNumber *port = enhancement[@"config"][@"port"];
  NSString *healthPath = enhancement[@"healthPath"];
  if (![port isKindOfClass:[NSNumber class]] ||
      ![healthPath isKindOfClass:[NSString class]] || healthPath.length == 0 ||
      identifier.length == 0) {
    return NO;
  }
  NSData *pidData = [NSData dataWithContentsOfFile:EnhancementPIDPath(identifier)];
  NSString *pidString = [[NSString alloc] initWithData:pidData encoding:NSUTF8StringEncoding];
  pid_t pid = (pid_t)pidString.intValue;
  if (pid <= 0 || kill(pid, 0) != 0) {
    RemoveEnhancementPID(identifier);
    return NO;
  }
  NSArray<NSString *> *command = enhancement[@"startCommand"];
  NSString *expectedBinary = command.count > 0
    ? ResolveEnhancementBinary(EnhancementDirectory(enhancement), command[0]) : nil;
  NSString *processCommand = nil;
  if (expectedBinary.length == 0 ||
      !RunTool(@"/bin/ps", @[@"-p", [NSString stringWithFormat:@"%d", pid],
                              @"-o", @"command="], &processCommand) ||
      ![processCommand containsString:expectedBinary]) {
    NSLog(@"[CodexLauncher] refusing to adopt %@ pid %d because its executable does not match %@",
          identifier, pid, expectedBinary ?: @"the bundled service");
    RemoveEnhancementPID(identifier);
    return NO;
  }
  NSString *url = [NSString stringWithFormat:@"http://127.0.0.1:%@%@", port, healthPath];
  NSString *healthOutput = nil;
  if (!RunTool(@"/usr/bin/curl", @[@"-fsS", @"--max-time", @"2", url], &healthOutput)) {
    TerminateProcessTreeByPID(pid);
    RemoveEnhancementPID(identifier);
    return NO;
  }
  NSData *healthData = [healthOutput dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *health = healthData.length > 0
    ? [NSJSONSerialization JSONObjectWithData:healthData options:0 error:nil] : nil;
  BOOL identityMatches = NO;
  if ([identifier isEqualToString:@"opencodex"]) {
    identityMatches = [health[@"status"] isEqualToString:@"ok"] &&
      [health[@"service"] isEqualToString:@"opencodex"];
  } else if ([identifier isEqualToString:@"codex-chatgpt-web"]) {
    identityMatches = [health[@"status"] isEqualToString:@"ok"] &&
      [health[@"service"] isEqualToString:@"codex-chatgpt-web-dashboard"];
  }
  pid_t healthPID = (pid_t)[health[@"pid"] intValue];
  identityMatches = identityMatches && ProcessTreeContainsPID(pid, healthPID);
  if (!identityMatches) {
    TerminateProcessTreeByPID(pid);
    RemoveEnhancementPID(identifier);
    return NO;
  }
  if (!gAdoptedEnhancementPIDs) gAdoptedEnhancementPIDs = [[NSMutableDictionary alloc] init];
  gAdoptedEnhancementPIDs[identifier] = @(pid);
  TrackEnhancementPid(pid);
  return YES;
}

// Forward declaration (defined later in this file)
static BOOL CreatePrivateDirectory(NSString *path, NSString **failure);
static BOOL RuntimeIsRunning(void);

static BOOL LaunchEnhancementCommand(NSDictionary *enhancement,
                                     NSArray<NSString *> *command,
                                     NSString *logSuffix,
                                     BOOL supervise) {
  if (![command isKindOfClass:[NSArray class]] || command.count == 0) return NO;
  NSString *identifier = enhancement[@"id"];
  if (supervise && logSuffix.length == 0 && EnhancementAlreadyHealthy(enhancement)) {
    NSLog(@"[CodexLauncher] enhancement %@ is already healthy; reusing the existing service", identifier);
    return YES;
  }
  NSString *enhDir = EnhancementDirectory(enhancement);
  NSString *binaryPath = ResolveEnhancementBinary(enhDir, command[0]);
  if (!binaryPath || ![[NSFileManager defaultManager] isExecutableFileAtPath:binaryPath]) {
    NSLog(@"[CodexLauncher] enhancement %@ binary not executable at %@", identifier, command[0]);
    return NO;
  }

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *logDirectory = [supportPath stringByAppendingPathComponent:@"enhancements"];
  CreatePrivateDirectory(logDirectory, nil);
  NSString *suffix = logSuffix.length > 0 ? [NSString stringWithFormat:@"-%@", logSuffix] : @"";
  NSString *logPath = [logDirectory stringByAppendingPathComponent:
    [NSString stringWithFormat:@"%@%@.log", identifier, suffix]];
  if (![[NSFileManager defaultManager] fileExistsAtPath:logPath]) {
    [[NSFileManager defaultManager] createFileAtPath:logPath contents:nil attributes:nil];
  }
  NSFileHandle *logHandle = [NSFileHandle fileHandleForWritingAtPath:logPath];
  if (!logHandle) {
    NSLog(@"[CodexLauncher] cannot open log file for enhancement %@", identifier);
    return NO;
  }
  [logHandle seekToEndOfFile];

  NSTask *task = [[NSTask alloc] init];
  task.launchPath = binaryPath;
  task.arguments = [command subarrayWithRange:NSMakeRange(1, command.count - 1)];
  task.currentDirectoryURL = [NSURL fileURLWithPath:enhDir isDirectory:YES];
  NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
  environment[@"CODEX_HOME"] = EnhancementCodexHome(enhancement, supportPath);
  if ([identifier isEqualToString:@"opencodex"]) {
    environment[@"OPENCODEX_HOME"] = PrepareOpenCodexHome(supportPath);
  } else if ([identifier isEqualToString:@"codex-chatgpt-web"]) {
    // The bridge reads the account owned by this side-by-side Codex runtime.
    // Browser/session state remains in a separate bridge home. Never copy the
    // official ~/.codex OAuth file: duplicated refresh tokens can invalidate
    // either application while both are running.
    environment[@"CODEX_HOME"] =
      [supportPath stringByAppendingPathComponent:kCodexHomeName];
    environment[@"CODEX_CHATGPT_WEB_HOME"] = EnhancementCodexHome(enhancement, supportPath);
    environment[@"CODEX_CHATGPT_WEB_PORT"] = @"17841";
  }
  environment[@"CODEX_ELECTRON_USER_DATA_PATH"] =
    [supportPath stringByAppendingPathComponent:@"Profile"];
  task.environment = environment;
  task.standardOutput = logHandle;
  task.standardError = logHandle;

  @try {
    [task launch];
  } @catch (NSException *exception) {
    NSLog(@"[CodexLauncher] failed to start enhancement %@: %@", identifier, exception.reason);
    return NO;
  }
  if (!supervise) {
    if (!gEnhancementOneShotTasks) gEnhancementOneShotTasks = [[NSMutableArray alloc] init];
    [gEnhancementOneShotTasks addObject:task];
    TrackEnhancementPid(task.processIdentifier);
    BOOL isPreflight = [logSuffix isEqualToString:@"preflight"];
    BOOL refreshAfterToggle = [logSuffix isEqualToString:@"toggle-refresh"];
    [task setTerminationHandler:^(NSTask *finishedTask) {
      dispatch_async(dispatch_get_main_queue(), ^{
        UntrackEnhancementPid(finishedTask.processIdentifier);
        [gEnhancementOneShotTasks removeObject:finishedTask];
        if (isPreflight) CompleteEnhancementPreflight(finishedTask.terminationStatus == 0);
        if (refreshAfterToggle && finishedTask.terminationStatus == 0 && RuntimeIsRunning()) {
          [(id)gAppDelegate performSelector:@selector(restartRuntimeForModelRefresh)];
        }
      });
    }];
    NSLog(@"[CodexLauncher] enhancement %@ %@ command launched (pid %d)",
          identifier, isPreflight ? @"preflight" : @"post-start", task.processIdentifier);
    return YES;
  }

  if (!gEnhancementTasks) gEnhancementTasks = [[NSMutableArray alloc] init];
  if (!gEnhancementTasksByID) gEnhancementTasksByID = [[NSMutableDictionary alloc] init];
  [gEnhancementTasks addObject:task];
  gEnhancementTasksByID[identifier] = task;
  TrackEnhancementPid(task.processIdentifier);
  NSString *pidString = [NSString stringWithFormat:@"%d\n", task.processIdentifier];
  [pidString writeToFile:EnhancementPIDPath(identifier)
              atomically:YES
                encoding:NSUTF8StringEncoding
                   error:nil];
  chmod(EnhancementPIDPath(identifier).fileSystemRepresentation, 0600);

  NSDictionary *enhancementCopy = [enhancement copy];
  task.terminationHandler = ^(NSTask *finishedTask) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [gEnhancementTasks removeObject:finishedTask];
      UntrackEnhancementPid(finishedTask.processIdentifier);
      RemoveEnhancementPID(identifier);
      if (gEnhancementTasksByID[identifier] == finishedTask) {
        [gEnhancementTasksByID removeObjectForKey:identifier];
      }
      if (gEnhancementsStopping || !gEnhancementsStarted || !EnhancementEnabled(identifier)) return;
      NSInteger attempt = gEnhancementRestartAttempts[identifier].integerValue + 1;
      gEnhancementRestartAttempts[identifier] = @(attempt);
      if (attempt > 5) {
        NSLog(@"[CodexLauncher] enhancement %@ stopped after 5 failed restart attempts; relaunch Codex to retry",
              identifier);
        return;
      }
      NSTimeInterval delay = 2.0;
      for (NSInteger retry = 1; retry < attempt && delay < 30.0; retry++) delay *= 2.0;
      if (delay > 30.0) delay = 30.0;
      NSLog(@"[CodexLauncher] enhancement %@ exited (%d); retrying in %.0f seconds",
            identifier, finishedTask.terminationStatus, delay);
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        if (!gEnhancementsStopping && gEnhancementsStarted &&
            !gEnhancementTasksByID[identifier]) {
          LaunchEnhancementCommand(enhancementCopy, enhancementCopy[@"startCommand"], @"", YES);
        }
      });
    });
  };
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(60.0 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    if (task.isRunning && gEnhancementTasksByID[identifier] == task) {
      gEnhancementRestartAttempts[identifier] = @0;
    }
  });
  NSLog(@"[CodexLauncher] enhancement %@ started (pid %d)", identifier, task.processIdentifier);
  return YES;
}

static BOOL StartEnhancements(void) {
  if (gEnhancementsStarted) return YES;
  gEnhancementsStarted = YES;
  gEnhancementsStopping = NO;
  gEnhancementPreflightRequired = NO;
  gEnhancementPreflightComplete = YES;
  if (!gEnhancementRestartAttempts) gEnhancementRestartAttempts = [[NSMutableDictionary alloc] init];
  [gEnhancementRestartAttempts removeAllObjects];
  if (!gAdoptedEnhancementPIDs) gAdoptedEnhancementPIDs = [[NSMutableDictionary alloc] init];

  NSURL *manifestURL = [NSBundle.mainBundle.bundleURL
    URLByAppendingPathComponent:@"Contents/Resources/enhancements/manifest.json"];
  NSData *manifestData = [NSData dataWithContentsOfURL:manifestURL];
  NSDictionary *manifest = manifestData
    ? [NSJSONSerialization JSONObjectWithData:manifestData options:0 error:nil] : nil;
  NSArray<NSDictionary *> *enhancements = manifest[@"enhancements"];
  if (![enhancements isKindOfClass:[NSArray class]]) {
    NSLog(@"[CodexLauncher] enhancements manifest is missing or invalid");
    return YES;
  }
  for (NSDictionary *enhancement in enhancements) {
    NSString *identifier = enhancement[@"id"];
    NSArray<NSString *> *startCommand = enhancement[@"startCommand"];
    if (![identifier isKindOfClass:[NSString class]] ||
        ![startCommand isKindOfClass:[NSArray class]] || startCommand.count == 0) continue;
    if (!EnhancementEnabled(identifier)) continue;
    RotateEnhancementLog(identifier, @"");
    RotateEnhancementLog(identifier, @"preflight");
    RotateEnhancementLog(identifier, @"connect");
    LaunchEnhancementCommand(enhancement, startCommand, @"", YES);

    NSArray<NSString *> *postStartCommand = enhancement[@"postStartCommand"];
    if ([postStartCommand isKindOfClass:[NSArray class]] && postStartCommand.count > 0) {
      gEnhancementPreflightRequired = YES;
      gEnhancementPreflightComplete = NO;
      NSDictionary *copy = [enhancement copy];
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        if (!gEnhancementsStopping && gEnhancementsStarted) {
          if (!LaunchEnhancementCommand(copy, postStartCommand, @"preflight", NO)) {
            CompleteEnhancementPreflight(NO);
          }
        }
      });
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
  BOOL dashboardManagedConnection = [id isEqualToString:@"codex-chatgpt-web"];
  NSString *binary = dashboardManagedConnection
    ? @"/usr/bin/curl" : ResolveEnhancementBinary(enhDir, connectCommand[0]);
  NSArray<NSString *> *connectionArguments = dashboardManagedConnection
    ? @[@"-fsS", @"--max-time", @"5", @"-X", @"POST",
        @"http://127.0.0.1:17842/api/connect"]
    : [connectCommand subarrayWithRange:NSMakeRange(1, connectCommand.count - 1)];
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
  task.arguments = connectionArguments;
  task.currentDirectoryURL = [NSURL fileURLWithPath:enhDir isDirectory:YES];
  NSMutableDictionary *environment = [NSProcessInfo.processInfo.environment mutableCopy];
  environment[@"CODEX_HOME"] = EnhancementCodexHome(enhancement, supportPath);
  if ([id isEqualToString:@"codex-chatgpt-web"]) {
    environment[@"CODEX_HOME"] =
      [supportPath stringByAppendingPathComponent:kCodexHomeName];
    environment[@"CODEX_CHATGPT_WEB_HOME"] = EnhancementCodexHome(enhancement, supportPath);
    environment[@"CODEX_CHATGPT_WEB_PORT"] = @"17841";
  }
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

static NSArray<NSNumber *> *DescendantProcessIDs(pid_t rootPID) {
  if (rootPID <= 0) return @[];
  NSTask *processList = [[NSTask alloc] init];
  processList.launchPath = @"/bin/ps";
  processList.arguments = @[@"-axo", @"pid=,ppid="];
  NSPipe *pipe = [NSPipe pipe];
  processList.standardOutput = pipe;
  processList.standardError = [NSFileHandle fileHandleWithNullDevice];
  @try {
    [processList launch];
  } @catch (NSException *exception) {
    NSLog(@"[CodexLauncher] could not inspect enhancement process tree: %@", exception.reason);
    return @[];
  }
  NSData *data = [pipe.fileHandleForReading readDataToEndOfFile];
  [processList waitUntilExit];
  NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (!output) return @[];

  NSMutableDictionary<NSNumber *, NSMutableArray<NSNumber *> *> *children =
    [NSMutableDictionary dictionary];
  for (NSString *line in [output componentsSeparatedByString:@"\n"]) {
    NSArray<NSString *> *parts = [line componentsSeparatedByCharactersInSet:
      NSCharacterSet.whitespaceCharacterSet];
    NSMutableArray<NSString *> *fields = [NSMutableArray array];
    for (NSString *part in parts) if (part.length > 0) [fields addObject:part];
    if (fields.count < 2) continue;
    pid_t pid = (pid_t)fields[0].intValue;
    pid_t parent = (pid_t)fields[1].intValue;
    if (pid <= 0 || parent <= 0) continue;
    NSNumber *parentNumber = @(parent);
    if (!children[parentNumber]) children[parentNumber] = [NSMutableArray array];
    [children[parentNumber] addObject:@(pid)];
  }

  NSMutableArray<NSNumber *> *queue = [NSMutableArray arrayWithObject:@(rootPID)];
  NSMutableSet<NSNumber *> *seen = [NSMutableSet setWithObject:@(rootPID)];
  NSMutableArray<NSNumber *> *descendants = [NSMutableArray array];
  while (queue.count > 0) {
    NSNumber *parent = queue.firstObject;
    [queue removeObjectAtIndex:0];
    for (NSNumber *child in children[parent]) {
      if ([seen containsObject:child]) continue;
      [seen addObject:child];
      [descendants addObject:child];
      [queue addObject:child];
    }
  }
  return descendants;
}

static BOOL ProcessTreeContainsPID(pid_t rootPID, pid_t candidatePID) {
  if (rootPID <= 0 || candidatePID <= 0) return NO;
  if (rootPID == candidatePID) return YES;
  for (NSNumber *descendant in DescendantProcessIDs(rootPID)) {
    if (descendant.intValue == candidatePID) return YES;
  }
  return NO;
}

static void TerminateProcessTree(NSTask *task) {
  if (!task || task.processIdentifier <= 0) return;
  NSArray<NSNumber *> *descendants = DescendantProcessIDs(task.processIdentifier);
  for (NSNumber *pid in descendants) kill(pid.intValue, SIGTERM);
  if (task.isRunning) [task terminate];

  NSTimeInterval deadline = [NSDate timeIntervalSinceReferenceDate] + 3.0;
  while (task.isRunning && [NSDate timeIntervalSinceReferenceDate] < deadline) {
    usleep(50000); // 50ms
  }
  if (task.isRunning) {
    kill(task.processIdentifier, SIGKILL);
    NSLog(@"[CodexLauncher] force-killed enhancement pid %d", task.processIdentifier);
  }
  for (NSNumber *pid in descendants) kill(pid.intValue, SIGKILL);
}

static void TerminateProcessTreeByPID(pid_t rootPID) {
  if (rootPID <= 0 || kill(rootPID, 0) != 0) return;
  NSArray<NSNumber *> *descendants = DescendantProcessIDs(rootPID);
  for (NSNumber *pid in descendants) kill(pid.intValue, SIGTERM);
  kill(rootPID, SIGTERM);
  NSTimeInterval deadline = [NSDate timeIntervalSinceReferenceDate] + 3.0;
  while (kill(rootPID, 0) == 0 && [NSDate timeIntervalSinceReferenceDate] < deadline) {
    usleep(50000);
  }
  if (kill(rootPID, 0) == 0) kill(rootPID, SIGKILL);
  for (NSNumber *pid in descendants) kill(pid.intValue, SIGKILL);
}

static void StopEnhancements(void) {
  gEnhancementsStopping = YES;
  gEnhancementsStarted = NO;
  NSMutableArray<NSTask *> *tasks = [NSMutableArray array];
  if (gEnhancementTasks) [tasks addObjectsFromArray:gEnhancementTasks];
  if (gEnhancementOneShotTasks) [tasks addObjectsFromArray:gEnhancementOneShotTasks];
  for (NSTask *task in tasks) {
    TerminateProcessTree(task);
  }
  for (NSNumber *pid in gAdoptedEnhancementPIDs.allValues) {
    TerminateProcessTreeByPID(pid.intValue);
    UntrackEnhancementPid(pid.intValue);
  }
  [gAdoptedEnhancementPIDs removeAllObjects];
  NSLog(@"[CodexLauncher] stopped %lu enhancements", (unsigned long)tasks.count);
  [gEnhancementTasks removeAllObjects];
  [gEnhancementOneShotTasks removeAllObjects];
  [gEnhancementTasksByID removeAllObjects];
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    RemoveEnhancementPID(enhancement[@"id"]);
  }
  for (NSTask *task in [gConnectionTasks copy]) TerminateProcessTree(task);
  [gConnectionTasks removeAllObjects];
  gEnhancementPidCount = 0;
}

static BOOL RequiredEnhancementsHealthy(NSString **failure) {
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    if (![enhancement[@"required"] boolValue]) continue;
    NSNumber *port = enhancement[@"config"][@"port"];
    NSString *healthPath = enhancement[@"healthPath"];
    NSString *label = enhancement[@"ui"][@"label"] ?: enhancement[@"id"];
    if (![port isKindOfClass:[NSNumber class]] || healthPath.length == 0) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The required service %@ has no valid health endpoint.", label];
      return NO;
    }
    NSString *identifier = enhancement[@"id"];
    NSTask *ownedTask = gEnhancementTasksByID[identifier];
    pid_t ownedPID = ownedTask.isRunning
      ? ownedTask.processIdentifier : (pid_t)[gAdoptedEnhancementPIDs[identifier] intValue];
    if (ownedPID <= 0 || kill(ownedPID, 0) != 0) {
      if (failure) *failure = [NSString stringWithFormat:
        @"%@ could not be started. Another process may be using port %@. Quit other Codex test builds and try again.",
        label, port];
      return NO;
    }
    NSString *url = [NSString stringWithFormat:@"http://127.0.0.1:%@%@", port, healthPath];
    NSString *output = nil;
    if (!RunTool(@"/usr/bin/curl", @[@"-fsS", @"--max-time", @"2", url], &output)) {
      if (failure) *failure = [NSString stringWithFormat:
        @"%@ did not become ready at %@. Codex was not opened because every model request depends on this local route.\n\n%@",
        label, url, output ?: @"No service response was received."];
      return NO;
    }
    NSData *data = [output dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *health = data.length > 0
      ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![health[@"status"] isEqualToString:@"ok"]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"%@ returned an invalid health response. Codex was not opened with a broken model route.", label];
      return NO;
    }
    pid_t healthPID = (pid_t)[health[@"pid"] intValue];
    if (!ProcessTreeContainsPID(ownedPID, healthPID)) {
      if (failure) *failure = [NSString stringWithFormat:
        @"%@ is responding from an unrelated process on port %@. Codex was not opened with an ambiguous model route.",
        label, port];
      return NO;
    }
  }
  return YES;
}

// Called directly by the SwiftUI settings panel. Optional services are
// applied immediately; required services ignore disable requests so the UI
// cannot persist a configuration that makes every Codex request fail.
void SetEnhancementRuntimeEnabled(const char *identifierCString, int enabledValue) {
  if (!identifierCString) return;
  NSString *identifier = [NSString stringWithUTF8String:identifierCString];
  if (identifier.length == 0) return;
  BOOL enabled = enabledValue != 0;
  NSDictionary *target = nil;
  for (NSDictionary *enhancement in LoadEnhancementManifest()) {
    if ([enhancement[@"id"] isEqualToString:identifier]) {
      target = enhancement;
      break;
    }
  }
  if (!target || ([target[@"required"] boolValue] && !enabled)) return;

  SetEnhancementEnabled(identifier, enabled);
  RebuildEnhancementMenu();
  if (!gEnhancementsStarted || ![target[@"type"] isEqualToString:@"service"]) return;

  if (enabled) {
    if (!gEnhancementTasksByID[identifier] && !gAdoptedEnhancementPIDs[identifier]) {
      gEnhancementRestartAttempts[identifier] = @0;
      LaunchEnhancementCommand(target, target[@"startCommand"], @"", YES);
    }
    if ([identifier isEqualToString:@"codex-chatgpt-web"]) {
      for (NSDictionary *enhancement in LoadEnhancementManifest()) {
        NSArray *postStart = enhancement[@"postStartCommand"];
        if (![enhancement[@"id"] isEqualToString:@"opencodex"] || postStart.count == 0) continue;
        NSDictionary *refreshTarget = [enhancement copy];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
          if (EnhancementEnabled(identifier)) {
            LaunchEnhancementCommand(refreshTarget, postStart, @"toggle-refresh", NO);
          }
        });
        break;
      }
    }
    return;
  }

  NSTask *task = gEnhancementTasksByID[identifier];
  if (task) TerminateProcessTree(task);
  NSNumber *adoptedPID = gAdoptedEnhancementPIDs[identifier];
  if (adoptedPID) {
    TerminateProcessTreeByPID(adoptedPID.intValue);
    UntrackEnhancementPid(adoptedPID.intValue);
    [gAdoptedEnhancementPIDs removeObjectForKey:identifier];
  }
  RemoveEnhancementPID(identifier);
  if ([identifier isEqualToString:@"codex-chatgpt-web"]) {
    for (NSTask *connectionTask in [gConnectionTasks copy]) {
      TerminateProcessTree(connectionTask);
    }
    NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
    RemoveChatGPTWebModels(supportPath);
    if (RuntimeIsRunning()) {
      [(id)gAppDelegate performSelector:@selector(restartRuntimeForModelRefresh)];
    }
  }
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

static BOOL AcquireLauncherLock(void) {
  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  if (!CreatePrivateDirectory(supportPath, nil)) return NO;
  NSString *lockPath = [supportPath stringByAppendingPathComponent:@"launcher.lock"];
  // The embedded Electron runtime must not inherit this descriptor. If it did,
  // quitting the launcher left the singleton lock held by the child and every
  // subsequent app launch incorrectly exited as "already running".
  gLauncherLockFD = open(lockPath.fileSystemRepresentation,
                         O_CREAT | O_RDWR | O_CLOEXEC,
                         0600);
  if (gLauncherLockFD < 0) return NO;
  if (flock(gLauncherLockFD, LOCK_EX | LOCK_NB) != 0) {
    close(gLauncherLockFD);
    gLauncherLockFD = -1;
    return NO;
  }
  return YES;
}

static __attribute__((unused)) BOOL LinkSharedCodexPath(NSString *sourcePath,
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

static BOOL IsolatePrivateCodexPath(NSString *sourcePath,
                                    NSString *destinationPath,
                                    BOOL expectDirectory,
                                    NSString **failure) {
  NSFileManager *fileManager = NSFileManager.defaultManager;
  BOOL sourceIsDirectory = NO;
  BOOL sourceExists = [fileManager fileExistsAtPath:sourcePath
                                        isDirectory:&sourceIsDirectory];
  if (sourceExists && sourceIsDirectory != expectDirectory) {
    if (failure) *failure = [NSString stringWithFormat:
      @"The source Codex path %@ has the wrong type.", sourcePath];
    return NO;
  }

  // Older builds linked the private runtime's sessions into ~/.codex. Detach
  // only that private symlink before copying a snapshot, leaving the native
  // ChatGPT app and CLI completely independent from this runtime's writers.
  NSDictionary *attributes = [fileManager attributesOfItemAtPath:destinationPath error:nil];
  if ([attributes[NSFileType] isEqualToString:NSFileTypeSymbolicLink]) {
    NSError *removeError = nil;
    if (![fileManager removeItemAtPath:destinationPath error:&removeError]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The stale private Codex link %@ could not be removed.\n\n%@",
        destinationPath, removeError.localizedDescription];
      return NO;
    }
    attributes = nil;
  }

  if (attributes) {
    BOOL destinationIsDirectory = NO;
    if (![fileManager fileExistsAtPath:destinationPath isDirectory:&destinationIsDirectory] ||
        destinationIsDirectory != expectDirectory) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The private Codex path %@ has the wrong type.", destinationPath];
      return NO;
    }
    return YES;
  }

  if (!sourceExists) {
    if (expectDirectory && ![fileManager createDirectoryAtPath:destinationPath
                                       withIntermediateDirectories:YES
                                                        attributes:@{NSFilePosixPermissions: @0700}
                                                             error:nil]) {
      if (failure) *failure = [NSString stringWithFormat:
        @"The private Codex directory %@ could not be created.", destinationPath];
      return NO;
    }
    return YES;
  }

  NSError *copyError = nil;
  if (![fileManager copyItemAtPath:sourcePath toPath:destinationPath error:&copyError]) {
    if (failure) *failure = [NSString stringWithFormat:
      @"The private Codex path %@ could not be initialized.\n\n%@",
      destinationPath, copyError.localizedDescription];
    return NO;
  }
  if (expectDirectory) chmod(destinationPath.fileSystemRepresentation, 0700);
  else chmod(destinationPath.fileSystemRepresentation, 0600);
  return YES;
}

static BOOL SeedPrivateCodexHome(NSString *codexHomePath, NSString **failure) {
  NSFileManager *fileManager = NSFileManager.defaultManager;
  NSString *sourceHome = [NSHomeDirectory() stringByAppendingPathComponent:@".codex"];

  // Seed user preferences once, but never duplicate OAuth credentials. The
  // side-by-side runtime owns an independent login so refresh-token rotation
  // cannot sign the official Codex app out (or vice versa).
  for (NSString *name in @[@"config.toml"]) {
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

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *privateConfigPath = [codexHomePath stringByAppendingPathComponent:@"config.toml"];
  if (!NormalizePrivateCodexConfig(privateConfigPath, supportPath)) {
    if (failure) *failure = @"The private Codex config could not be normalized safely.";
    return NO;
  }
  if (!ConfigurePrivateRuntimeRouting(privateConfigPath, supportPath)) {
    if (failure) *failure = @"The private Codex model catalog route could not be configured safely.";
    return NO;
  }
  // The OpenCodex post-start sync can finish just after the runtime launch
  // gate. The delegate waits for a ready source cache; this non-fatal retry
  // keeps a slow first sync from preventing Codex from opening.
  SynchronizePrivateRuntimeModelCache(supportPath, codexHomePath);

  // Keep this runtime fully independent from the native ChatGPT app. The
  // previous symlink strategy made two app-servers write the same rollout
  // files and was a common source of corruption and lockups.
  if (!IsolatePrivateCodexPath([sourceHome stringByAppendingPathComponent:@"sessions"],
                               [codexHomePath stringByAppendingPathComponent:@"sessions"],
                               YES,
                               failure)) {
    return NO;
  }
  if (!IsolatePrivateCodexPath([sourceHome stringByAppendingPathComponent:@"archived_sessions"],
                               [codexHomePath stringByAppendingPathComponent:@"archived_sessions"],
                               YES,
                               failure)) {
    return NO;
  }
  if (!IsolatePrivateCodexPath([sourceHome stringByAppendingPathComponent:@"session_index.jsonl"],
                               [codexHomePath stringByAppendingPathComponent:@"session_index.jsonl"],
                               NO,
                               failure)) {
    return NO;
  }
  return YES;
}

static void MonitorPrimaryRuntime(pid_t pid) {
  if (pid <= 0) return;
  dispatch_source_t source = dispatch_source_create(
    DISPATCH_SOURCE_TYPE_PROC, (uintptr_t)pid, DISPATCH_PROC_EXIT,
    dispatch_get_main_queue());
  if (!source) return;
  gPrimaryRuntimePID = pid;
  gPrimaryRuntimeExitSource = source;
  dispatch_source_set_event_handler(source, ^{
    int status = 0;
    waitpid(pid, &status, WNOHANG);
    if (gPrimaryRuntimePID != pid) return;
    gPrimaryRuntimePID = 0;
    gPrimaryRuntimeExitSource = nil;
    if (gAppDelegate) [(id)gAppDelegate performSelector:@selector(runtimeProcessDidExit)];
  });
  dispatch_resume(source);
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
      // The private, re-signed runtime must not prompt for the official
      // ChatGPT keychain item on every rebuild. Its profile is already
      // isolated under CodexDesktop-Rebuild, so use Chromium's local store
      // for runtime-only secrets and keep startup non-interactive.
      @"--password-store=basic",
      @"--use-mock-keychain",
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

    BOOL shouldMonitorAsPrimary = !RuntimeIsRunning();
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
    if (shouldMonitorAsPrimary) MonitorPrimaryRuntime(childPid);
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
  NSUInteger _preflightWaitAttempts;
  NSUInteger _modelCacheWaitAttempts;
  NSUInteger _requiredServiceWaitAttempts;
  BOOL _modelRefreshRestartPending;
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

  // This hidden process is the lifetime owner/supervisor for the runtime and
  // local services. It must remain alive even while no native window is open.
  [NSProcessInfo.processInfo disableAutomaticTermination:
    @"Codex supervises its private runtime and local model services"];
  [NSProcessInfo.processInfo disableSuddenTermination];
  [NSWorkspace.sharedWorkspace.notificationCenter
    addObserver:self
       selector:@selector(workspaceApplicationDidTerminate:)
           name:NSWorkspaceDidTerminateApplicationNotification
         object:nil];

  // Migrate machines that ran an older build where the private runtime briefly
  // owned this scheme. The launcher is the only safe entry point because it
  // establishes the isolated profile before Electron's singleton lock.
  ClaimLauncherURLScheme();

  // The embedded Codex runtime owns the visible tray item. Its upstream
  // Electron menu is patched to include the enhancements, while the native
  // launcher menu remains available only as a fallback for older builds.
  // Start the service layer immediately. It must not depend on the Electron
  // window successfully launching, and each service is supervised independently.
  StartEnhancements();

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
  [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self];
  [[NSAppleEventManager sharedAppleEventManager]
    removeEventHandlerForEventClass:kCodexInternetEventClass
                          andEventID:kCodexGetURLEvent];
}

- (void)workspaceApplicationDidTerminate:(NSNotification *)notification {
  NSRunningApplication *application = notification.userInfo[NSWorkspaceApplicationKey];
  if (![application.bundleIdentifier isEqualToString:kRuntimeBundleIdentifier]) return;
  [self runtimeProcessDidExit];
}

- (void)runtimeProcessDidExit {
  // A catalog refresh intentionally replaces only the private runtime. Every
  // other runtime exit is a real app quit/crash, so tear down the supervisor
  // and both local services instead of leaving background processes behind.
  if (_modelRefreshRestartPending || !_didPerformInitialLaunch) return;
  [NSApp terminate:nil];
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)application
                     hasVisibleWindows:(BOOL)hasVisibleWindows {
  (void)application;
  (void)hasVisibleWindows;

  if (_didPerformInitialLaunch) {
    [self launchWithArguments:@[]];
  } else {
    StartEnhancements();
    [self performInitialLaunch];
  }
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

  if ([components.host caseInsensitiveCompare:@"refresh-models"] == NSOrderedSame) {
    [self restartRuntimeForModelRefresh];
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
  if (gEnhancementPreflightRequired && !gEnhancementPreflightComplete) {
    if (_preflightWaitAttempts++ < 80) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        [self performInitialLaunch];
      });
      return;
    }
    NSLog(@"[CodexLauncher] enhancement preflight timed out; starting Codex without waiting for OpenCodex");
    gEnhancementPreflightComplete = YES;
  }

  NSString *requiredFailure = nil;
  if (!RequiredEnhancementsHealthy(&requiredFailure)) {
    if (_requiredServiceWaitAttempts++ < kRequiredServiceStartupAttempts) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        [self performInitialLaunch];
      });
      return;
    }
    // Do not leave late-starting children orphaned if the bounded startup
    // deadline is genuinely exceeded. A menu/reopen action can start a fresh,
    // fully supervised attempt.
    StopEnhancements();
    _requiredServiceWaitAttempts = 0;
    ShowLaunchError(requiredFailure ?: @"A required enhancement service did not become ready.");
    return;
  }

  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *codexHomePath = [supportPath stringByAppendingPathComponent:kCodexHomeName];
  if (gEnhancementPreflightRequired &&
      !PrivateRuntimeModelCacheReady(supportPath) &&
      _modelCacheWaitAttempts++ < 80) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      [self performInitialLaunch];
    });
    return;
  }
  if (gEnhancementPreflightRequired &&
      !SynchronizePrivateRuntimeModelCache(supportPath, codexHomePath)) {
    NSLog(@"[CodexLauncher] model cache was not ready before the startup deadline; using the last private cache");
  }
  _didPerformInitialLaunch = YES;

  NSMutableArray<NSString *> *arguments = [_commandLineArguments mutableCopy];
  [arguments addObjectsFromArray:_pendingURLs.array];
  [_pendingURLs removeAllObjects];
  [self launchWithArguments:arguments];
}

- (void)launchWithArguments:(NSArray<NSString *> *)arguments {
  StartEnhancements();
  NSString *failure = nil;
  if (!RequiredEnhancementsHealthy(&failure)) {
    ShowLaunchError(failure ?: @"A required enhancement service is unavailable.");
    return;
  }
  if (!LaunchRuntime(arguments, &failure)) {
    ShowLaunchError(failure ? failure : @"The Codex runtime could not be launched.");
    return;
  }
  ActivateRuntimeApplication(0);
}

- (void)restartRuntimeForModelRefresh {
  if (_modelRefreshRestartPending) return;
  _modelRefreshRestartPending = YES;
  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  SynchronizePrivateRuntimeModelCache(
    supportPath, [supportPath stringByAppendingPathComponent:kCodexHomeName]);
  for (NSRunningApplication *application in
       [NSRunningApplication runningApplicationsWithBundleIdentifier:kRuntimeBundleIdentifier]) {
    if (!application.terminated) [application terminate];
  }
  [self completeRuntimeModelRefreshRestart:@0];
}

- (void)completeRuntimeModelRefreshRestart:(NSNumber *)attemptNumber {
  NSUInteger attempt = attemptNumber.unsignedIntegerValue;
  if (RuntimeIsRunning()) {
    if (attempt < 24) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        [self completeRuntimeModelRefreshRestart:@(attempt + 1)];
      });
      return;
    }
    NSLog(@"[CodexLauncher] private runtime did not quit for model refresh; leaving it running");
    _modelRefreshRestartPending = NO;
    return;
  }
  _modelRefreshRestartPending = NO;
  [self launchWithArguments:@[]];
}

// ─── Enhancement menu/settings actions ─────────────────────────

- (void)openCodexAppAction:(id)sender {
  (void)sender;
  if (!_didPerformInitialLaunch) {
    StartEnhancements();
    [self performInitialLaunch];
    return;
  }
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

    // LaunchServices can start a second hidden launcher for an incoming URL.
    // Keep one owner for the service ports and forward that URL to the warm
    // instance instead of creating a second OpenCodex/bridge stack.
    if (!AcquireLauncherLock()) {
      NSURL *forwardURL = [NSURL URLWithString:@"codex-rebuild://open"];
      if (forwardURL) [[NSWorkspace sharedWorkspace] openURL:forwardURL];
      return 0;
    }

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
