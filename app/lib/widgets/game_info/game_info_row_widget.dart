import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:flutter/material.dart';

class GameInfoRowWidget extends StatelessWidget {
  const GameInfoRowWidget({
    required this.gameTime,
    required this.gameTimeOverUnder,
    super.key,
  });

  final Duration gameTime;
  final Duration gameTimeOverUnder;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Expanded(
          child: FittedBox(
            child: Text(
              context.l10n.gameInfoGameTimeLabel(_printDuration(gameTime)),
            ),
          ),
        ),
        Expanded(
          child: FittedBox(
            child: RichText(
              text: TextSpan(
                children: [
                  const TextSpan(
                    text: '+',
                    style: TextStyle(color: Colors.red),
                  ),
                  const TextSpan(text: '/'),
                  const TextSpan(
                    text: '-   ',
                    style: TextStyle(color: Colors.green),
                  ),
                  TextSpan(
                    text: _printDuration(gameTimeOverUnder),
                    style: TextStyle(
                      color: gameTimeOverUnder.isNegative
                          ? Colors.green
                          : Colors.red,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

String _printDuration(Duration duration) {
  String twoDigits(int n) => n.toString().padLeft(2, '0');
  final twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60).abs());
  final twoDigitSeconds = twoDigits(duration.inSeconds.remainder(60).abs());
  return '${twoDigits(duration.inHours)}:$twoDigitMinutes:$twoDigitSeconds';
}
