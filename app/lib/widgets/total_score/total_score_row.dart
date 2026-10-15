import 'package:curling_scoreboard/widgets/total_score/total_score.dart';
import 'package:flutter/material.dart';

class TotalScoreRow extends StatelessWidget {
  const TotalScoreRow({
    required this.team1Score,
    required this.team1Color,
    required this.team1TextColor,
    required this.team1HasHammer,
    required this.team1HasLSFE,
    required this.team2Score,
    required this.team2Color,
    required this.team2TextColor,
    required this.team2HasHammer,
    required this.team2HasLSFE,
    required this.endNumber,
    this.team1Name,
    this.team2Name,
    this.onTeamNamePressed,
    super.key,
  });

  final int team1Score;
  final Color team1Color;
  final Color team1TextColor;
  final bool team1HasHammer;
  final bool team1HasLSFE;
  final int team2Score;
  final Color team2Color;
  final Color team2TextColor;
  final bool team2HasHammer;
  final bool team2HasLSFE;
  final String endNumber;

  /// Each team's name, shown under its score. Null to show none.
  final String? team1Name;
  final String? team2Name;
  final VoidCallback? onTeamNamePressed;

  /// How much of the row's width the end number takes, in the middle.
  static const _endNumberWidthFactor = 0.125;

  @override
  Widget build(BuildContext context) {
    // Half the end number reaches into each team's side, plus a gap.
    final innerClearance =
        MediaQuery.of(context).size.width * _endNumberWidthFactor / 2 + 10;

    return Stack(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            TeamTotalScoreWidget(
              score: team1Score.toString(),
              backgroundColor: team1Color,
              textColor: team1TextColor,
              shouldShowHammerIcon: team1HasHammer,
              shouldShowLSFEIcon: team1HasLSFE,
              hammerIconPosition: TeamHammerIconPosition.left,
              lsfeIconPosition: LSFEIconPosition.left,
              teamName: team1Name,
              onTeamNamePressed: onTeamNamePressed,
              innerClearance: innerClearance,
            ),
            TeamTotalScoreWidget(
              score: team2Score.toString(),
              backgroundColor: team2Color,
              textColor: team2TextColor,
              shouldShowHammerIcon: team2HasHammer,
              shouldShowLSFEIcon: team2HasLSFE,
              teamName: team2Name,
              onTeamNamePressed: onTeamNamePressed,
              innerClearance: innerClearance,
            ),
          ],
        ),
        Align(
          child: FractionallySizedBox(
            widthFactor: _endNumberWidthFactor,
            heightFactor: 0.7,
            child: FittedBox(
              fit: BoxFit.fitHeight,
              child: ColoredBox(
                color: Colors.white,
                child: Text(
                  endNumber,
                  style: const TextStyle(
                    color: Colors.black,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
