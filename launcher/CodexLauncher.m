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

// Carbon four-character codes for GURL event dispatch.
static const AEEventClass kCodexInternetEventClass = (AEEventClass)0x4755524cU;
static const AEEventID kCodexGetURLEvent = (AEEventID)0x4755524cU;
static const AEKeyword kCodexDirectObject = (AEKeyword)0x2d2d2d2dU;

// Swift EnhancementManager bridge entry points
extern void EnhancementManagerStartAll(void);
extern void EnhancementManagerStopAll(void);
extern void EnhancementManagerOpen(const char *cId, const char *cView);
extern void EnhancementManagerRestartService(const char *cId);
extern void ShowEnhancementHub(void);
extern void ShowWebWindow(const char *label, const char *url);

@class CodexLauncherDelegate;
static CodexLauncherDelegate *gAppDelegate = nil;
static BOOL gShowSettingsOnLaunch = NO;
static NSStatusItem *gStatusItem = nil;

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

static void HandleTerminationSignal(int sig) {
  (void)sig;
  EnhancementManagerStopAll();
  _exit(0);
}

// ─── Native OpenAI / ChatGPT Template Image ─────────────────────

static NSImage *ChatGPTTemplateImage(void) {
  const CGFloat size = 18.0;
  const CGFloat center = size / 2.0;
  NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(size, size)];
  [image lockFocus];

  NSBezierPath *path = [[NSBezierPath alloc] init];
  path.lineWidth = 1.35;
  path.lineCapStyle = NSLineCapStyleRound;
  path.lineJoinStyle = NSLineJoinStyleRound;

  // 6-fold radial swirl of ChatGPT logo
  for (NSInteger i = 0; i < 6; i++) {
    CGFloat angle = i * (M_PI / 3.0);
    CGFloat cosA = cos(angle), sinA = sin(angle);
    CGFloat r1 = 2.2, r2 = 6.2, r3 = 7.0;

    NSPoint p0 = NSMakePoint(center + cos(angle - 0.4) * r1, center + sin(angle - 0.4) * r1);
    NSPoint p1 = NSMakePoint(center + cosA * r2, center + sinA * r2);
    NSPoint p2 = NSMakePoint(center + cos(angle + 0.6) * r3, center + sin(angle + 0.6) * r3);
    NSPoint p3 = NSMakePoint(center + cos(angle + 0.9) * 3.8, center + sin(angle + 0.9) * 3.8);

    [path moveToPoint:p0];
    [path curveToPoint:p2 controlPoint1:p1 controlPoint2:p2];
    [path lineToPoint:p3];
  }

  [[NSColor blackColor] setStroke];
  [path stroke];

  [image unlockFocus];
  image.template = YES;
  return image;
}

// ─── Status Bar & Submenu Construction ──────────────────────────

static NSMenuItem *CreateActionItem(NSString *title, SEL action, NSString *symbol, id repObj) {
  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:@""];
  item.target = gAppDelegate;
  if (symbol) {
    item.image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:title];
  }
  item.representedObject = repObj;
  return item;
}

