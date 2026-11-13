import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:material_ui/material_ui.dart';

export 'package:curling_scoreboard/l10n/app_localizations.dart';

/// The delegates every `MaterialApp` here uses: the scoreboard's own text,
/// then the text `material_ui` widgets need, such as tooltips and the time
/// picker.
///
/// `AppLocalizations.localizationsDelegates` is not enough on its own. The
/// generated file still lists the old delegates from `flutter_localizations`,
/// which `material_ui` widgets never read, until gen-l10n learns about the new
/// packages (https://github.com/flutter/flutter/issues/191072).
const List<LocalizationsDelegate<dynamic>> appLocalizationsDelegates = [
  AppLocalizations.delegate,
  ...GlobalMaterialLocalizations.delegates,
];

extension BuildContextL10n on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}
