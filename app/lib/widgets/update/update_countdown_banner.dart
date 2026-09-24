import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Tells anyone at the scoreboard that it is about to reload onto a new
/// version, and that touching it will hold the reload off.
class UpdateCountdownBanner extends StatelessWidget {
  const UpdateCountdownBanner({required this.secondsLeft, super.key});

  final ValueListenable<int> secondsLeft;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Material(
          elevation: 6,
          borderRadius: BorderRadius.circular(12),
          color: Theme.of(context).colorScheme.inverseSurface,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ValueListenableBuilder<int>(
              valueListenable: secondsLeft,
              builder: (context, seconds, _) => Text(
                context.l10n.updateCountdownMessage(seconds),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onInverseSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