static void RebuildStatusMenu(void) {
  NSMenu *menu = [[NSMenu alloc] init];
  menu.autoenablesItems = NO;

  // 1. Header with App Title
  NSMenuItem *header = [[NSMenuItem alloc] initWithTitle:@"Codex Desktop" action:nil keyEquivalent:@""];
  header.enabled = NO;
  header.attributedTitle = [[NSAttributedString alloc]
    initWithString:@"Codex Desktop (Oh My OpenAI)"
        attributes:@{
          NSFontAttributeName: [NSFont systemFontOfSize:12.5 weight:NSFontWeightSemibold],
          NSForegroundColorAttributeName: [NSColor labelColor]
        }];
  [menu addItem:header];
  [menu addItem:[NSMenuItem separatorItem]];

  // 2. Enhancements Parent Submenu
  NSMenuItem *enhancementsParent = [[NSMenuItem alloc] initWithTitle:@"✦ Enhancements" action:nil keyEquivalent:@""];
  enhancementsParent.image = [NSImage imageWithSystemSymbolName:@"sparkles" accessibilityDescription:@"Enhancements"];
  NSMenu *enhSubmenu = [[NSMenu alloc] init];

  // 2a. OpenCodex Gateway
  NSMenuItem *openCodexItem = [[NSMenuItem alloc] initWithTitle:@"OpenCodex Gateway (:10100)" action:nil keyEquivalent:@""];
  openCodexItem.image = [NSImage imageWithSystemSymbolName:@"network" accessibilityDescription:@"OpenCodex"];
  NSMenu *openCodexMenu = [[NSMenu alloc] init];
  [openCodexMenu addItem:CreateActionItem(@"Open Dashboard (In-App)", @selector(openEnhancementAction:), @"macwindow", @[@"opencodex", @"window"])];
  [openCodexMenu addItem:CreateActionItem(@"Open in Browser", @selector(openEnhancementAction:), @"safari", @[@"opencodex", @"browser"])];
  [openCodexMenu addItem:[NSMenuItem separatorItem]];
  [openCodexMenu addItem:CreateActionItem(@"Restart Service", @selector(restartEnhancementAction:), @"arrow.clockwise", @"opencodex")];
  openCodexItem.submenu = openCodexMenu;
  [enhSubmenu addItem:openCodexItem];

  // 2b. Usage Analyzer (ccusage)
  NSMenuItem *usageItem = [[NSMenuItem alloc] initWithTitle:@"Usage Analyzer (ccusage)" action:nil keyEquivalent:@""];
  usageItem.image = [NSImage imageWithSystemSymbolName:@"chart.bar.xaxis" accessibilityDescription:@"ccusage"];
  NSMenu *usageMenu = [[NSMenu alloc] init];
  [usageMenu addItem:CreateActionItem(@"Show Usage in Command Center", @selector(openEnhancementAction:), @"chart.pie", @[@"ccusage", @"report"])];
  [usageMenu addItem:CreateActionItem(@"Run in Terminal", @selector(openEnhancementAction:), @"terminal", @[@"ccusage", @"terminal"])];
  usageItem.submenu = usageMenu;
  [enhSubmenu addItem:usageItem];

  // 2c. ChatGPT Web Bridge
  NSMenuItem *webBridgeItem = [[NSMenuItem alloc] initWithTitle:@"ChatGPT Web Bridge" action:nil keyEquivalent:@""];
  webBridgeItem.image = [NSImage imageWithSystemSymbolName:@"bubble.left.and.bubble.right.fill" accessibilityDescription:@"Web Bridge"];
  NSMenu *bridgeMenu = [[NSMenu alloc] init];
  [bridgeMenu addItem:CreateActionItem(@"Launch Bridge Setup", @selector(openEnhancementAction:), @"play.circle", @[@"codex-chatgpt-web", @"launch"])];
  webBridgeItem.submenu = bridgeMenu;
  [enhSubmenu addItem:webBridgeItem];

  // 2d. Codex++ Manager
  NSMenuItem *codexppItem = [[NSMenuItem alloc] initWithTitle:@"Codex++ Manager" action:nil keyEquivalent:@""];
  codexppItem.image = [NSImage imageWithSystemSymbolName:@"wand.and.stars" accessibilityDescription:@"Codex++"];
  NSMenu *codexppMenu = [[NSMenu alloc] init];
  [codexppMenu addItem:CreateActionItem(@"Open Manager", @selector(openEnhancementAction:), @"slider.horizontal.3", @[@"codexpp", @"launch"])];
  codexppItem.submenu = codexppMenu;
  [enhSubmenu addItem:codexppItem];

  enhancementsParent.submenu = enhSubmenu;
  [menu addItem:enhancementsParent];

  // 3. Command Center & Settings
  [menu addItem:[NSMenuItem separatorItem]];
  NSMenuItem *cmdCenter = CreateActionItem(@"Command Center & Settings…", @selector(showSettingsAction:), @"gearshape.2", nil);
  cmdCenter.keyEquivalent = @",";
  [menu addItem:cmdCenter];

  // 4. Folder Quick Access
  NSMenuItem *foldersParent = [[NSMenuItem alloc] initWithTitle:@"Data & Logs" action:nil keyEquivalent:@""];
  foldersParent.image = [NSImage imageWithSystemSymbolName:@"folder" accessibilityDescription:@"Folders"];
  NSMenu *foldersSubmenu = [[NSMenu alloc] init];
  [foldersSubmenu addItem:CreateActionItem(@"Reveal Isolated CodexHome", @selector(openCodexHomeAction:), @"house", nil)];
  [foldersSubmenu addItem:CreateActionItem(@"Reveal Enhancement Logs", @selector(openLogsAction:), @"doc.text", nil)];
  foldersParent.submenu = foldersSubmenu;
  [menu addItem:foldersParent];

  // 5. Termination
  [menu addItem:[NSMenuItem separatorItem]];
  NSMenuItem *quit = CreateActionItem(@"Quit Codex & Enhancements", @selector(terminate:), @"power", nil);
  quit.keyEquivalent = @"q";
  [menu addItem:quit];

  gStatusItem.menu = menu;
}

