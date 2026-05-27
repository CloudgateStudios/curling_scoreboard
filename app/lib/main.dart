import 'dart:async';

import 'package:curling_scoreboard_flutter/constants.dart';
import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:curling_scoreboard_flutter/models/models.dart';
import 'package:curling_scoreboard_flutter/widgets/widgets.dart';
import 'package:flutter/material.dart';

void main() {
  runApp(const CurlingScoreboardApp());
}

class CurlingScoreboardApp extends StatelessWidget {
  const CurlingScoreboardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData(
        colorSchemeSeed: Constants.primaryThemeColor,
        useMaterial3: true,
      ),
      home: const CurlingScoreboardScreen(),
    );
  }
}

class CurlingScoreboardScreen extends StatefulWidget {
  const CurlingScoreboardScreen({super.key});

  @override
  State<CurlingScoreboardScreen> createState() =>
      _CurlingScoreboardScreenState();
}

class _CurlingScoreboardScreenState extends State<CurlingScoreboardScreen> {
  late CurlingGame gameObject;

  Timer? timer;
  int totalTimerSeconds = 0;
  int overUnderInSeconds = 0;
  Duration fullGameDuration = Duration.zero;
  List<int> secondsPerEnd = [];

  @override
  void initState() {
    super.initState();

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
  }

  Future<void> finishGame(BuildContext context) async {
    setState(() {
      timer!.cancel();
    });

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
            label: AppLocalizations.of(context)!.appBarAddScoreButtonLabel,
            onPressed: () async {
              if (gameObject.ends.length < gameObject.numberOfEnds + 1) {
                await showEnterScoreDialog(context);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      AppLocalizations.of(context)!.addScoreGameCompleteMessage,
                    ),
                  ),
                );
              }
            },
          ),
          AppBarActionButton(
            icon: Icons.sports_score,
            label: AppLocalizations.of(context)!.appBarFinishGameButtonLabel,
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
            return AlertDialog(
              title: Text(AppLocalizations.of(context)!.settingsDialogTitle),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    AppLocalizations.of(
                      context,
                    )!.settingsDialogLabelScoreboardStyle,
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
                            AppLocalizations.of(
                              context,
                            )!.settingsDialogScoreboardStyleBaseball,
                          ),
                          value: ScoreboardStyle.baseball,
                        ),
                        RadioListTile<ScoreboardStyle>(
                          title: Text(
                            AppLocalizations.of(
                              context,
                            )!.settingsDialogScoreboardStyleCurlingClub,
                          ),
                          value: ScoreboardStyle.club,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: Text(
                    AppLocalizations.of(
                      context,
                    )!.settingsDialogButtonLabelClose,
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
