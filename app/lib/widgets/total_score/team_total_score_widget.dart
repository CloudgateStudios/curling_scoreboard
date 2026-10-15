import 'dart:math';

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
    this.teamName,
    this.onTeamNamePressed,
    this.innerClearance = 0,
    super.key,
  });

  final String score;
  final Color backgroundColor;
  final Color textColor;
  final bool shouldShowHammerIcon;
  final bool shouldShowLSFEIcon;
  final TeamHammerIconPosition hammerIconPosition;
  final LSFEIconPosition lsfeIconPosition;

  /// Shown under the score, in the space below the digits, so it never
  /// takes room from them. Nothing is shown when null.
  final String? teamName;
  final VoidCallback? onTeamNamePressed;

  /// How far the end number reaches in from the inner edge, the one facing
  /// the other team. The score and name keep clear of it.
  final double innerClearance;

  static const _iconSize = 150.0;
  static const _iconInset = 10.0;

  /// Kept clear down the outer edge, where the hammer and last stone first
  /// end icons sit.
  static const double _outerClearance = _iconSize + _iconInset * 2;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final teamTotalScoreContainerWidth = screenWidth / 2;

    return Stack(
      children: [
        Container(
          color: backgroundColor,
          width: teamTotalScoreContainerWidth,
          padding: hammerIconPosition == TeamHammerIconPosition.left
              ? EdgeInsets.only(left: _outerClearance, right: innerClearance)
              : EdgeInsets.only(left: innerClearance, right: _outerClearance),
          child: LayoutBuilder(builder: _buildScoreAndName),
        ),
        if (shouldShowHammerIcon)
          Positioned(
            top: _iconInset,
            left: (hammerIconPosition == TeamHammerIconPosition.left)
                ? _iconInset
                : null,
            right: (hammerIconPosition == TeamHammerIconPosition.right)
                ? _iconInset
                : null,
            child: Icon(
              Icons.hardware_sharp,
              color: textColor,
              size: _iconSize,
            ),
          ),
        if (shouldShowLSFEIcon)
          Positioned(
            bottom: _iconInset,
            left: (lsfeIconPosition == LSFEIconPosition.left)
                ? _iconInset
                : null,
            right: (lsfeIconPosition == LSFEIconPosition.right)
                ? _iconInset
                : null,
            child: Icon(Icons.emergency, color: textColor, size: _iconSize),
          ),
      ],
    );
  }

  /// The score as large as the space between the icons and the end number
  /// allows. Its line is exactly the font's
  /// height, which still holds every digit, so the digits fill the space
  /// rather than the padding of the theme's taller text lines.
  Widget _buildScoreAndName(BuildContext context, BoxConstraints constraints) {
    const probe = 100.0;
    final style = DefaultTextStyle.of(context).style.merge(
      TextStyle(
        color: textColor,
        fontWeight: FontWeight.bold,
        fontSize: probe,
        height: 1,
      ),
    );
    final painter = TextPainter(
      text: TextSpan(text: score, style: style),
      textDirection: TextDirection.ltr,
      textScaler: TextScaler.noScaling,
    )..layout();
    final ascent = painter.computeLineMetrics().single.ascent;

    final height = constraints.maxHeight;
    final scale = min(
      height / painter.height,
      constraints.maxWidth / painter.width,
    );
    // Digits sit on the baseline, so everything below it is free. A score
    // as tall as the space puts it here; a wide score that is shorter sits
    // higher, so both teams' names can share this line.
    final nameTop = height * ascent / painter.height;
    painter.dispose();

    final name = teamName;
    return Stack(
      children: [
        Center(
          child: Text(
            score,
            textScaler: TextScaler.noScaling,
            style: style.copyWith(fontSize: probe * scale),
          ),
        ),
        if (name != null)
          Positioned(
            left: 0,
            right: 0,
            top: nameTop,
            bottom: 0,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onTeamNamePressed,
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: height * 0.02),
                // A long team name shrinks to one line instead of wrapping.
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    name,
                    style: TextStyle(
                      color: textColor,
                      fontSize: 64,
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