static void InstallEnhancementStatusItem(void) {
  gStatusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
  NSImage *icon = ChatGPTTemplateImage();
  gStatusItem.button.image = icon;
  gStatusItem.button.toolTip = @"Codex Desktop (Oh My OpenAI)";
  gStatusItem.visible = YES;
  RebuildStatusMenu();
}

// ─── Runtime Launcher Core ─────────────────────────────────────

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

static BOOL RunTool(NSString *launchPath, NSArray<NSString *> *arguments, NSString **diagnostic) {
  NSTask *task = [[NSTask alloc] init];
  task.launchPath = launchPath;
  task.arguments = arguments;
  NSPipe *pipe = [NSPipe pipe];
  task.standardOutput = pipe;
  task.standardError = pipe;

  @try {
    [task launch];
  } @catch (NSException *exception) {
    if (diagnostic) *diagnostic = exception.reason ?: @"Helper could not start.";
    return NO;
  }

  NSData *output = [pipe.fileHandleForReading readDataToEndOfFile];
  [task waitUntilExit];
  if (task.terminationStatus == 0) return YES;
  if (diagnostic) *diagnostic = ConciseToolOutput(output);
  return NO;
}

static NSURL *RuntimeExecutableURL(NSURL *runtimeURL) {
  NSDictionary *info = [NSDictionary dictionaryWithContentsOfURL:
    [runtimeURL URLByAppendingPathComponent:@"Contents/Info.plist"]];
  NSString *executableName = info[@"CFBundleExecutable"] ?: @"Codex";
  return [runtimeURL URLByAppendingPathComponent:
    [@"Contents/MacOS" stringByAppendingPathComponent:executableName]];
}

static BOOL EnsurePrivateRuntimeInstalled(NSURL *payloadURL, NSURL *runtimeURL, NSString **failure) {
  NSFileManager *fm = [NSFileManager defaultManager];
  if ([fm fileExistsAtPath:runtimeURL.path]) return YES;

  NSString *parentPath = runtimeURL.URLByDeletingLastPathComponent.path;
  [fm createDirectoryAtPath:parentPath withIntermediateDirectories:YES attributes:nil error:nil];

  NSString *tempPath = [parentPath stringByAppendingPathComponent:
    [NSString stringWithFormat:@"Codex-Install-%d.tmp", getpid()]];
  [fm removeItemAtPath:tempPath error:nil];

  NSString *diagnostic = nil;
  if (!RunTool(@"/usr/bin/ditto", @[payloadURL.path, tempPath], &diagnostic)) {
    if (failure) *failure = [NSString stringWithFormat:@"Failed to copy runtime:\n%@", diagnostic];
    return NO;
  }

  if (rename(tempPath.fileSystemRepresentation, runtimeURL.fileSystemRepresentation) != 0) {
    if (failure) *failure = [NSString stringWithFormat:@"Failed to finalize runtime installation (%s).", strerror(errno)];
    [fm removeItemAtPath:tempPath error:nil];
    return NO;
  }
  return YES;
}

static BOOL LaunchRuntime(NSArray<NSString *> *forwardedArguments, NSString **failure) {
  NSString *supportPath = [NSHomeDirectory() stringByAppendingPathComponent:kSupportDirectory];
  NSString *codexHomePath = [supportPath stringByAppendingPathComponent:kCodexHomeName];
  NSString *profilePath = [supportPath stringByAppendingPathComponent:@"Profile"];
  NSURL *supportURL = [NSURL fileURLWithPath:supportPath isDirectory:YES];
  NSURL *runtimeURL = [supportURL URLByAppendingPathComponent:kRuntimeName isDirectory:YES];
  NSURL *payloadURL = [[NSBundle mainBundle].resourceURL URLByAppendingPathComponent:kPayloadName isDirectory:YES];

  if (!EnsurePrivateRuntimeInstalled(payloadURL, runtimeURL, failure)) return NO;

  NSURL *runtimeExecutableURL = RuntimeExecutableURL(runtimeURL);
  NSString *runtimePath = runtimeExecutableURL.path;
  if (![[NSFileManager defaultManager] isExecutableFileAtPath:runtimePath]) {
    if (failure) *failure = [NSString stringWithFormat:@"Runtime binary not executable: %@", runtimePath];
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
  for (NSUInteger i = 0; i < arguments.count; i++) {
    childArgv[i] = strdup(arguments[i].UTF8String);
  }

  pid_t childPid = 0;
  int spawnResult = posix_spawn(&childPid, runtimePath.fileSystemRepresentation, NULL, NULL, childArgv, environ);
  for (NSUInteger i = 0; i < arguments.count; i++) free(childArgv[i]);
  free(childArgv);

  if (spawnResult != 0) {
    if (failure) *failure = [NSString stringWithFormat:@"Failed to spawn runtime: %s", strerror(spawnResult)];
    return NO;
  }
  return YES;
}

// ─── Application Delegate ──────────────────────────────────────

@interface CodexLauncherDelegate : NSObject <NSApplicationDelegate>
- (instancetype)initWithCommandLineArguments:(NSArray<NSString *> *)arguments;
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent;
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
  ClaimLauncherURLScheme();
  InstallEnhancementStatusItem();
  EnhancementManagerStartAll();

  if (gShowSettingsOnLaunch) [self showSettingsAction:nil];

  [self performSelector:@selector(performInitialLaunch) withObject:nil afterDelay:0.10];
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  (void)notification;
  EnhancementManagerStopAll();
  [[NSAppleEventManager sharedAppleEventManager]
    removeEventHandlerForEventClass:kCodexInternetEventClass
                          andEventID:kCodexGetURLEvent];
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)application hasVisibleWindows:(BOOL)hasVisibleWindows {
  (void)application;
  (void)hasVisibleWindows;
  if (_didPerformInitialLaunch) [self launchWithArguments:@[]];
  return NO;
}

- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent {
  (void)replyEvent;
  NSString *urlString = [[event paramDescriptorForKeyword:kCodexDirectObject] stringValue];
  if (urlString.length == 0) return;

  NSURLComponents *components = [NSURLComponents componentsWithString:urlString];
  if ([components.scheme caseInsensitiveCompare:kLauncherURLScheme] != NSOrderedSame) return;

  if (!_didPerformInitialLaunch) {
    [_pendingURLs addObject:urlString];
    return;
  }
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
  NSString *failure = nil;
  if (!LaunchRuntime(arguments, &failure)) {
    ShowLaunchError(failure ?: @"The Codex runtime could not be launched.");
  }
}

// Actions
- (void)openEnhancementAction:(NSMenuItem *)sender {
  NSArray<NSString *> *payload = sender.representedObject;
  if (payload.count == 2) {
    EnhancementManagerOpen(payload[0].UTF8String, payload[1].UTF8String);
  }
}

- (void)restartEnhancementAction:(NSMenuItem *)sender {
  NSString *identifier = sender.representedObject;
  if (identifier) {
    EnhancementManagerRestartService(identifier.UTF8String);
  }
}

- (void)showSettingsAction:(id)sender {
  (void)sender;
  ShowEnhancementHub();
}

- (void)openCodexHomeAction:(id)sender {
  (void)sender;
  NSString *home = [NSHomeDirectory() stringByAppendingPathComponent:
    [kSupportDirectory stringByAppendingPathComponent:kCodexHomeName]];
  [[NSWorkspace sharedWorkspace] selectFile:nil inFileViewerRootedAtPath:home];
}

- (void)openLogsAction:(id)sender {
  (void)sender;
  NSString *logs = [NSHomeDirectory() stringByAppendingPathComponent:
    [kSupportDirectory stringByAppendingPathComponent:@"enhancements"]];
  [[NSWorkspace sharedWorkspace] selectFile:nil inFileViewerRootedAtPath:logs];
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    SanitizeEnvironment();
    signal(SIGTERM, HandleTerminationSignal);
    signal(SIGINT, HandleTerminationSignal);
    signal(SIGHUP, HandleTerminationSignal);

    NSMutableArray<NSString *> *arguments = [NSMutableArray array];
    for (int i = 1; i < argc; i++) {
      NSString *arg = [NSString stringWithUTF8String:argv[i]];
      if (!arg) continue;
      if ([arg isEqualToString:@"--show-settings"]) {
        gShowSettingsOnLaunch = YES;
        continue;
      }
      if ([arg hasPrefix:@"-psn_"]) continue;
      [arguments addObject:arg];
    }

    NSApplication *app = [NSApplication sharedApplication];
    [app setActivationPolicy:NSApplicationActivationPolicyAccessory];

    CodexLauncherDelegate *delegate = [[CodexLauncherDelegate alloc] initWithCommandLineArguments:arguments];
    gAppDelegate = delegate;
    app.delegate = delegate;

    [[NSAppleEventManager sharedAppleEventManager]
      setEventHandler:delegate
           andSelector:@selector(handleGetURLEvent:withReplyEvent:)
         forEventClass:kCodexInternetEventClass
            andEventID:kCodexGetURLEvent];

    [app run];
    return 0;
  }
}
