import 'dart:async';

import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/controllers/controllers.dart';
import 'package:curling_scoreboard/firebase_options_dev.dart' as dev;
import 'package:curling_scoreboard/firebase_options_prod.dart' as prod;
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/device_status_service.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:curling_scoreboard/services/update_service.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _firebaseEnv = String.fromEnvironment(
  'FIREBASE_ENV',
  defaultValue: 'dev',
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: _firebaseEnv == 'prod'
        ? prod.DefaultFirebaseOptions.currentPlatform
        : dev.DefaultFirebaseOptions.currentPlatform,
  );
  final prefs = await SharedPreferences.getInstance();
  runApp(
    CurlingScoreboardApp(
      registrationService: RegistrationService(prefs),
      updateService: UpdateService.forCurrentPlatform(prefs)?..start(),
    ),
  );
}

class CurlingScoreboardApp extends StatelessWidget {
  const CurlingScoreboardApp({
    required this.registrationService,
    this.updateService,
    super.key,
  });

  final RegistrationService registrationService;
  final UpdateService? updateService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData(
        colorSchemeSeed: Constants.primaryThemeColor,
        useMaterial3: true,
      ),
      home: CurlingScoreboardScreen(
        registrationService: registrationService,
        updateService: updateService,
      ),
    );
  }
}

class CurlingScoreboardScreen extends StatefulWidget {
  const CurlingScoreboardScreen({
    required this.registrationService,
    this.updateService,
    super.key,
  });

  final RegistrationService registrationService;
  final UpdateService? updateService;

  @override
  State<CurlingScoreboardScreen> createState() =>
      _CurlingScoreboardScreenState();
}

class _CurlingScoreboardScreenState extends State<CurlingScoreboardScreen> {
  late final GameController _gameController;
  late final DeviceStatusService _deviceStatus;

  CurlingGame get gameObject => _gameController.game;

  /// True while the game start dialog is up, which is the only time a reload
  /// cannot lose a game in progress.
  bool _awaitingGameStart = false;

  Timer? _updateTimer;
  OverlayEntry? _updateBanner;
  final _updateCountdown = ValueNotifier<int>(0);

  @override
  void initState() {
    super.initState();
    final syncService = SyncService(widget.registrationService);
    _gameController = GameController(syncService: syncService)
      ..addListener(_onGameChanged);
    _deviceStatus = DeviceStatusService(
      write: syncService.pushDeviceStatus,
      updateService: widget.updateService,
      lastSyncError: () => syncService.lastError,
    )..start();
    widget.updateService?.updateAvailable.addListener(_scheduleUpdateReload);
    GestureBinding.instance.pointerRouter.addGlobalRoute(_onGlobalPointer);

    // Need a small delay to allow everything to be setup before showing
    // the start dialog.
    Timer.run(showGameStartDialog);
  }

  void _onGameChanged() => setState(() {});

  /// Any touch while a reload is pending starts the quiet period over.
  void _onGlobalPointer(PointerEvent event) {
    if (event is PointerDownEvent && _updateTimer != null) {
      _scheduleUpdateReload();
    }
  }

  /// Arms the reload onto a new build, if one is available and no game is in
  /// progress. Between games is the natural point to pick it up.
  void _scheduleUpdateReload() {
    _cancelUpdateReload();
    final updates = widget.updateService;
    if (!_awaitingGameStart || updates == null || !updates.canReload) return;

    _updateTimer = Timer(Constants.updateQuietPeriod, _startUpdateCountdown);
  }

