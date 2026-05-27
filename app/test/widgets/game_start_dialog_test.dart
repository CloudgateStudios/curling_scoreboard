import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:curling_scoreboard_flutter/src/version.dart';
import 'package:curling_scoreboard_flutter/widgets/game_start/game_start_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('GameStartDialog displays version number', (tester) async {
    tester.view.physicalSize = const Size(3000, 1000);
    tester.view.devicePixelRatio = 1.0;

    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: [
          Locale('en', ''),
        ],
        home: GameStartDialog(),
      ),
    );

    expect(find.text('v$packageVersion'), findsOneWidget);

    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  });
}
