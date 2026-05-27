import 'package:curling_scoreboard_flutter/widgets/total_score/total_score.dart';
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

  @override
  Widget build(BuildContext context) {
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
            ),
            TeamTotalScoreWidget(
              score: team2Score.toString(),
              backgroundColor: team2Color,
              textColor: team2TextColor,
              shouldShowHammerIcon: team2HasHammer,
              shouldShowLSFEIcon: team2HasLSFE,
            ),
          ],
        ),
        Align(
          child: FractionallySizedBox(
            widthFactor: 0.125,
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
