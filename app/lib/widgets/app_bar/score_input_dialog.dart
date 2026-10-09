import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';
import 'package:material_segmented_control/material_segmented_control.dart';

class ScoreInputDialog extends StatelessWidget {
  const ScoreInputDialog({
    required this.defaultScore,
    required this.end,
    this.defaultTeam,
    this.rockColors,
    this.team1Name,
    this.team2Name,
    super.key,
  });

  /// The rock colors of the game being scored. Red and yellow when null.
  final RockColors? rockColors;

  /// The names of the teams playing, shown under their rock colors. Left out
  /// when null or just the color again, as in a game outside a league.
  final String? team1Name;
  final String? team2Name;

  final int end;
  final ScoringTeam? defaultTeam;
  final int defaultScore;

  @override
  Widget build(BuildContext context) {
    var selectedTeam = defaultTeam;
    int? currentTeamSelectedIndex;

    if (defaultTeam != null) {
      currentTeamSelectedIndex = defaultTeam == ScoringTeam.team1 ? 0 : 1;
    }

    var selectedScore = defaultScore;
    var currentScoreSelectedIndex = defaultScore;

    final colors = rockColors ?? RockColors.defaults(context.l10n);

    final teamNames = {
      0: Padding(
        padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: EnterEditScoreDialogTeamText(
          team: colors.team1.name,
          teamName: team1Name,
        ),
      ),
      1: EnterEditScoreDialogTeamText(
        team: colors.team2.name,
        teamName: team2Name,
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
          title: Text(context.l10n.scoreInputDialogTitle(end.toString())),
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
                        ? colors.team1.color
                        : colors.team2.color,
                    unselectedColor: Colors.white,
                    selectedTextStyle: TextStyle(
                      color: currentTeamSelectedIndex == 0
                          ? colors.team1.textColor
                          : colors.team2.textColor,
                    ),
                    unselectedTextStyle: const TextStyle(color: Colors.black),
                    borderWidth: 1,
                    borderRadius: 20,
                    horizontalPadding: const EdgeInsets.all(10),
                    verticalOffset: 25,
                    onSegmentTapped: (index) {
                      setState(() {
                        currentTeamSelectedIndex = index;
                        selectedTeam = index == 0
                            ? ScoringTeam.team1
                            : ScoringTeam.team2;
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
                        scoringTeam: selectedScore > 0 ? selectedTeam : null,
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
  const EnterEditScoreDialogTeamText({
    required this.team,
    this.teamName,
    super.key,
  });

  /// The team's rock color.
  final String team;

  /// The team's own name, shown smaller under the color when it has one.
  final String? teamName;

  @override
  Widget build(BuildContext context) {
    final color = Text(
      team,
      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
    );

    final name = teamName;
    if (name == null || name.isEmpty || name == team) {
      return color;
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        color,
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 260),
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 18),
          ),
        ),
      ],
    );
  }
}
