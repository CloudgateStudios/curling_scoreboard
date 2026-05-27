import 'package:flutter/material.dart';

class ScoreboardTeamScoreRow extends StatelessWidget {
  const ScoreboardTeamScoreRow({
    required this.upperLimit,
    required this.needExtra,
    required this.scores,
    required this.emptyScoreBackgroundColor,
    required this.filledScoreBackgroundColor,
    required this.scoreTextColor,
    required this.scoreTextHighContrastColor,
    required this.onPressed,
    super.key,
  });

  final int upperLimit;
  final bool needExtra;
  final List<int> scores;
  final Color emptyScoreBackgroundColor;
  final Color filledScoreBackgroundColor;
  final Color scoreTextColor;
  final Color scoreTextHighContrastColor;
  final void Function(int) onPressed;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final numberOfEntries = upperLimit + (needExtra ? 1 : 0);
    final endContainerWidth = screenWidth / numberOfEntries;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...List.generate(numberOfEntries, (index) {
          var textColor = scoreTextColor;

          if (scores.isNotEmpty && index < scores.length) {
            textColor = findSafeTextColor(
              (scores[index] == 0)
                  ? emptyScoreBackgroundColor
                  : filledScoreBackgroundColor,
            );
          }

          if (index < scores.length) {
            return ScoreContainer(
              endNumber: index + 1,
              score: scores[index],
              backgroundColor: (scores[index] == 0)
                  ? emptyScoreBackgroundColor
                  : filledScoreBackgroundColor,
              textColor: textColor,
              width: endContainerWidth,
              onPressed: onPressed,
            );
          } else {
            return ScoreContainer(
              endNumber: -1,
              score: -1,
              backgroundColor: emptyScoreBackgroundColor,
              textColor: textColor,
              width: endContainerWidth,
              onPressed: onPressed,
            );
          }
        }),
      ],
    );
  }

  Color findSafeTextColor(Color backgroundColor) {
    final luminance = backgroundColor.computeLuminance();
    return (luminance > 0.5) ? scoreTextColor : scoreTextHighContrastColor;
  }
}

class ScoreContainer extends StatelessWidget {
  const ScoreContainer({
    required this.endNumber,
    required this.score,
    required this.backgroundColor,
    required this.textColor,
    required this.width,
    required this.onPressed,
    super.key,
  });

  final int endNumber;
  final int score;
  final Color backgroundColor;
  final Color textColor;
  final double width;
  final void Function(int) onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      child: Container(
        alignment: Alignment.center,
        width: width,
        decoration: BoxDecoration(color: backgroundColor),
        child: Text(
          (score == -1) ? '' : score.toString(),
          style: TextStyle(
            fontSize: 40,
            fontWeight: FontWeight.bold,
            color: textColor,
          ),
        ),
      ),
      onTap: () {
        onPressed(endNumber);
      },
    );
  }
}
