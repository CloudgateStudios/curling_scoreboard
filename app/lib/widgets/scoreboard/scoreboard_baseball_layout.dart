import 'package:curling_scoreboard_flutter/constants.dart';
import 'package:curling_scoreboard_flutter/widgets/scoreboard/scoreboard.dart';
import 'package:flutter/material.dart';

class ScoreboardBaseballLayout extends StatelessWidget {
  const ScoreboardBaseballLayout({
    required this.numberOfEnds,
    required this.endsContainerColor,
    required this.team1Scores,
    required this.team2Scores,
    required this.team1FilledColor,
    required this.team2FilledColor,
    required this.onPressed,
    super.key,
  });

  final int numberOfEnds;
  final Color endsContainerColor;
  final List<int> team1Scores;
  final List<int> team2Scores;
  final Color team1FilledColor;
  final Color team2FilledColor;
  final void Function(int) onPressed;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Flexible(
          child: ScoreboardStaticNumberRow(
            upperLimit: numberOfEnds,
            needExtra: true,
            containerColor: endsContainerColor,
            onPressed: onPressed,
          ),
        ),
        Flexible(
          flex: 3,
          child: ScoreboardTeamScoreRow(
            upperLimit: numberOfEnds,
            needExtra: true,
            scores: team1Scores,
            emptyScoreBackgroundColor: Constants.emptyScoreColor,
            filledScoreBackgroundColor: team1FilledColor,
            scoreTextColor: Constants.textDefaultColor,
            scoreTextHighContrastColor: Constants.textHighContrastColor,
            onPressed: onPressed,
          ),
        ),
        Flexible(
          flex: 3,
          child: ScoreboardTeamScoreRow(
            upperLimit: numberOfEnds,
            needExtra: true,
            scores: team2Scores,
            emptyScoreBackgroundColor: Constants.emptyScoreColor,
            filledScoreBackgroundColor: team2FilledColor,
            scoreTextColor: Constants.textDefaultColor,
            scoreTextHighContrastColor: Constants.textHighContrastColor,
            onPressed: onPressed,
          ),
        ),
      ],
    );
  }
}
