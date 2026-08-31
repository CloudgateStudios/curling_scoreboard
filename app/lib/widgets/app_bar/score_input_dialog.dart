import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';
import 'package:material_segmented_control/material_segmented_control.dart';

class ScoreInputDialog extends StatelessWidget {
  const ScoreInputDialog({
    required this.defaultScore,
    required this.end,
    this.defaultTeam,
    super.key,
  });

  final int end;
  final String? defaultTeam;
  final int defaultScore;

  @override
  Widget build(BuildContext context) {
    var selectedTeam = defaultTeam;
    int? currentTeamSelectedIndex;

    if (defaultTeam != null) {
      currentTeamSelectedIndex = defaultTeam == context.l10n.teamNameRed
          ? 0
          : 1;
    }

    var selectedScore = defaultScore;
    var currentScoreSelectedIndex = defaultScore;

    final teamNames = {
      0: Padding(
        padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: EnterEditScoreDialogTeamText(
          team: context.l10n.teamNameRed,
        ),
      ),
      1: EnterEditScoreDialogTeamText(
        team: context.l10n.teamNameYellow,
      ),
    };

    final scoreItems = {
      0: const Padding(
        padding: EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: EnterEditScoreDialogScoreText(score: '0'),
      ),
      1: const EnterEditScoreDialogScoreText(score: '1'),
      2: const EnterEditScoreDialogScoreText(score: '2'),
      3: const EnterEditScoreDialogScoreText(score: '3'),
      4: const EnterEditScoreDialogScoreText(score: '4'),
      5: const EnterEditScoreDialogScoreText(score: '5'),
      6: const EnterEditScoreDialogScoreText(score: '6'),
      7: const EnterEditScoreDialogScoreText(score: '7'),
      8: const EnterEditScoreDialogScoreText(score: '8'),
    };

    return StatefulBuilder(
      builder: (context, setState) {
        return AlertDialog(
          title: Text(
            context.l10n.scoreInputDialogTitle(end.toString()),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              MaterialSegmentedControl(
                children: scoreItems,
                selectionIndex: currentScoreSelectedIndex,
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
                    currentScoreSelectedIndex = index;
                    selectedScore = index;

                    if (selectedScore == 0) {
                      selectedTeam = null;
                      currentTeamSelectedIndex = null;
                    }
                  });
                },
              ),
              Opacity(
                opacity: selectedScore > 0 ? 1.0 : 0.3,
                child: AbsorbPointer(
                  absorbing: selectedScore == 0,
                  child: MaterialSegmentedControl(
                    children: teamNames,
                    selectionIndex: currentTeamSelectedIndex,
                    borderColor: Colors.grey,
                    selectedColor: currentTeamSelectedIndex == 0
                        ? Constants.redTeamColor
                        : Constants.yellowTeamColor,
                    unselectedColor: Colors.white,
                    selectedTextStyle: const TextStyle(color: Colors.white),
                    unselectedTextStyle: const TextStyle(color: Colors.black),
                    borderWidth: 1,
                    borderRadius: 20,
                    horizontalPadding: const EdgeInsets.all(10),
                    verticalOffset: 25,
                    onSegmentTapped: (index) {
                      setState(() {
                        currentTeamSelectedIndex = index;

                        index == 0
                            ? selectedTeam = context.l10n.teamNameRed
                            : selectedTeam = context.l10n.teamNameYellow;
                      });
                    },
                  ),
                ),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: (selectedScore > 0 && selectedTeam == null)
                  ? null
                  : () {
                      final newEnd = CurlingEnd(
                        endNumber: end,
                        // A blank end has no scoring team. selectedTeam is
                        // seeded with the team holding the hammer so the
                        // control has something sensible selected, so it has
                        // to be dropped when nothing was actually scored.
                        scoringTeamName: selectedScore > 0
                            ? selectedTeam
                            : null,
                        score: selectedScore,
                      );

                      Navigator.pop(context, newEnd);
                    },
              child: Text(
                context.l10n.scoreInputEnterButtonLabel,
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
}

class EnterEditScoreDialogScoreText extends StatelessWidget {
  const EnterEditScoreDialogScoreText({required this.score, super.key});

  final String score;

  @override
  Widget build(BuildContext context) {
    return Text(
      score,
      style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
    );
  }
}

class EnterEditScoreDialogTeamText extends StatelessWidget {
  const EnterEditScoreDialogTeamText({required this.team, super.key});

  final String team;

  @override
  Widget build(BuildContext context) {
    return Text(
      team,
      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
    );
  }
}