  void _startUpdateCountdown() {
    _updateCountdown.value = Constants.updateCountdownSeconds;
    _updateBanner = OverlayEntry(
      builder: (context) =>
          UpdateCountdownBanner(secondsLeft: _updateCountdown),
    );
    Overlay.of(context).insert(_updateBanner!);

    _updateTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _updateCountdown.value--;
      if (_updateCountdown.value > 0) return;
      _cancelUpdateReload();
      widget.updateService?.reloadIfUpdateAvailable();
    });
  }

  void _cancelUpdateReload() {
    _updateTimer?.cancel();
    _updateTimer = null;
    _updateBanner
      ?..remove()
      ..dispose();
    _updateBanner = null;
  }

  Future<void> showGameStartDialog() async {
    _awaitingGameStart = true;
    _scheduleUpdateReload();
    final newGame = await showDialog<CurlingGame>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        // There is no sensible way to cancel out of starting a game: the
        // scoreboard has nothing to show without one. barrierDismissible does
        // not stop the system back button, so block popping outright too.
        return const PopScope(canPop: false, child: GameStartDialog());
      },
    );
    _awaitingGameStart = false;
    _cancelUpdateReload();

    // The dialog blocks every dismissal route, so this should not happen.
    // Bail out rather than crashing if it somehow does.
    if (newGame == null) {
      return;
    }

    _gameController.startGame(newGame);
  }

  Future<void> enterScore(CurlingEnd curlingEnd) async {
    if (!_gameController.enterScore(curlingEnd)) {
      return;
    }

    if (gameObject.isGameComplete) {
      await finishGame(context);
    }
  }

  Future<void> finishGame(BuildContext context) async {
    _gameController.finishGame();

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return GameEndDialog(gameObject: gameObject);
      },
    ).then((value) async {
      _gameController.resetForNextGame();
      await showGameStartDialog();
    });
  }

  Future<void> showFinishGameConfirmationDialog(BuildContext context) async {
    await showDialog(
      context: context,
      builder: (context) {
        return FinishGameDialog(finishGameAction: finishGame);
      },
    );
  }

  Future<void> showEnterScoreDialog(BuildContext context) async {
    final curlingEnd = await showDialog<CurlingEnd>(
      context: context,
      builder: (context) {
        return ScoreInputDialog(
          defaultTeam: gameObject.whichTeamHasHammer(),
          defaultScore: 0,
          end: gameObject.currentPlayingEnd,
        );
      },
    );

    // Tapping outside the dialog dismisses it without entering a score.
    if (curlingEnd == null) {
      return;
    }

    // Need to add in the current timer value to the end so we get it at the
    // point of entry on the dialog, not when the dialog came up
    curlingEnd.gameTimeInSeconds = _gameController.totalTimerSeconds;

    await enterScore(curlingEnd);
  }

  Future<void> showEditScoreDialog(int end) async {
    // Only ends that have actually been played can be edited. `ends` holds the
    // completed ends, so anything outside it has no score to edit yet. Empty
    // scoreboard cells also report a sentinel end number of -1.
    if (end < 1 || end > gameObject.ends.length) {
      return;
    }

    final curlingEnd = await showDialog<CurlingEnd>(
      context: context,
      builder: (context) {
        return ScoreInputDialog(
          defaultTeam: gameObject.ends[end - 1].scoringTeam,
          defaultScore: gameObject.ends[end - 1].score,
          end: end,
        );
      },
    );

    // Tapping outside the dialog dismisses it without changing the score.
    if (curlingEnd == null) {
      return;
    }

    _gameController.editScore(
      curlingEnd.endNumber,
      curlingEnd.score,
      curlingEnd.scoringTeam,
    );
  }

  @override
  void dispose() {
    widget.updateService?.updateAvailable.removeListener(_scheduleUpdateReload);
    GestureBinding.instance.pointerRouter.removeGlobalRoute(_onGlobalPointer);
    _cancelUpdateReload();
    _updateCountdown.dispose();
    _deviceStatus.dispose();
    _gameController
      ..removeListener(_onGameChanged)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 50,
        leadingWidth: 100,
        leading: Padding(
          padding: const EdgeInsets.only(left: 10, top: 3, bottom: 3),
          child: AppBarActionButton(
            icon: Icons.settings,
            padding: EdgeInsets.zero,
            onPressed: () async {
              await showSettingsDialog(context);
            },
          ),
        ),
        actions: <Widget>[
          AppBarActionButton(
            icon: Icons.add,
            label: context.l10n.appBarAddScoreButtonLabel,
            onPressed: () async {
              if (gameObject.ends.length < gameObject.numberOfEnds + 1) {
                await showEnterScoreDialog(context);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(context.l10n.addScoreGameCompleteMessage),
                  ),
                );
              }
            },
          ),
          AppBarActionButton(
            icon: Icons.sports_score,
            label: context.l10n.appBarFinishGameButtonLabel,
            onPressed: () async {
              await showFinishGameConfirmationDialog(context);
            },
          ),
        ],
      ),
      body: buildBody(),
    );
  }

  Widget buildBody() {
    return Column(
      children: [
        Flexible(
          flex: 9,
          child: TotalScoreRow(
            team1Score: gameObject.team1TotalScore,
            team1Color: gameObject.team1.color,
            team1TextColor: gameObject.team1.textColor,
            team1HasHammer: gameObject.team1.hasHammer,
            team1HasLSFE: gameObject.team1.hadLastStoneFirstEnd,
            team2Score: gameObject.team2TotalScore,
            team2Color: gameObject.team2.color,
            team2TextColor: gameObject.team2.textColor,
            team2HasHammer: gameObject.team2.hasHammer,
            team2HasLSFE: gameObject.team2.hadLastStoneFirstEnd,
            endNumber: gameObject.currentPlayingEndForDisplay,
          ),
        ),
        if (gameObject.numberOfPlayersPerTeam > 0)
          Flexible(
            child: GameInfoRowWidget(
              gameTime: Duration(seconds: _gameController.totalTimerSeconds),
              gameTimeOverUnder: Duration(
                seconds: _gameController.overUnderInSeconds,
              ),
            ),
          )
        else
          const SizedBox(height: 0),
        Flexible(
          flex: 4,
          fit: FlexFit.tight,
          child: gameObject.scoreboardStyle == ScoreboardStyle.baseball
              ? ScoreboardBaseballLayout(
                  numberOfEnds: gameObject.numberOfEnds,
                  endsContainerColor: Constants.primaryThemeColor,
                  team1Scores: gameObject.team1ScoresByEnd,
                  team2Scores: gameObject.team2ScoresByEnd,
                  team1FilledColor: gameObject.team1.color,
                  team2FilledColor: gameObject.team2.color,
                  onPressed: showEditScoreDialog,
                )
              : ScoreboardCurlingClubLayout(
                  team1Scores: gameObject.team1ScoresByEnd,
                  team2Scores: gameObject.team2ScoresByEnd,
                  team1Color: gameObject.team1.color,
                  team2Color: gameObject.team2.color,
                  team1TextColor: gameObject.team1.textColor,
                  team2TextColor: gameObject.team2.textColor,
                  scoreRowColor: Constants.primaryThemeColor,
                  scoreRowTextColor: Constants.textHighContrastColor,
                  onPressed: showEditScoreDialog,
                ),
        ),
      ],
    );
  }

  Future<void> showSettingsDialog(BuildContext context) async {
    await showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            final l10n = context.l10n;
            final reg = widget.registrationService;

            return AlertDialog(
              title: Text(l10n.settingsDialogTitle),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.settingsDialogLabelScoreboardStyle,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    RadioGroup<ScoreboardStyle>(
                      groupValue: gameObject.scoreboardStyle,
                      onChanged: (value) {
                        setStateDialog(() {
                          _gameController.scoreboardStyle = value!;
                        });
                      },
                      child: Column(
                        children: [
                          RadioListTile<ScoreboardStyle>(
                            title: Text(
                              l10n.settingsDialogScoreboardStyleBaseball,
                            ),
                            value: ScoreboardStyle.baseball,
                          ),
                          RadioListTile<ScoreboardStyle>(
                            title: Text(
                              l10n.settingsDialogScoreboardStyleCurlingClub,
                            ),
                            value: ScoreboardStyle.club,
                          ),
                        ],
                      ),
                    ),
                    const Divider(),
                    Text(
                      l10n.settingsDialogConnectionSectionTitle,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    if (reg.isRegistered) ...[
                      Text(
                        l10n.settingsDialogConnectedClub(reg.clubName ?? ''),
                      ),
                      Text(
                        l10n.settingsDialogConnectedSheet(reg.sheetName ?? ''),
                      ),
                      ValueListenableBuilder<bool>(
                        valueListenable: reg.pairingLost,
                        builder: (context, pairingLost, _) {
                          if (!pairingLost) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              l10n.settingsDialogPairingLost,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () async {
                          final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: Text(l10n.disconnectConfirmationTitle),
                              content: Text(
                                l10n.disconnectConfirmationContent(
                                  reg.clubName ?? '',
                                ),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.of(ctx).pop(false),
                                  child: Text(l10n.buttonLabelNo),
                                ),
                                TextButton(
                                  onPressed: () => Navigator.of(ctx).pop(true),
                                  child: Text(
                                    l10n.disconnectConfirmationButton,
                                  ),
                                ),
                              ],
                            ),
                          );
                          if (confirmed ?? false) {
                            await reg.disconnect();
                            if (context.mounted) {
                              setStateDialog(() {});
                              setState(() {});
                            }
                          }
                        },
                        child: Text(l10n.settingsDialogDisconnectButtonLabel),
                      ),
                    ] else
                      TextButton(
                        onPressed: () async {
                          final connected = await showDialog<bool>(
                            context: context,
                            builder: (_) =>
                                ConnectToClubDialog(registrationService: reg),
                          );
                          if (connected ?? false) {
                            // Let the admin portal see the newly paired
                            // scoreboard without waiting for a heartbeat.
                            _deviceStatus.reportNow();
                            if (context.mounted) {
                              setStateDialog(() {});
                              setState(() {});
                            }
                          }
                        },
                        child: Text(l10n.settingsDialogConnectButtonLabel),
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: Text(l10n.settingsDialogButtonLabelClose),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
