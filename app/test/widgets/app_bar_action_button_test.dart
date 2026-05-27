import 'package:curling_scoreboard_flutter/widgets/app_bar/app_bar_action_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('AppBarActionButton renders with label', (
    tester,
  ) async {
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppBarActionButton(
            icon: Icons.add,
            label: 'Add',
            onPressed: () => tapped = true,
          ),
        ),
      ),
    );
    expect(find.text('Add'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);
    await tester.tap(find.byType(AppBarActionButton));
    expect(tapped, isTrue);
  });

  testWidgets('AppBarActionButton renders without label', (
    tester,
  ) async {
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppBarActionButton(
            icon: Icons.add,
            onPressed: () => tapped = true,
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.add), findsOneWidget);
    await tester.tap(find.byType(AppBarActionButton));
    expect(tapped, isTrue);
  });
}
