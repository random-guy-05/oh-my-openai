#import <Cocoa/Cocoa.h>
#import <errno.h>
#import <fcntl.h>
#import <spawn.h>
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

  // GURL is normally delivered before didFinishLaunching. One short run-loop
  // grace period also covers LaunchServices versions that enqueue it immediately
  // afterward, without adding noticeable latency to an ordinary app launch.
  [self performSelector:@selector(performInitialLaunch)
             withObject:nil
             afterDelay:0.10];
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  (void)notification;
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
  NSString *failure = nil;
  if (!LaunchRuntime(arguments, &failure)) {
    ShowLaunchError(failure ? failure : @"The Codex runtime could not be launched.");
  }
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    SanitizeEnvironment();

    NSMutableArray<NSString *> *arguments = [NSMutableArray array];
    for (int index = 1; index < argc; index++) {
      NSString *argument = [NSString stringWithUTF8String:argv[index]];
      if (!argument || [argument hasPrefix:@"-psn_"]) continue;
      [arguments addObject:argument];
    }

    NSApplication *application = [NSApplication sharedApplication];
    [application setActivationPolicy:NSApplicationActivationPolicyAccessory];

    static CodexLauncherDelegate *launcherDelegate = nil;
    launcherDelegate = [[CodexLauncherDelegate alloc]
      initWithCommandLineArguments:arguments];
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
