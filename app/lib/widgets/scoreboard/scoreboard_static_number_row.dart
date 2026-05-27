import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:flutter/material.dart';

class ScoreboardStaticNumberRow extends StatelessWidget {
  const ScoreboardStaticNumberRow({
    required this.upperLimit,
    required this.needExtra,
    required this.containerColor,
    required this.onPressed,
    super.key,
  });

  final int upperLimit;
  final bool needExtra;
  final Color containerColor;
  final void Function(int) onPressed;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final numberOfEntries = upperLimit + (needExtra ? 1 : 0);
    final endContainerWidth = screenWidth / numberOfEntries;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...List.generate(numberOfEntries, (index) => index + 1).map(
          (currentNumber) => InkWell(
            child: StaticNumberContainer(
              number: (currentNumber != numberOfEntries)
                  ? currentNumber.toString()
                  : AppLocalizations.of(context)!.scoreboardExtraEndLabel,
              width: endContainerWidth,
              containerColor: containerColor,
            ),
            onTap: () {
              onPressed(currentNumber);
            },
          ),
        ),
      ],
    );
  }
}

class StaticNumberContainer extends StatelessWidget {
  const StaticNumberContainer({
    required this.number,
    required this.width,
    required this.containerColor,
    super.key,
  });

  final String number;
  final double width;
  final Color containerColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      width: width,
      decoration: BoxDecoration(color: containerColor),
      child: Text(
        number,
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
    );
  }
}
