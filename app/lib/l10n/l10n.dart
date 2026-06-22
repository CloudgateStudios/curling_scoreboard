import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:flutter/material.dart';

export 'package:curling_scoreboard/l10n/app_localizations.dart';

extension BuildContextL10n on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}
