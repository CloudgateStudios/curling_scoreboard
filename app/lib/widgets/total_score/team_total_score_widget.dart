import 'package:flutter/material.dart';

enum TeamHammerIconPosition { left, right }

enum LSFEIconPosition { left, right }

class TeamTotalScoreWidget extends StatelessWidget {
  const TeamTotalScoreWidget({
    required this.score,
    required this.backgroundColor,
    this.textColor = Colors.black,
    this.shouldShowHammerIcon = false,
    this.shouldShowLSFEIcon = false,
    this.hammerIconPosition = TeamHammerIconPosition.right,
    this.lsfeIconPosition = LSFEIconPosition.right,
    super.key,
  });

  final String score;
  final Color backgroundColor;
  final Color textColor;
  final bool shouldShowHammerIcon;
  final bool shouldShowLSFEIcon;
  final TeamHammerIconPosition hammerIconPosition;
  final LSFEIconPosition lsfeIconPosition;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final teamTotalScoreContainerWidth = screenWidth / 2;

    return Stack(
      children: [
        Container(
          color: backgroundColor,
          width: teamTotalScoreContainerWidth,
          child: FittedBox(
            child: Text(
              score,
              textAlign: TextAlign.center,
              style: TextStyle(color: textColor, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        if (shouldShowHammerIcon)
          Positioned(
            top: 10,
            left: (hammerIconPosition == TeamHammerIconPosition.left)
                ? 10
                : null,
            right: (hammerIconPosition == TeamHammerIconPosition.right)
                ? 10
                : null,
            child: Icon(Icons.hardware_sharp, color: textColor, size: 150),
          ),
        if (shouldShowLSFEIcon)
          Positioned(
            bottom: 10,
            left: (lsfeIconPosition == LSFEIconPosition.left) ? 10 : null,
            right: (lsfeIconPosition == LSFEIconPosition.right) ? 10 : null,
            child: Icon(Icons.emergency, color: textColor, size: 150),
          ),
      ],
    );
  }
}
