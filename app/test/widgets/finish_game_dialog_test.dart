import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/widgets/app_bar/finish_game_dialog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Widget wrapWithMaterialApp(Widget child) {
  return MaterialApp(
    localizationsDelegates: appLocalizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: child),
  );
}

void main() {
  testWidgets('FinishGameDialog renders confirmation and buttons', (
    tester,
  ) async {
    var finished = false;
    await tester.pumpWidget(
      wrapWithMaterialApp(
        FinishGameDialog(finishGameAction: (_) => finished = true),
      ),
    );
    expect(find.textContaining('Are you sure'), findsOneWidget);
    expect(find.text('Yes'), findsOneWidget);
    expect(find.text('No'), findsOneWidget);
    await tester.tap(find.text('Yes'));
    expect(finished, isTrue);
  });
}
