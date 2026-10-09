import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/l10n/app_localizations_en.dart';
import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/game_start/league_matchup_picker.dart';
import 'package:curling_scoreboard/widgets/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Sizes the scoreboard is realistically run at, plus the default test
/// surface. The dialog used to overflow on everything below about 2100
/// logical pixels wide.
const _displaySizes = <String, Size>{
  'default test surface': Size(800, 600),
  '720p': Size(1280, 720),
  'iPad Pro 12.9': Size(1366, 1024),
  '1080p': Size(1920, 1080),
  '1440p': Size(2560, 1440),
};

void main() {
  group('GameStartDialog layout', () {
    _displaySizes.forEach((label, size) {
      testWidgets('does not overflow at $label', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();

        await tester.pumpWidget(
          CurlingScoreboardApp(registrationService: RegistrationService(prefs)),
        );
        await tester.pumpAndSettle();

        expect(find.byType(GameStartDialog), findsOneWidget);
        expect(tester.takeException(), isNull);

        // The Start Game button has to be reachable to begin a game.
        await tester.tap(find.text('Start Game'));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byType(GameStartDialog), findsNothing);
      });
    });
  });

  group('GameStartDialog fills the screen', () {
    // A Galaxy Tab A8 in landscape, with and without Android's bars.
    for (final size in const [Size(1280, 800), Size(1280, 728)]) {
      testWidgets('with controls lined up at $size', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: GameStartDialog(
              leagues: [
                League.tryParse('l', {'name': 'Monday Night'})!,
              ],
            ),
          ),
        );
        expect(tester.takeException(), isNull);
        expect(tester.getSize(find.byType(GameStartDialog)), size);

        // 2 and 4 are both a number of ends and a number of players; the
        // ends row comes first.
        Rect segment(String text, {bool last = false}) {
          final cells = find.ancestor(
            of: find.widgetWithText(GameStartSegmentControlText, text),
            matching: find.byType(InkWell),
          );
          return tester.getRect(last ? cells.last : cells.first);
        }

        // Each control starts and ends where the others do, however many
        // segments it has, and its segments are the same width.
        final left = segment('2').left;
        final right = segment('10').right;
        expect(segment('0').left, left);
        expect(
          segment('4', last: true).right,
          moreOrLessEquals(right, epsilon: 1),
        );
        expect(segment('Red').left, left);
        expect(segment('Yellow').right, moreOrLessEquals(right, epsilon: 1));
        expect(
          segment('Red').width,
          moreOrLessEquals(segment('Yellow').width, epsilon: 1),
        );
        expect(
          segment('6').width,
          moreOrLessEquals(segment('10').width, epsilon: 1),
        );

        // The league bar spans the same width as the rows under it.
        final bar = tester.getRect(
          find
              .ancestor(
                of: find.text('Pick teams'),
                matching: find.byType(Material),
              )
              .first,
        );
        expect(bar.right, moreOrLessEquals(right, epsilon: 1));

        // Controls are comfortably larger than a minimum touch target.
        expect(segment('8').height, greaterThan(100));
      });
    }
  });

  group('LeagueMatchupPicker', () {
    League leagueOf(int teams) => League.tryParse('l', {
      'name': 'League',
      'teams': [
        for (var i = 1; i <= teams; i++) {'id': 't$i', 'name': 'Team $i'},
      ],
    })!;

    Future<Size> teamButtonSize(WidgetTester tester, int teams) async {
      tester.view.physicalSize = const Size(1280, 728);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: LeagueMatchupPicker(
            league: leagueOf(teams),
            rockColors: RockColors.defaults(AppLocalizationsEn()),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      return tester.getSize(find.widgetWithText(ElevatedButton, 'Team 1'));
    }

    testWidgets('gives team buttons the same size in a league of 3 as in '
        'one of 13', (tester) async {
      final few = await teamButtonSize(tester, 3);
      final many = await teamButtonSize(tester, 13);
      final full = await teamButtonSize(tester, 16);
      expect(few, many);
      expect(few, full);
    });

    testWidgets('still fits a league too big for the usual grid', (
      tester,
    ) async {
      final usual = await teamButtonSize(tester, 13);
      final big = await teamButtonSize(tester, 22);
      expect(big.width, lessThan(usual.width));
      // Every team is on screen.
      final last = tester.getRect(
        find.widgetWithText(ElevatedButton, 'Team 22'),
      );
      expect(last.bottom, lessThan(728));
    });
  });

  group('GameStartDialog layout for a league game', () {
    // Long names and the largest league expected, which is what stretches
    // the setup screen and the team picker.
    final league = League.tryParse('monday', {
      'name': 'Monday Night Competitive League',
      'draws': [
        {'day': 1, 'start': '18:30', 'end': '20:30'},
      ],
      'teams': [
        for (var i = 1; i <= 13; i++)
          {
            'id': 't$i',
            'name':
                'Team ${i.toString().padLeft(2, '0')} of '
                'the Sweeping Beauties',
          },
      ],
    })!;

    _displaySizes.forEach((label, size) {
      testWidgets('does not overflow at $label', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: GameStartDialog(
              leagues: [league],
              now: () => DateTime(2026, 10, 5, 19),
            ),
          ),
        );

        Future<void> tap(String text) async {
          await tester.tap(find.text(text));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }

        await tap('Pick teams');
        // All of the league's teams are on screen at once, without
        // scrolling.
        expect(find.byType(Scrollable), findsOneWidget);
        for (var i = 1; i <= 13; i++) {
          final name =
              'Team ${i.toString().padLeft(2, '0')} of the '
              'Sweeping Beauties';
          final tile = tester.getRect(
            find.widgetWithText(ElevatedButton, name),
          );
          expect(Offset.zero & size, _contains(tile), reason: name);
        }

        await tester.tap(
          find.widgetWithText(
            ElevatedButton,
            'Team 01 of the Sweeping Beauties',
          ),
        );
        await tester.tap(
          find.widgetWithText(
            ElevatedButton,
            'Team 13 of the Sweeping Beauties',
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tap('Done');
        await tester.pump(GameStartDialog.pickerGuardDuration);

        // Both names are on the setup screen and the game can be started.
        expect(find.text('Team 13 of the Sweeping Beauties'), findsNWidgets(2));
        await tap('Start Game');
      });
    });
  });
}

Matcher _contains(Rect inner) => predicate<Rect>(
  (outer) =>
      outer.left <= inner.left &&
      outer.top <= inner.top &&
      outer.right >= inner.right &&
      outer.bottom >= inner.bottom,
  'contains $inner',
);
