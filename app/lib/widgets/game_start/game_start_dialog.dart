import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/src/version.dart';
import 'package:flutter/material.dart';
import 'package:material_segmented_control/material_segmented_control.dart';

class GameStartDialog extends StatelessWidget {
  const GameStartDialog({super.key});

  @override
  Widget build(BuildContext context) {
    var settingsTotalEnds = Constants.defaultTotalEnds;
    var currentNumberOfEndsSelectedIndex = Constants.defaultTotalEnds;

    final numberOfEnds = {
      2: const Padding(
        padding: EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: GameStartSegmentControlText(text: '2'),
      ),
      4: const GameStartSegmentControlText(text: '4'),
      6: const GameStartSegmentControlText(text: '6'),
      8: const GameStartSegmentControlText(text: '8'),
      10: const GameStartSegmentControlText(text: '10'),
    };

    var settingsNumberOfPlayersPerTeam =
        Constants.defaultNumberOfPlayersPerTeam;
    var currentNumberOfPlayersPerTeamSelectedIndex =
        Constants.defaultNumberOfPlayersPerTeam;

    final hammerChoices = {
      0: Padding(
        padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: GameStartSegmentControlText(
          text: context.l10n.teamNameRed,
        ),
      ),
      1: GameStartSegmentControlText(
        text: context.l10n.teamNameYellow,
      ),
    };

    var settingsHammerTeam = Constants.defaultHammerTeam;
    var currentHammerTeamSelectedIndex = Constants.defaultHammerTeam;

    return StatefulBuilder(
      builder: (context, setState) {
        // In order to have the text update correctly need to have this inside
        // the stateful builder context.
        final numberOfPlayersPerTeam = {
          0: GameStartSegmentControlText(
            text: '0',
            subtext: context.l10n.gameStartDialogZeroPlayersButtonLabel,
          ),
          2: Padding(
            padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
            child: GameStartSegmentControlText(
              text: '2',
              subtext: context.l10n
                  .gameStartDialogTimePerEndByPlayersButtonLabel(
                    Constants.minutesPerEndTwoPlayers.toString(),
                    _printDuration(
                      Duration(
                        minutes:
                            Constants.minutesPerEndTwoPlayers *
                            settingsTotalEnds,
                      ),
                    ),
                  ),
            ),
          ),
          4: GameStartSegmentControlText(
            text: '4',
            subtext: context.l10n.gameStartDialogTimePerEndByPlayersButtonLabel(
                  Constants.minutesPerEndFourPlayers.toString(),
                  _printDuration(
                    Duration(
                      minutes:
                          Constants.minutesPerEndFourPlayers *
                          settingsTotalEnds,
                    ),
                  ),
                ),
          ),
        };

        return AlertDialog(
          title: Text(context.l10n.gameStartDialogTitle),
          content: Form(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Text(
                      context.l10n.gameStartDialogFormLabelNumberOfEnds,
                      style: const TextStyle(fontSize: 40),
                    ),
                    MaterialSegmentedControl(
                      children: numberOfEnds,
                      selectionIndex: currentNumberOfEndsSelectedIndex,
                      borderColor: Colors.grey,
                      selectedColor: Colors.blueAccent,
                      unselectedColor: Colors.white,
                      selectedTextStyle: const TextStyle(color: Colors.white),
                      unselectedTextStyle: const TextStyle(color: Colors.black),
                      borderWidth: 1,
                      borderRadius: 20,
                      horizontalPadding: const EdgeInsets.all(10),
                      verticalOffset: 25,
                      onSegmentTapped: (index) {
                        setState(() {
                          currentNumberOfEndsSelectedIndex = index;
                          settingsTotalEnds = index;
                        });
                      },
                    ),
                  ],
                ),
                Row(
                  children: [
                    Text(
                      context.l10n.gameStartDialogFormLabelPlayersPerTeam,
                      style: const TextStyle(fontSize: 40),
                    ),
                    MaterialSegmentedControl(
                      children: numberOfPlayersPerTeam,
                      selectionIndex:
                          currentNumberOfPlayersPerTeamSelectedIndex,
                      borderColor: Colors.grey,
                      selectedColor: Colors.blueAccent,
                      unselectedColor: Colors.white,
                      selectedTextStyle: const TextStyle(color: Colors.white),
                      unselectedTextStyle: const TextStyle(color: Colors.black),
                      borderWidth: 1,
                      borderRadius: 20,
                      horizontalPadding: const EdgeInsets.all(10),
                      verticalOffset: 25,
                      onSegmentTapped: (index) {
                        setState(() {
                          currentNumberOfPlayersPerTeamSelectedIndex = index;
                          settingsNumberOfPlayersPerTeam = index;
                        });
                      },
                    ),
                  ],
                ),
                Row(
                  children: [
                    Text(
                      context.l10n.gameStartDialogFormLabelFirstEndHammer,
                      style: const TextStyle(fontSize: 40),
                    ),
                    MaterialSegmentedControl(
                      children: hammerChoices,
                      selectionIndex: currentHammerTeamSelectedIndex,
                      borderColor: Colors.grey,
                      selectedColor: Colors.blueAccent,
                      unselectedColor: Colors.white,
                      selectedTextStyle: const TextStyle(color: Colors.white),
                      unselectedTextStyle: const TextStyle(color: Colors.black),
                      borderWidth: 1,
                      borderRadius: 20,
                      horizontalPadding: const EdgeInsets.all(10),
                      verticalOffset: 25,
                      onSegmentTapped: (index) {
                        setState(() {
                          currentHammerTeamSelectedIndex = index;
                          settingsHammerTeam = index;
                        });
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
          actionsAlignment: MainAxisAlignment.spaceBetween,
          actions: [
            const Padding(
              padding: EdgeInsets.only(left: 20),
              child: Text(
                'v$packageVersion',
                style: TextStyle(color: Colors.grey),
              ),
            ),
            ElevatedButton(
              onPressed: () {
                final team1 = CurlingTeam(
                  name: context.l10n.teamNameRed,
                  color: Constants.redTeamColor,
                  textColor: Constants.textHighContrastColor,
                  hasHammer: settingsHammerTeam == 0,
                  hadLastStoneFirstEnd: settingsHammerTeam == 0,
                );
                final team2 = CurlingTeam(
                  name: context.l10n.teamNameYellow,
                  color: Constants.yellowTeamColor,
                  textColor: Constants.textDefaultColor,
                  hasHammer: settingsHammerTeam == 1,
                  hadLastStoneFirstEnd: settingsHammerTeam == 1,
                );

                final newCurlingGame = CurlingGame(
                  team1: team1,
                  team2: team2,
                  numberOfEnds: settingsTotalEnds,
                  numberOfPlayersPerTeam: settingsNumberOfPlayersPerTeam,
                );

                Navigator.pop(context, newCurlingGame);
              },
              child: Text(
                context.l10n.gameStartDialogButtonLabelStartGame,
                style: const TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  String _printDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60).abs());
    twoDigits(duration.inSeconds.remainder(60).abs());
    return '${twoDigits(duration.inHours)}:$twoDigitMinutes';
  }
}

class GameStartSegmentControlText extends StatelessWidget {
  const GameStartSegmentControlText({
    required this.text,
    this.subtext = '',
    super.key,
  });

  final String text;
  final String subtext;

  @override
  Widget build(BuildContext context) {
    if (subtext == '') {
      return basicText(text);
    } else {
      return Column(
        children: [
          basicText(text),
          Text(
            subtext,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ],
      );
    }
  }

  Text basicText(String text) {
    return Text(
      text,
      style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
    );
  }
}
