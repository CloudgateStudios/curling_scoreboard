import 'dart:async';

import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/firebase_options_dev.dart' as dev;
import 'package:curling_scoreboard/firebase_options_prod.dart' as prod;
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:firebase_core/firebase_core.dart';
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
    ),
  );
}

class CurlingScoreboardApp extends StatelessWidget {
  const CurlingScoreboardApp({required this.registrationService, super.key});

  final RegistrationService registrationService;

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
      ),
    );
  }
}

class CurlingScoreboardScreen extends StatefulWidget {
  const CurlingScoreboardScreen({
    required this.registrationService,
    super.key,
  });

  final RegistrationService registrationService;

  @override
  State<CurlingScoreboardScreen> createState() =>
      _CurlingScoreboardScreenState();
}

class _CurlingScoreboardScreenState extends State<CurlingScoreboardScreen> {
  late CurlingGame gameObject;
  late final SyncService _syncService;

  Timer? timer;
  int totalTimerSeconds = 0;
  int overUnderInSeconds = 0;
  Duration fullGameDuration = Duration.zero;
  List<int> secondsPerEnd = [];

  @override
  void initState() {
    super.initState();
    _syncService = SyncService(widget.registrationService);

    // Setup a dummy game object to start with, none of this is actually used
    // as we will be setting the game object in the game start dialog.
    gameObject = CurlingGame(
      team1: CurlingTeam(
        name: 'Red',
        color: Constants.redTeamColor,
        textColor: Constants.textHighContrastColor,
        hasHammer: false,
      ),
      team2: CurlingTeam(
        name: 'Yellow',
        color: Constants.yellowTeamColor,
        textColor: Constants.textDefaultColor,
        hasHammer: true,
        hadLastStoneFirstEnd: true,
      ),
      numberOfEnds: Constants.defaultTotalEnds,
      numberOfPlayersPerTeam: Constants.defaultNumberOfPlayersPerTeam,
    );

    // Need a small delay to allow everything to be setup before showing
    // the start dialog.
    Timer.run(showGameStartDialog);
  }

  Future<void> showGameStartDialog() async {
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return const GameStartDialog();
      },
    ).then((value) {
      gameObject = value as CurlingGame;
      startTimer();
    });
  }

  void startTimer() {
    timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      totalTimerSeconds += 1;
      overUnderInSeconds = Duration(
        seconds:
            totalTimerSeconds - secondsPerEnd[gameObject.currentPlayingEnd - 1],
      ).inSeconds;
      setState(() {});
    });

    calculateSecondsPerEnd();
  }

  void calculateSecondsPerEnd() {
    fullGameDuration = Duration(
      minutes: gameObject.numberOfEnds * gameObject.minutesPerEnd,
    );

    final secondsPerEnd = fullGameDuration.inSeconds ~/ gameObject.numberOfEnds;
    this.secondsPerEnd = List.generate(gameObject.numberOfEnds, (index) {
      return secondsPerEnd * (index + 1);
    });

    // Need to make sure we add in padding for the extra end
    this.secondsPerEnd.add(secondsPerEnd * (gameObject.numberOfEnds + 1));
  }

  Future<void> enterScore(CurlingEnd curlingEnd) async {
    // Don't allow for entering scores if we have filled all the ends
    if (gameObject.currentPlayingEnd > gameObject.numberOfEnds + 1) {
      return;
    }

    setState(() {
      if (gameObject.currentPlayingEnd + 1 <= gameObject.numberOfEnds + 1) {
        gameObject.currentPlayingEnd++;
      }

      final currentEndList = gameObject.ends.toList()..add(curlingEnd);

      gameObject
        ..ends = currentEndList
        ..evaluateHammer();
    });

    unawaited(_syncService.pushLiveGame(gameObject));

    if (gameObject.isGameComplete) {
      await finishGame(context);
    }
  }

  void editScore(int end, int score, String? team) {
    final originalEndScore = gameObject.ends.elementAt(end - 1);

    setState(() {
      originalEndScore
        ..scoringTeamName = team
        ..score = score;

      gameObject.ends[end - 1] = originalEndScore;
      gameObject.evaluateHammer();
    });

    unawaited(_syncService.pushLiveGame(gameObject));
  }

  Future<void> finishGame(BuildContext context) async {
    setState(() {
      timer!.cancel();
    });

    unawaited(_syncService.saveCompletedGame(gameObject));

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return GameEndDialog(gameObject: gameObject);
      },
    ).then((value) async {
      setState(() {
        if (gameObject.ends.isNotEmpty) {
          gameObject.ends.clear();
        }

        totalTimerSeconds = 0;
        overUnderInSeconds = 0;
      });
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
    await showDialog(
      context: context,
      builder: (context) {
        return ScoreInputDialog(
          defaultTeam: gameObject.whichTeamHasHammer().name,
          defaultScore: 0,
          end: gameObject.currentPlayingEnd,
        );
      },
    ).then((value) async {
      // Need to add in the current timer value to the end so we get it at the
      // point of entry on the dialog, not when the dialog came up
      final curlingEnd = value as CurlingEnd
        ..gameTimeInSeconds = totalTimerSeconds;

      await enterScore(curlingEnd);
    });
  }

  Future<void> showEditScoreDialog(int end) async {
    if (end > gameObject.currentPlayingEnd) {
      return;
    }

    await showDialog(
      context: context,
      builder: (context) {
        return ScoreInputDialog(
          defaultTeam: gameObject.ends[end - 1].scoringTeamName,
          defaultScore: gameObject.ends[end - 1].score,
          end: end,
        );
      },
    ).then((value) {
      final curlingEnd = value as CurlingEnd;
      editScore(
        curlingEnd.endNumber,
        curlingEnd.score,
        curlingEnd.scoringTeamName,
      );
    });
  }

  @override
  void dispose() {
    timer?.cancel();
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
                    content: Text(
                      context.l10n.addScoreGameCompleteMessage,
                    ),
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
              gameTime: Duration(seconds: totalTimerSeconds),
              gameTimeOverUnder: Duration(seconds: overUnderInSeconds),
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
                          gameObject.scoreboardStyle = value!;
                        });
                        setState(() {});
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
                        l10n.settingsDialogConnectedClub(
                          reg.clubName ?? '',
                        ),
                      ),
                      Text(
                        l10n.settingsDialogConnectedSheet(
                          reg.sheetName ?? '',
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () async {
                          final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: Text(
                                l10n.disconnectConfirmationTitle,
                              ),
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
                        child: Text(
                          l10n.settingsDialogDisconnectButtonLabel,
                        ),
                      ),
                    ] else
                      TextButton(
                        onPressed: () async {
                          final connected = await showDialog<bool>(
                            context: context,
                            builder: (_) => ConnectToClubDialog(
                              registrationService: reg,
                            ),
                          );
                          if (connected ?? false) {
                            if (context.mounted) {
                              setStateDialog(() {});
                              setState(() {});
                            }
                          }
                        },
                        child: Text(
                          l10n.settingsDialogConnectButtonLabel,
                        ),
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: Text(
                    l10n.settingsDialogButtonLabelClose,
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
